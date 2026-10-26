from __future__ import annotations
import base64, hashlib, hmac, json, secrets, time
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from .config import JWT_SECRET, JWT_TTL_MINUTES
from .database import get_db
from .models import User

bearer = HTTPBearer(auto_error=False)

def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')

def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), bytes.fromhex(salt), 310_000)
    return f'pbkdf2_sha256$310000${salt}${digest.hex()}'

def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, iterations, salt, digest = stored.split('$', 3)
        if scheme != 'pbkdf2_sha256':
            return False
        candidate = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), bytes.fromhex(salt), int(iterations)).hex()
        return hmac.compare_digest(candidate, digest)
    except (ValueError, TypeError):
        return False

def create_access_token(user: User) -> str:
    now = int(time.time())
    header = {'alg': 'HS256', 'typ': 'JWT'}
    payload = {'sub': str(user.id), 'username': user.username, 'role': user.role, 'iat': now, 'exp': now + JWT_TTL_MINUTES * 60}
    signing = f'{_b64(json.dumps(header, separators=(",", ":")).encode())}.{_b64(json.dumps(payload, separators=(",", ":")).encode())}'
    signature = hmac.new(JWT_SECRET.encode(), signing.encode(), hashlib.sha256).digest()
    return f'{signing}.{_b64(signature)}'

def decode_access_token(token: str) -> dict:
    try:
        head, payload, sig = token.split('.')
        signing = f'{head}.{payload}'
        expected = _b64(hmac.new(JWT_SECRET.encode(), signing.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(expected, sig):
            raise ValueError('bad signature')
        data = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
        if int(data.get('exp', 0)) < int(time.time()):
            raise ValueError('expired')
        return data
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid or expired access token', headers={'WWW-Authenticate': 'Bearer'}) from exc

def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail='Authentication required', headers={'WWW-Authenticate': 'Bearer'})
    payload = decode_access_token(credentials.credentials)
    user = db.get(User, int(payload['sub']))
    if not user or not user.active:
        raise HTTPException(status_code=401, detail='User is inactive or no longer exists')
    return user

def require_roles(*roles: str):
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail='Your account does not have permission to perform this action')
        return user
    return dependency

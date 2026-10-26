from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from ..database import get_db
from ..models import User
from ..schemas import LoginRequest
from ..security import verify_password, create_access_token, get_current_user

router = APIRouter(prefix='/api/auth', tags=['Authentication'])

@router.post('/login')
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not user.active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail='Invalid username or password')
    return {'access_token': create_access_token(user), 'token_type': 'bearer', 'user': {'id': user.id, 'username': user.username, 'role': user.role}}

@router.get('/me')
def me(user: User = Depends(get_current_user)):
    return {'id': user.id, 'username': user.username, 'role': user.role}

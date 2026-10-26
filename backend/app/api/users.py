from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User
from ..schemas import UserCreate, UserUpdate
from ..security import require_roles, hash_password
from ..services.audit import write_audit

router = APIRouter(prefix='/api/users', tags=['Users / permissions'])

@router.get('')
def list_users(db: Session = Depends(get_db), user: User = Depends(require_roles('admin'))):
    return [{'id': x.id, 'username': x.username, 'role': x.role, 'active': x.active,
             'created_at': x.created_at.isoformat() if x.created_at else None}
            for x in db.scalars(select(User).order_by(User.username)).all()]

@router.post('')
def create_user(payload: UserCreate, db: Session = Depends(get_db), user: User = Depends(require_roles('admin'))):
    if db.scalar(select(User).where(User.username == payload.username)):
        raise HTTPException(status_code=409, detail='Username already exists')
    record = User(username=payload.username, password_hash=hash_password(payload.password), role=payload.role, active=True)
    db.add(record); db.flush()
    write_audit(db, user.id, 'user.create', 'user', record.id, {'username': record.username, 'role': record.role})
    db.commit(); db.refresh(record)
    return {'id': record.id, 'username': record.username, 'role': record.role, 'active': record.active}

@router.patch('/{user_id}')
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db), user: User = Depends(require_roles('admin'))):
    record = db.get(User, user_id)
    if not record: raise HTTPException(status_code=404, detail='User not found')
    changes = payload.model_dump(exclude_unset=True)
    if user.id == record.id and changes.get('active') is False:
        raise HTTPException(status_code=422, detail='You cannot deactivate your own signed-in account.')
    for key, value in changes.items():
        if key == 'password': record.password_hash = hash_password(value)
        else: setattr(record, key, value)
    write_audit(db, user.id, 'user.update', 'user', record.id, {'fields_changed': sorted(changes.keys())})
    db.commit(); db.refresh(record)
    return {'id': record.id, 'username': record.username, 'role': record.role, 'active': record.active}

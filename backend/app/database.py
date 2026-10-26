from __future__ import annotations
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session
from .config import DATABASE_URL, DATA_DIR

class Base(DeclarativeBase):
    pass

connect_args = {'check_same_thread': False} if DATABASE_URL.startswith('sqlite') else {}
if DATABASE_URL.startswith('sqlite'):
    DATA_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()

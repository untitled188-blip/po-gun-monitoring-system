from __future__ import annotations
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

APP_DIR = Path(__file__).resolve().parent
BACKEND_DIR = APP_DIR.parent
PROJECT_DIR = BACKEND_DIR.parent
DATA_DIR = PROJECT_DIR / 'data'

APP_ENV = os.getenv('APP_ENV', 'development').strip().lower()
APP_NAME = os.getenv('APP_NAME', 'PO Gun Interactive Monitoring System')
DATABASE_URL = os.getenv('DATABASE_URL', f'sqlite:///{(DATA_DIR / "po_gun_mvp.db").as_posix()}')
JWT_SECRET = os.getenv('JWT_SECRET', 'DEV-ONLY-change-this-long-secret-before-deployment')
JWT_TTL_MINUTES = int(os.getenv('JWT_TTL_MINUTES', '480'))
ADMIN_USERNAME = os.getenv('ADMIN_USERNAME', 'admin')
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'ChangeMeNow!')
CORS_ORIGINS = [x.strip() for x in os.getenv('CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173').split(',') if x.strip()]
SOURCE_SNAPSHOT_PATH = DATA_DIR / 'source_snapshot.json'

if APP_ENV == 'production' and (JWT_SECRET.startswith('DEV-ONLY') or len(JWT_SECRET) < 32):
    raise RuntimeError('Production requires a strong JWT_SECRET of at least 32 characters.')
if APP_ENV == 'production' and ADMIN_PASSWORD == 'ChangeMeNow!':
    raise RuntimeError('Production requires a non-default ADMIN_PASSWORD.')

from __future__ import annotations
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from .config import APP_NAME, CORS_ORIGINS, APP_ENV, PROJECT_DIR, APP_DIR
from .database import Base, engine, SessionLocal
from .services.seed import bootstrap_database
from .api import auth, monitoring, actions, import_export, users

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(name)s %(message)s')
logger = logging.getLogger('po-gun-monitoring')

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        report = bootstrap_database(db)
        logger.info('Database ready: %s', report)
    finally:
        db.close()
    yield

app = FastAPI(title=APP_NAME, version='0.1.0', description='Interactive PO Gun factory monitoring API', lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_credentials=True, allow_methods=['*'], allow_headers=['*'])
app.include_router(auth.router)
app.include_router(monitoring.router)
app.include_router(actions.router)
app.include_router(import_export.router)
app.include_router(users.router)

@app.get('/api')
def api_root():
    return {'name': APP_NAME, 'version': app.version, 'docs': '/docs', 'status': 'ready'}

# Production can serve the prebuilt Vite app from the same process. During local development,
# run Vite on :5173; its proxy forwards /api requests to this service on :8000.
STATIC_DIR = PROJECT_DIR / 'frontend' / 'dist'
public_map = PROJECT_DIR / 'frontend' / 'public' / 'factory-map-source.png'
if STATIC_DIR.exists():
    app.mount('/assets', StaticFiles(directory=STATIC_DIR / 'assets'), name='assets')
    if public_map.exists():
        @app.get('/factory-map-source.png', include_in_schema=False)
        def factory_map_image():
            return FileResponse(public_map, media_type='image/png')
    @app.get('/{full_path:path}', include_in_schema=False)
    def serve_spa(full_path: str):
        if full_path.startswith('api/') or full_path == 'api':
            return HTMLResponse('API route not found', status_code=404)
        index = STATIC_DIR / 'index.html'
        if not index.exists():
            return HTMLResponse('Frontend build not found. Run npm run build in frontend/.', status_code=404)
        return FileResponse(index)
else:
    # No-build fallback: the same API can serve a lightweight, dependency-free UI.
    FALLBACK_STATIC = APP_DIR / 'static'
    app.mount('/static', StaticFiles(directory=FALLBACK_STATIC), name='fallback-static')
    if public_map.exists():
        @app.get('/factory-map-source.png', include_in_schema=False)
        def factory_map_image_fallback():
            return FileResponse(public_map, media_type='image/png')
    @app.get('/', include_in_schema=False)
    def serve_fallback_ui():
        index = FALLBACK_STATIC / 'index.html'
        return FileResponse(index) if index.exists() else HTMLResponse('Frontend build not found.', status_code=404)

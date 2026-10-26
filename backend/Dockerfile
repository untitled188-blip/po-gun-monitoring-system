# Build the React frontend, then serve it from FastAPI.
FROM node:22-alpine AS frontend-builder
WORKDIR /workspace/frontend
COPY frontend/package.json ./package.json
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/workspace/backend
WORKDIR /workspace/backend
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY data/ /workspace/data/
COPY docs/ /workspace/docs/
COPY frontend/public/factory-map-source.png /workspace/frontend/public/factory-map-source.png
COPY --from=frontend-builder /workspace/frontend/dist/ /workspace/frontend/dist/
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]

"""Integration tests use a disposable SQLite DB; no production database is touched."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB_PATH = Path('/tmp/po_gun_mvp_pytest.sqlite')
if DB_PATH.exists():
    DB_PATH.unlink()
os.environ['DATABASE_URL'] = f'sqlite:///{DB_PATH.as_posix()}'
os.environ['APP_ENV'] = 'test'
os.environ['ADMIN_USERNAME'] = 'admin'
os.environ['ADMIN_PASSWORD'] = 'TestAdminPass!2026'
os.environ['JWT_SECRET'] = 'test-secret-not-for-production-please-change'
sys.path.insert(0, str(ROOT / 'backend'))

from fastapi.testclient import TestClient
from app.main import app


def test_api_end_to_end_and_duplicate_guard():
    with TestClient(app) as client:
        home = client.get('/')
        assert home.status_code == 200
        assert 'PO Gun' in home.text
        assert client.get('/static/app.js').status_code == 200
        assert client.get('/factory-map-source.png').status_code == 200
        health = client.get('/api/health')
        assert health.status_code == 200
        login = client.post('/api/auth/login', json={'username': 'admin', 'password': 'TestAdminPass!2026'})
        assert login.status_code == 200
        headers = {'Authorization': f"Bearer {login.json()['access_token']}"}

        dashboard = client.get('/api/dashboard', headers=headers)
        assert dashboard.status_code == 200
        assert dashboard.json()['summary']['total'] == 206
        assert dashboard.json()['summary']['ok'] == 206
        assert dashboard.json()['summary']['ng'] == 0

        model_dashboard = client.get('/api/dashboard?model=CITY%204D', headers=headers).json()
        assert model_dashboard['summary']['total'] == 53
        equipment = client.get('/api/equipment?model=WR-V&limit=100', headers=headers).json()
        assert equipment['total'] == 53
        assert len(equipment['items']) == 53
        station_list = client.get('/api/stations?model=WR-V', headers=headers)
        assert station_list.status_code == 200 and len(station_list.json()) > 0
        csv_export = client.get('/api/export/equipment.csv?model=WR-V', headers=headers)
        assert csv_export.status_code == 200 and 'Car Model' in csv_export.text

        item = equipment['items'][-1]
        for route in [f"/api/stations/{item['process_pk']}?model=WR-V", f"/api/transformers/{item['transformer_pk']}?model=WR-V", f"/api/po-guns/{item['po_gun_pk']}?model=WR-V"]:
            response = client.get(route, headers=headers)
            assert response.status_code == 200, (route, response.text)
        payload = {
            'assignment_id': item['id'],
            'abnormal_parameter': 'Welding Current',
            'problem_description': 'Automated integration test — abnormal current',
            'corrective_action': 'Inspect and verify the measurement',
            'allow_duplicate': False,
        }
        created = client.post('/api/corrective-actions', headers=headers, json=payload)
        assert created.status_code == 200, created.text
        duplicate = client.post('/api/corrective-actions', headers=headers, json=payload)
        assert duplicate.status_code == 409

        reading = client.post(f"/api/equipment/{item['id']}/readings", headers=headers, json={
            'parameter_name': 'Welding Current', 'value': 999,
            'unit': item['current_unit'], 'observed_at': '2026-10-26T02:00:00Z',
            'note': 'Isolated integration test only',
        })
        assert reading.status_code == 200, reading.text
        assert reading.json()['equipment']['current_status'] == 'NG'

        wrong_unit = client.post(f"/api/equipment/{item['id']}/readings", headers=headers, json={
            'parameter_name': 'Pressure', 'value': 1,
            'unit': 'unconfirmed-unit', 'observed_at': '2026-10-26T02:01:00Z',
        })
        assert wrong_unit.status_code == 422

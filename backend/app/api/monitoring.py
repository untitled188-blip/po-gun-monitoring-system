from __future__ import annotations
from collections import Counter
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, or_
from sqlalchemy.orm import Session, joinedload
from ..database import get_db
from ..models import (CarModel, FactoryZone, ProcessStation, Transformer, PoGun,
                      EquipmentAssignment, ParameterReading, CorrectiveAction, ImportBatch, AuditLog, User)
from ..security import get_current_user, require_roles
from ..serializers import assignment_dict, action_dict
from ..services.status import recompute_assignment, evaluate_parameter_status, overall_status, deviation, deviation_percent
from ..services.audit import write_audit
from ..schemas import ReadingCreate, MapPositionUpdate, UnitUpdate

router = APIRouter(prefix='/api', tags=['Monitoring'])

EAGER_ASSIGNMENT = (
    joinedload(EquipmentAssignment.car_model), joinedload(EquipmentAssignment.zone),
    joinedload(EquipmentAssignment.process), joinedload(EquipmentAssignment.transformer),
    joinedload(EquipmentAssignment.po_gun),
)

def _assignment_query(db: Session):
    return select(EquipmentAssignment).options(*EAGER_ASSIGNMENT)

def _apply_filter(stmt, model=None, zone=None, process=None, transformer=None, gun=None, status_filter=None):
    if model:
        stmt = stmt.join(EquipmentAssignment.car_model).where(CarModel.name == model)
    if zone:
        stmt = stmt.join(EquipmentAssignment.zone).where(FactoryZone.name == zone)
    if process:
        stmt = stmt.join(EquipmentAssignment.process).where(ProcessStation.name == process)
    if transformer:
        stmt = stmt.join(EquipmentAssignment.transformer).where(Transformer.code == transformer)
    if gun:
        stmt = stmt.join(EquipmentAssignment.po_gun).where(PoGun.code == gun)
    if status_filter:
        stmt = stmt.where(EquipmentAssignment.overall_status == status_filter.upper())
    return stmt

def _equipment_records(db: Session, model=None, zone=None, process=None, transformer=None, gun=None, status_filter=None, q=None, offset=0, limit=500):
    stmt = _apply_filter(_assignment_query(db), model, zone, process, transformer, gun, status_filter)
    if q:
        pat = f'%{q.strip()}%'
        # Join aliases are safe because the table identities are unique in this query.
        stmt = stmt.join(EquipmentAssignment.car_model).join(EquipmentAssignment.process).join(EquipmentAssignment.transformer).join(EquipmentAssignment.po_gun).where(
            or_(CarModel.name.ilike(pat), ProcessStation.name.ilike(pat), Transformer.code.ilike(pat), PoGun.code.ilike(pat)))
    stmt = stmt.order_by(EquipmentAssignment.zone_id, EquipmentAssignment.process_id, EquipmentAssignment.id).offset(offset).limit(limit)
    return [assignment_dict(a) for a in db.scalars(stmt).unique().all()]

def _status_counts(rows):
    c = Counter(r['overall_status'] for r in rows)
    return {'total': len(rows), 'ok': c['OK'], 'ng': c['NG'], 'unverified': c['UNVERIFIED'],
            'ok_rate': round(c['OK'] / len(rows) * 100, 1) if rows else 0.0}

@router.get('/health', tags=['System'])
def health(db: Session = Depends(get_db)):
    total = db.scalar(select(func.count(EquipmentAssignment.id))) or 0
    return {'status': 'ok', 'service': 'po-gun-monitoring-api', 'equipment_count': total, 'timestamp': datetime.now(timezone.utc).isoformat()}

@router.get('/models')
def list_models(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    models = db.scalars(select(CarModel).order_by(CarModel.display_order, CarModel.name)).all()
    return [{'id': x.id, 'name': x.name, 'equipment_count': db.scalar(select(func.count(EquipmentAssignment.id)).where(EquipmentAssignment.car_model_id == x.id)) or 0} for x in models]

@router.get('/zones')
def list_zones(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    zones = db.scalars(select(FactoryZone).order_by(FactoryZone.display_order, FactoryZone.name)).all()
    out = []
    for z in zones:
        sub = db.scalars(_assignment_query(db).where(EquipmentAssignment.zone_id == z.id)).unique().all()
        rows = [assignment_dict(x) for x in sub]
        cnt = _status_counts(rows)
        out.append({'id': z.id, 'name': z.name, **cnt})
    return out

@router.get('/dashboard')
def dashboard(model: str | None = None, zone: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    all_rows = _equipment_records(db, model=model, zone=zone, limit=2000)
    overall = _status_counts(all_rows)
    current_ng = sum(1 for r in all_rows if r['current_status'] == 'NG')
    pressure_ng = sum(1 for r in all_rows if r['pressure_status'] == 'NG')
    # Build model comparison from source assignments, independent of selected model.
    models = db.scalars(select(CarModel).order_by(CarModel.display_order)).all()
    comparison = []
    for m in models:
        rows = _equipment_records(db, model=m.name, limit=2000)
        c = _status_counts(rows)
        comparison.append({'model': m.name, **c,
                          'current_ng': sum(1 for r in rows if r['current_status'] == 'NG'),
                          'pressure_ng': sum(1 for r in rows if r['pressure_status'] == 'NG')})
    zones = []
    for zname in ['ZONE A', 'ZONE B']:
        sub = [r for r in all_rows if r['zone'] == zname]
        zones.append({'zone': zname, **_status_counts(sub),
                      'current_ng': sum(1 for r in sub if r['current_status'] == 'NG'),
                      'pressure_ng': sum(1 for r in sub if r['pressure_status'] == 'NG')})
    abnormalities = [r for r in all_rows if r['overall_status'] in ('NG', 'UNVERIFIED')]
    # Sort records with NG before Unverified, then by source row.
    abnormalities.sort(key=lambda r: (0 if r['overall_status'] == 'NG' else 1, r['source_row'] or 999999))
    recent_actions_stmt = select(CorrectiveAction).options(joinedload(CorrectiveAction.assignment)).order_by(CorrectiveAction.updated_at.desc()).limit(6)
    recent_actions = [action_dict(x) for x in db.scalars(recent_actions_stmt).unique().all()]
    return {
        'filters': {'model': model or 'ALL', 'zone': zone or 'ALL'},
        'summary': overall,
        'current_ng': current_ng,
        'pressure_ng': pressure_ng,
        'abnormal_parameter_count': current_ng + pressure_ng,
        'model_comparison': comparison,
        'zone_comparison': zones,
        'abnormal_equipment': abnormalities[:12],
        'recent_actions': recent_actions,
        'data_quality': {
            'units_confirmed': False,
            'coordinates_verified': False,
            'source_snapshot_label': 'September (year not specified)',
            'notes': [
                'Measurement units are not explicitly labelled in the source register; do not convert values automatically.',
                'No observation dates were supplied for imported readings, so imported values are not plotted as historical trend points.',
                'Factory map labels are present, but precise process-marker coordinates have not been validated.',
                'Live equipment KPIs use EQUIPMENT REGISTER records (206 entries); the legacy dashboard contains a separate 414-record summary.'
            ]
        }
    }

@router.get('/equipment')
def list_equipment(model: str | None = None, zone: str | None = None, process: str | None = None,
                   transformer: str | None = None, gun: str | None = None, status: str | None = None,
                   q: str | None = None, offset: int = Query(0, ge=0), limit: int = Query(100, ge=1, le=500),
                   db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    stmt = _apply_filter(_assignment_query(db), model, zone, process, transformer, gun, status)
    if q:
        pat = f'%{q.strip()}%'
        stmt = stmt.join(EquipmentAssignment.car_model).join(EquipmentAssignment.process).join(EquipmentAssignment.transformer).join(EquipmentAssignment.po_gun).where(
            or_(CarModel.name.ilike(pat), ProcessStation.name.ilike(pat), Transformer.code.ilike(pat), PoGun.code.ilike(pat)))
    count_query = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = db.scalar(count_query) or 0
    stmt = stmt.order_by(EquipmentAssignment.zone_id, EquipmentAssignment.process_id, EquipmentAssignment.id).offset(offset).limit(limit)
    records = [assignment_dict(x) for x in db.scalars(stmt).unique().all()]
    return {'items': records, 'total': total, 'offset': offset, 'limit': limit}

@router.get('/equipment/{assignment_id}')
def equipment_detail(assignment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.scalar(_assignment_query(db).where(EquipmentAssignment.id == assignment_id))
    if not item:
        raise HTTPException(status_code=404, detail='Equipment record not found')
    reading_rows = db.scalars(select(ParameterReading).where(ParameterReading.assignment_id == item.id).order_by(ParameterReading.observed_at.desc().nullslast(), ParameterReading.recorded_at.desc()).limit(20)).all()
    action_rows = db.scalars(select(CorrectiveAction).where(CorrectiveAction.assignment_id == item.id).order_by(CorrectiveAction.updated_at.desc()).limit(20)).all()
    out = assignment_dict(item)
    out['readings'] = [{'id': r.id, 'parameter_name': r.parameter_name, 'value': r.value, 'unit': r.unit,
                        'observed_at': r.observed_at.isoformat() if r.observed_at else None,
                        'recorded_at': r.recorded_at.isoformat() if r.recorded_at else None, 'source': r.source, 'note': r.note}
                       for r in reading_rows]
    out['corrective_actions'] = [action_dict(a) for a in action_rows]
    return out

@router.get('/equipment/{assignment_id}/readings')
def equipment_readings(assignment_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not db.get(EquipmentAssignment, assignment_id):
        raise HTTPException(status_code=404, detail='Equipment record not found')
    items = db.scalars(select(ParameterReading).where(ParameterReading.assignment_id == assignment_id).order_by(ParameterReading.observed_at.desc().nullslast(), ParameterReading.recorded_at.desc()).limit(500)).all()
    return [{'id': r.id, 'parameter_name': r.parameter_name, 'value': r.value, 'unit': r.unit,
             'observed_at': r.observed_at.isoformat() if r.observed_at else None,
             'recorded_at': r.recorded_at.isoformat() if r.recorded_at else None, 'source': r.source, 'note': r.note}
            for r in items]

@router.post('/equipment/{assignment_id}/readings')
def add_reading(assignment_id: int, payload: ReadingCreate, db: Session = Depends(get_db),
                user: User = Depends(require_roles('admin', 'engineer', 'technician'))):
    item = db.scalar(_assignment_query(db).where(EquipmentAssignment.id == assignment_id))
    if not item:
        raise HTTPException(status_code=404, detail='Equipment record not found')
    expected_unit = item.current_unit if payload.parameter_name == 'Welding Current' else item.pressure_unit
    if payload.unit.strip().casefold() != expected_unit.strip().casefold():
        raise HTTPException(status_code=422, detail=f'Unit mismatch. This record uses "{expected_unit}". Confirm the unit before recording or converting a value.')
    if payload.observed_at.tzinfo is None:
        observed = payload.observed_at.replace(tzinfo=timezone.utc)
    else:
        observed = payload.observed_at
    reading = ParameterReading(assignment_id=item.id, parameter_name=payload.parameter_name, value=payload.value,
                               unit=payload.unit, observed_at=observed, source='Manual entry', note=payload.note, recorded_by_id=user.id)
    db.add(reading)
    if payload.parameter_name == 'Welding Current':
        item.current_actual = payload.value
    else:
        item.pressure_actual = payload.value
    recompute_assignment(item)
    write_audit(db, user.id, 'reading.create', 'parameter_reading', None,
                {'assignment_id': item.id, 'parameter': payload.parameter_name, 'value': payload.value, 'unit': payload.unit, 'status': item.overall_status})
    db.commit(); db.refresh(reading); db.refresh(item)
    return {'reading': {'id': reading.id, 'parameter_name': reading.parameter_name, 'value': reading.value,
                        'unit': reading.unit, 'observed_at': reading.observed_at.isoformat() if reading.observed_at else None},
            'equipment': assignment_dict(item)}

@router.get('/zones/{zone_id}/stations')
def zone_stations(zone_id: int, model: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    zone = db.get(FactoryZone, zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail='Factory zone not found')
    processes = db.scalars(select(ProcessStation).where(ProcessStation.zone_id == zone.id).order_by(ProcessStation.name)).all()
    out = []
    for proc in processes:
        stmt = _assignment_query(db).where(EquipmentAssignment.process_id == proc.id)
        if model:
            stmt = stmt.join(EquipmentAssignment.car_model).where(CarModel.name == model)
        items = [assignment_dict(x) for x in db.scalars(stmt).unique().all()]
        if model and not items:
            continue
        counts = _status_counts(items)
        out.append({'id': proc.id, 'process': proc.name, 'zone': zone.name, 'map_position': proc.legacy_map_position,
                    'map_x': proc.map_x, 'map_y': proc.map_y, 'coordinates_verified': proc.coordinates_verified,
                    'overall_status': 'NG' if counts['ng'] else ('UNVERIFIED' if counts['unverified'] else 'OK'),
                    **counts, 'current_ng': sum(x['current_status'] == 'NG' for x in items),
                    'pressure_ng': sum(x['pressure_status'] == 'NG' for x in items),
                    'items': items})
    return out

@router.get('/stations')
def list_stations(model: str | None = None, zone: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    zones = db.scalars(select(FactoryZone).order_by(FactoryZone.display_order)).all()
    out = []
    for z in zones:
        if zone and zone != z.name: continue
        procs = db.scalars(select(ProcessStation).where(ProcessStation.zone_id == z.id).order_by(ProcessStation.name)).all()
        for proc in procs:
            stmt = _assignment_query(db).where(EquipmentAssignment.process_id == proc.id)
            if model: stmt = stmt.join(EquipmentAssignment.car_model).where(CarModel.name == model)
            items = [assignment_dict(x) for x in db.scalars(stmt).unique().all()]
            if model and not items: continue
            cnt = _status_counts(items)
            out.append({'id': proc.id, 'process': proc.name, 'zone': z.name, 'map_position': proc.legacy_map_position,
                        'coordinates_verified': proc.coordinates_verified,
                        'overall_status': 'NG' if cnt['ng'] else ('UNVERIFIED' if cnt['unverified'] else 'OK'), **cnt,
                        'current_ng': sum(x['current_status'] == 'NG' for x in items),
                        'pressure_ng': sum(x['pressure_status'] == 'NG' for x in items)})
    return out

@router.get('/stations/{station_id}')
def station_detail(station_id: int, model: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    proc = db.get(ProcessStation, station_id)
    if not proc: raise HTTPException(status_code=404, detail='Process/station not found')
    stmt = _assignment_query(db).where(EquipmentAssignment.process_id == proc.id)
    if model: stmt = stmt.join(EquipmentAssignment.car_model).where(CarModel.name == model)
    items = [assignment_dict(x) for x in db.scalars(stmt).unique().all()]
    cnt = _status_counts(items)
    transformers = sorted({x['transformer_id'] for x in items if x['transformer_id']})
    guns = sorted({x['po_gun_id'] for x in items if x['po_gun_id']})
    actions = db.scalars(select(CorrectiveAction).where(CorrectiveAction.process_name == proc.name).order_by(CorrectiveAction.updated_at.desc()).limit(15)).all()
    return {'id': proc.id, 'process': proc.name, 'zone': proc.zone.name, 'model': model or 'ALL',
            'map_position': proc.legacy_map_position, 'coordinates_verified': proc.coordinates_verified,
            **cnt, 'current_ng': sum(x['current_status'] == 'NG' for x in items),
            'pressure_ng': sum(x['pressure_status'] == 'NG' for x in items),
            'transformers': transformers, 'po_guns': guns, 'equipment': items,
            'recent_actions': [action_dict(a) for a in actions]}

@router.get('/transformers/{transformer_pk}')
def transformer_detail(transformer_pk: int, model: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.get(Transformer, transformer_pk)
    if not item: raise HTTPException(status_code=404, detail='Transformer not found')
    stmt = _assignment_query(db).where(EquipmentAssignment.transformer_id == item.id)
    if model: stmt = stmt.join(EquipmentAssignment.car_model).where(CarModel.name == model)
    equipment = [assignment_dict(x) for x in db.scalars(stmt).unique().all()]
    cnt = _status_counts(equipment)
    return {'id': item.id, 'transformer_id': item.code, 'zone': item.zone.name, 'process': item.process.name,
            'models': sorted({x['car_model'] for x in equipment}), 'po_guns': sorted({x['po_gun_id'] for x in equipment}),
            **cnt, 'equipment': equipment}

@router.get('/po-guns/{po_gun_pk}')
def po_gun_detail(po_gun_pk: int, model: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    gun = db.get(PoGun, po_gun_pk)
    if not gun: raise HTTPException(status_code=404, detail='PO Gun not found')
    stmt = _assignment_query(db).where(EquipmentAssignment.po_gun_id == gun.id)
    if model: stmt = stmt.join(EquipmentAssignment.car_model).where(CarModel.name == model)
    equipment = [assignment_dict(x) for x in db.scalars(stmt).unique().all()]
    cnt = _status_counts(equipment)
    return {'id': gun.id, 'po_gun_id': gun.code, 'gun_type': gun.gun_type, 'transformer_id': gun.transformer.code,
            'process': gun.transformer.process.name, 'zone': gun.transformer.zone.name,
            **cnt, 'equipment': equipment}

@router.get('/reports/summary')
def report_summary(model: str | None = None, zone: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    data = dashboard(model=model, zone=zone, db=db, user=user)
    return {'summary': data['summary'], 'current_ng': data['current_ng'], 'pressure_ng': data['pressure_ng'],
            'model_comparison': data['model_comparison'], 'zone_comparison': data['zone_comparison'],
            'data_quality': data['data_quality']}

@router.get('/reports/trends')
def report_trends(model: str | None = None, parameter: str | None = Query(default=None, pattern='^(Welding Current|Pressure)$'),
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    stmt = select(ParameterReading).options(joinedload(ParameterReading.assignment).joinedload(EquipmentAssignment.car_model)).where(ParameterReading.observed_at.is_not(None))
    if parameter: stmt = stmt.where(ParameterReading.parameter_name == parameter)
    entries = db.scalars(stmt.order_by(ParameterReading.observed_at)).unique().all()
    if model: entries = [x for x in entries if x.assignment and x.assignment.car_model.name == model]
    grouped = {}
    for r in entries:
        key = (r.observed_at.date().isoformat(), r.parameter_name)
        grouped.setdefault(key, []).append(r.value)
    points = [{'date': k[0], 'parameter': k[1], 'average': sum(v)/len(v), 'minimum': min(v), 'maximum': max(v), 'count': len(v)} for k,v in grouped.items()]
    return {'items': points, 'available': bool(points), 'message': None if points else 'No timestamped historical readings yet. Imported workbook snapshots have no confirmed observation date.'}

@router.patch('/stations/{station_id}/map-position')
def update_map_position(station_id: int, payload: MapPositionUpdate, db: Session = Depends(get_db), user: User = Depends(require_roles('admin', 'engineer'))):
    proc = db.get(ProcessStation, station_id)
    if not proc: raise HTTPException(status_code=404, detail='Process/station not found')
    proc.map_x, proc.map_y, proc.coordinates_verified = payload.map_x, payload.map_y, payload.coordinates_verified
    write_audit(db, user.id, 'map_position.update', 'process_station', proc.id, {'process': proc.name, 'map_x': proc.map_x, 'map_y': proc.map_y, 'coordinates_verified': proc.coordinates_verified})
    db.commit()
    return {'id': proc.id, 'process': proc.name, 'map_x': proc.map_x, 'map_y': proc.map_y, 'coordinates_verified': proc.coordinates_verified}

@router.patch('/equipment/{assignment_id}/units')
def update_equipment_units(assignment_id: int, payload: UnitUpdate, db: Session = Depends(get_db), user: User = Depends(require_roles('admin', 'engineer'))):
    item = db.get(EquipmentAssignment, assignment_id)
    if not item: raise HTTPException(status_code=404, detail='Equipment record not found')
    before = {'current_unit': item.current_unit, 'pressure_unit': item.pressure_unit}
    if payload.current_unit: item.current_unit = payload.current_unit.strip()
    if payload.pressure_unit: item.pressure_unit = payload.pressure_unit.strip()
    write_audit(db, user.id, 'equipment_units.update', 'equipment_assignment', item.id, {'before': before, 'after': {'current_unit': item.current_unit, 'pressure_unit': item.pressure_unit}})
    db.commit()
    item = db.scalar(_assignment_query(db).where(EquipmentAssignment.id == item.id))
    return assignment_dict(item)

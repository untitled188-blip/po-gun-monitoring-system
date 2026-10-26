from __future__ import annotations
import json
from datetime import date
from pathlib import Path
from sqlalchemy import select, func
from sqlalchemy.orm import Session, joinedload
from ..config import SOURCE_SNAPSHOT_PATH, ADMIN_USERNAME, ADMIN_PASSWORD
from ..models import (User, CarModel, FactoryZone, ProcessStation, Transformer, PoGun,
                      EquipmentAssignment, ParameterReading, CorrectiveAction, ImportBatch)
from ..security import hash_password
from .status import recompute_assignment

MODEL_ORDER = {'CITY 4D': 1, 'CITY 5D': 2, 'HR-V': 3, 'WR-V': 4}
ZONE_ORDER = {'ZONE A': 1, 'ZONE B': 2}

def _date(value):
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None

def _upsert_dimensions(db: Session, record: dict):
    model_name = record['car_model']
    zone_name = record['zone']
    model = db.scalar(select(CarModel).where(CarModel.name == model_name))
    if not model:
        model = CarModel(name=model_name, display_order=MODEL_ORDER.get(model_name, 99))
        db.add(model); db.flush()
    zone = db.scalar(select(FactoryZone).where(FactoryZone.name == zone_name))
    if not zone:
        zone = FactoryZone(name=zone_name, display_order=ZONE_ORDER.get(zone_name, 99))
        db.add(zone); db.flush()
    process_name = record['process']
    process = db.scalar(select(ProcessStation).where(ProcessStation.name == process_name, ProcessStation.zone_id == zone.id))
    if not process:
        process = ProcessStation(name=process_name, zone_id=zone.id, coordinates_verified=False)
        db.add(process); db.flush()
    transformer_code = record['transformer_id']
    transformer = db.scalar(select(Transformer).where(
        Transformer.code == transformer_code,
        Transformer.process_id == process.id,
        Transformer.zone_id == zone.id,
    ))
    if not transformer:
        transformer = Transformer(code=transformer_code, process_id=process.id, zone_id=zone.id)
        db.add(transformer); db.flush()
    gun_code = record['po_gun_id']
    gun = db.scalar(select(PoGun).where(PoGun.code == gun_code, PoGun.transformer_id == transformer.id))
    if not gun:
        gun_type = 'WGC' if gun_code.upper().startswith('WGC') else ('WGX' if gun_code.upper().startswith('WGX') else None)
        gun = PoGun(code=gun_code, transformer_id=transformer.id, gun_type=gun_type)
        db.add(gun); db.flush()
    return model, zone, process, transformer, gun

def _upsert_assignment(db: Session, record: dict):
    model, zone, process, transformer, gun = _upsert_dimensions(db, record)
    key = record.get('source_key') or '|'.join([record['car_model'], record['process'], record['transformer_id'], record['po_gun_id']])
    assignment = db.scalar(select(EquipmentAssignment).where(EquipmentAssignment.source_key == key))
    values = {
        'source_row': record.get('source_row'),
        'car_model_id': model.id,
        'zone_id': zone.id,
        'process_id': process.id,
        'transformer_id': transformer.id,
        'po_gun_id': gun.id,
        'current_actual': record.get('current_actual'),
        'current_target': record.get('current_target'),
        'current_min': record.get('current_min'),
        'current_max': record.get('current_max'),
        'pressure_actual': record.get('pressure_actual'),
        'pressure_target': record.get('pressure_target'),
        'pressure_min': record.get('pressure_min'),
        'pressure_max': record.get('pressure_max'),
        'current_unit': record.get('current_unit') or 'Source unit (not labelled in register)',
        'pressure_unit': record.get('pressure_unit') or 'Source unit (not labelled in register)',
        'snapshot_label': record.get('snapshot_label') or 'Imported workbook snapshot',
        'map_position': record.get('map_position'),
        'source_current_status': record.get('source_current_status'),
        'source_pressure_status': record.get('source_pressure_status'),
        'source_overall_status': record.get('source_overall_status'),
    }
    if assignment is None:
        assignment = EquipmentAssignment(source_key=key, **values)
        db.add(assignment); db.flush()
        is_new = True
    else:
        for k, v in values.items():
            setattr(assignment, k, v)
        is_new = False
    recompute_assignment(assignment)
    return assignment, is_new

def bootstrap_database(db: Session) -> dict:
    """Create first admin and seed source snapshot once; safe to call at app start."""
    admin = db.scalar(select(User).where(User.username == ADMIN_USERNAME))
    if not admin:
        admin = User(username=ADMIN_USERNAME, password_hash=hash_password(ADMIN_PASSWORD), role='admin', active=True)
        db.add(admin); db.flush()

    assignment_count = db.scalar(select(func.count(EquipmentAssignment.id))) or 0
    seeded = False
    if assignment_count == 0 and SOURCE_SNAPSHOT_PATH.exists():
        source = json.loads(SOURCE_SNAPSHOT_PATH.read_text(encoding='utf-8'))
        for zname, order in ZONE_ORDER.items():
            if not db.scalar(select(FactoryZone).where(FactoryZone.name == zname)):
                db.add(FactoryZone(name=zname, display_order=order))
        db.flush()
        # The process map provides labels but not trustworthy normalized coordinates.
        for item in source.get('process_map', []):
            zone = db.scalar(select(FactoryZone).where(FactoryZone.name == item['zone']))
            if zone is None:
                zone = FactoryZone(name=item['zone'], display_order=ZONE_ORDER.get(item['zone'], 99)); db.add(zone); db.flush()
            process = db.scalar(select(ProcessStation).where(ProcessStation.name == item['process'], ProcessStation.zone_id == zone.id))
            if not process:
                process = ProcessStation(
                    name=item['process'], zone_id=zone.id,
                    legacy_map_position=item.get('map_position_label'),
                    map_x=item.get('map_x'), map_y=item.get('map_y'),
                    coordinates_verified=False,
                    source_map_verified_flag=item.get('source_verified_flag'),
                )
                db.add(process)
            else:
                process.legacy_map_position = process.legacy_map_position or item.get('map_position_label')
                process.source_map_verified_flag = item.get('source_verified_flag') or process.source_map_verified_flag
        db.flush()
        assignment_by_key = {}
        for record in source.get('equipment', []):
            assignment, _ = _upsert_assignment(db, record)
            assignment_by_key['|'.join([record.get('car_model') or '', record.get('process') or '', record.get('transformer_id') or '', record.get('po_gun_id') or ''])] = assignment
        db.flush()
        # Imported current snapshot values have no confirmed observation date. Store them as imported readings
        # with observed_at=NULL, so historical-trend charts do not fabricate a date.
        for assignment in db.scalars(select(EquipmentAssignment)).all():
            if assignment.current_actual is not None:
                db.add(ParameterReading(assignment_id=assignment.id, parameter_name='Welding Current', value=assignment.current_actual,
                    unit=assignment.current_unit, observed_at=None, source='Excel import — date not specified'))
            if assignment.pressure_actual is not None:
                db.add(ParameterReading(assignment_id=assignment.id, parameter_name='Pressure', value=assignment.pressure_actual,
                    unit=assignment.pressure_unit, observed_at=None, source='Excel import — date not specified'))
        db.flush()
        # Match imported action rows to the exact source identity when possible. Unmatched legacy entries remain visible.
        for item in source.get('corrective_actions', []):
            key = '|'.join([item.get('car_model') or '', item.get('process') or '', item.get('transformer_id') or '', item.get('po_gun_id') or ''])
            assignment = assignment_by_key.get(key)
            action = CorrectiveAction(
                action_code=item.get('action_code'), source_row=item.get('source_row'),
                assignment_id=assignment.id if assignment else None,
                car_model_name=item.get('car_model'), zone_name=item.get('zone'), process_name=item.get('process'),
                transformer_code=item.get('transformer_id'), po_gun_code=item.get('po_gun_id'),
                abnormal_parameter=item.get('abnormal_parameter') or 'Welding Current',
                actual_reading=item.get('actual_reading'), target_or_limit=item.get('target_or_limit'),
                target_or_limit_text=item.get('target_or_limit_text'), problem_description=item.get('problem_description'),
                corrective_action_text=item.get('corrective_action'), pic=item.get('pic'),
                date_reported=_date(item.get('date_reported')), due_date=_date(item.get('due_date')),
                action_status=item.get('action_status') or 'Open', verified_by=item.get('verified_by'),
                verification_date=_date(item.get('verification_date')), remarks=item.get('remarks'),
                verification_status=item.get('verification_status'), source_label=f"Excel import — {item.get('imported_from_sheet', 'legacy row')} row {item.get('source_row')}",
            )
            db.add(action)
        db.add(ImportBatch(source_file=source.get('source_file', 'source_snapshot.json'), source_sheet='EQUIPMENT REGISTER',
            row_count=len(source.get('equipment', [])), created_count=len(source.get('equipment', [])), updated_count=0,
            rejected_count=0, errors_json=None, imported_by_id=admin.id))
        db.flush()
        seeded = True
    db.commit()
    return {'admin_created': admin is not None, 'seeded_snapshot': seeded,
            'equipment_count': db.scalar(select(func.count(EquipmentAssignment.id))) or 0}

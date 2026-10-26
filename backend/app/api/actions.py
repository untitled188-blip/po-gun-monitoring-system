from __future__ import annotations
from datetime import date
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, or_, func
from sqlalchemy.orm import Session, joinedload
from ..database import get_db
from ..models import CorrectiveAction, EquipmentAssignment, User
from ..security import get_current_user, require_roles
from ..schemas import CorrectiveActionCreate, CorrectiveActionUpdate
from ..serializers import action_dict
from ..services.audit import write_audit

router = APIRouter(prefix='/api/corrective-actions', tags=['Corrective actions'])
CLOSED = {'closed - verified', 'closed', 'verified'}

@router.get('')
def list_actions(model: str | None = None, zone: str | None = None, status: str | None = None,
                parameter: str | None = None, q: str | None = None, offset: int = Query(0, ge=0),
                limit: int = Query(100, ge=1, le=500), db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    stmt = select(CorrectiveAction).options(joinedload(CorrectiveAction.assignment))
    if model: stmt = stmt.where(CorrectiveAction.car_model_name == model)
    if zone: stmt = stmt.where(CorrectiveAction.zone_name == zone)
    if status: stmt = stmt.where(CorrectiveAction.action_status == status)
    if parameter: stmt = stmt.where(CorrectiveAction.abnormal_parameter == parameter)
    if q:
        pat = f'%{q.strip()}%'
        stmt = stmt.where(or_(CorrectiveAction.action_code.ilike(pat), CorrectiveAction.process_name.ilike(pat),
                              CorrectiveAction.transformer_code.ilike(pat), CorrectiveAction.po_gun_code.ilike(pat),
                              CorrectiveAction.problem_description.ilike(pat), CorrectiveAction.pic.ilike(pat)))
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    entries = db.scalars(stmt.order_by(CorrectiveAction.updated_at.desc(), CorrectiveAction.id.desc()).offset(offset).limit(limit)).unique().all()
    return {'items': [action_dict(x) for x in entries], 'total': total, 'offset': offset, 'limit': limit}

@router.post('')
def create_action(payload: CorrectiveActionCreate, db: Session = Depends(get_db),
                 user: User = Depends(require_roles('admin', 'engineer', 'technician'))):
    assignment = None
    if payload.assignment_id:
        assignment = db.get(EquipmentAssignment, payload.assignment_id)
        if not assignment: raise HTTPException(status_code=404, detail='Equipment record not found')
        if not payload.allow_duplicate:
            open_existing = db.scalar(select(CorrectiveAction).where(
                CorrectiveAction.assignment_id == assignment.id,
                CorrectiveAction.abnormal_parameter == payload.abnormal_parameter,
                func.lower(CorrectiveAction.action_status).not_in(tuple(CLOSED)),
            ).limit(1))
            if open_existing:
                raise HTTPException(status_code=409, detail=f'An open corrective action already exists ({open_existing.action_code or "legacy record"}) for this equipment and parameter.')
    if not assignment and not (payload.car_model and payload.zone and payload.process and payload.transformer_id and payload.po_gun_id):
        raise HTTPException(status_code=422, detail='Select an equipment record or provide model, zone, process, transformer, and PO Gun details.')
    identity = {
        'assignment_id': assignment.id if assignment else None,
        'car_model_name': payload.car_model or (assignment.car_model.name if assignment else None),
        'zone_name': payload.zone or (assignment.zone.name if assignment else None),
        'process_name': payload.process or (assignment.process.name if assignment else None),
        'transformer_code': payload.transformer_id or (assignment.transformer.code if assignment else None),
        'po_gun_code': payload.po_gun_id or (assignment.po_gun.code if assignment else None),
    }
    status = payload.action_status
    if status == 'Closed - Verified' and user.role not in {'admin', 'quality_inspector'}:
        raise HTTPException(status_code=403, detail='Only an administrator or quality inspector can close and verify an action.')
    code = f"CA-{datetime_now_code()}-{uuid4().hex[:6].upper()}"
    action = CorrectiveAction(
        action_code=code, assignment_id=identity['assignment_id'], car_model_name=identity['car_model_name'],
        zone_name=identity['zone_name'], process_name=identity['process_name'], transformer_code=identity['transformer_code'],
        po_gun_code=identity['po_gun_code'], abnormal_parameter=payload.abnormal_parameter,
        actual_reading=payload.actual_reading if payload.actual_reading is not None else (
            assignment.current_actual if assignment and payload.abnormal_parameter == 'Welding Current' else assignment.pressure_actual if assignment else None),
        target_or_limit=payload.target_or_limit if payload.target_or_limit is not None else (
            assignment.current_target if assignment and payload.abnormal_parameter == 'Welding Current' else assignment.pressure_target if assignment else None),
        target_or_limit_text=payload.target_or_limit_text,
        problem_description=payload.problem_description,
        corrective_action_text=payload.corrective_action,
        pic=payload.pic, date_reported=payload.date_reported or date.today(), due_date=payload.due_date,
        action_status=status, remarks=payload.remarks, source_label='Application', created_by_id=user.id,
        verification_status='Pending Verification' if status != 'Closed - Verified' else 'Verified',
    )
    if status == 'Closed - Verified':
        action.verified_by = user.username
        action.verification_date = date.today()
    db.add(action)
    write_audit(db, user.id, 'corrective_action.create', 'corrective_action', code, {'assignment_id': identity['assignment_id'], 'parameter': payload.abnormal_parameter, 'status': status})
    db.commit(); db.refresh(action)
    return action_dict(action)

def datetime_now_code():
    from datetime import datetime
    return datetime.now().strftime('%Y%m%d-%H%M%S')

@router.patch('/{action_id}')
def update_action(action_id: int, payload: CorrectiveActionUpdate, db: Session = Depends(get_db),
                  user: User = Depends(require_roles('admin', 'engineer', 'technician', 'quality_inspector'))):
    action = db.scalar(select(CorrectiveAction).options(joinedload(CorrectiveAction.assignment)).where(CorrectiveAction.id == action_id))
    if not action: raise HTTPException(status_code=404, detail='Corrective action not found')
    changes = payload.model_dump(exclude_unset=True)
    requested_status = changes.get('action_status')
    if requested_status == 'Closed - Verified':
        if user.role not in {'admin', 'quality_inspector'}:
            raise HTTPException(status_code=403, detail='Only an administrator or quality inspector can close and verify an action.')
        verified_by = changes.get('verified_by') or action.verified_by
        verification_date = changes.get('verification_date') or action.verification_date
        if not verified_by or not verification_date:
            raise HTTPException(status_code=422, detail='Closing an action requires Verified By and Verification Date.')
        changes['verification_status'] = 'Verified'
    elif requested_status == 'Pending Verification':
        changes['verification_status'] = 'Pending Verification'
    before = {k: getattr(action, {'corrective_action':'corrective_action_text'}.get(k,k), None) for k in changes}
    field_map = {'corrective_action': 'corrective_action_text'}
    for key, value in changes.items():
        setattr(action, field_map.get(key, key), value)
    if action.action_status == 'Closed - Verified' and action.verification_status != 'Verified':
        action.verification_status = 'Verified'
    write_audit(db, user.id, 'corrective_action.update', 'corrective_action', action.action_code or action.id,
                {'before': before, 'changes': changes})
    db.commit()
    action = db.scalar(select(CorrectiveAction).options(joinedload(CorrectiveAction.assignment)).where(CorrectiveAction.id == action_id))
    return action_dict(action)

@router.get('/{action_id}')
def action_detail(action_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    action = db.scalar(select(CorrectiveAction).options(joinedload(CorrectiveAction.assignment)).where(CorrectiveAction.id == action_id))
    if not action: raise HTTPException(status_code=404, detail='Corrective action not found')
    return action_dict(action)

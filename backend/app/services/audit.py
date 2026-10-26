from __future__ import annotations
import json
from sqlalchemy.orm import Session
from ..models import AuditLog

def write_audit(db: Session, user_id: int | None, action: str, entity_type: str, entity_id=None, details=None):
    db.add(AuditLog(user_id=user_id, action=action, entity_type=entity_type,
                    entity_id=str(entity_id) if entity_id is not None else None,
                    details_json=json.dumps(details, default=str, ensure_ascii=False) if details is not None else None))

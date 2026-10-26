from __future__ import annotations
from datetime import date, datetime, timezone
from sqlalchemy import (Boolean, CheckConstraint, Date, DateTime, Float, ForeignKey,
                        Index, Integer, String, Text, UniqueConstraint, func)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base

def utcnow() -> datetime:
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = 'users'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default='technician', index=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

class CarModel(Base):
    __tablename__ = 'car_models'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    assignments = relationship('EquipmentAssignment', back_populates='car_model')

class FactoryZone(Base):
    __tablename__ = 'factory_zones'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    processes = relationship('ProcessStation', back_populates='zone')

class ProcessStation(Base):
    __tablename__ = 'process_stations'
    __table_args__ = (UniqueConstraint('name', 'zone_id', name='uq_process_zone'),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    zone_id: Mapped[int] = mapped_column(ForeignKey('factory_zones.id', ondelete='RESTRICT'), index=True)
    legacy_map_position: Mapped[str | None] = mapped_column(String(200), nullable=True)
    map_x: Mapped[float | None] = mapped_column(Float, nullable=True)
    map_y: Mapped[float | None] = mapped_column(Float, nullable=True)
    coordinates_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    source_map_verified_flag: Mapped[str | None] = mapped_column(String(40), nullable=True)
    zone = relationship('FactoryZone', back_populates='processes')
    transformers = relationship('Transformer', back_populates='process')
    assignments = relationship('EquipmentAssignment', back_populates='process')

class Transformer(Base):
    __tablename__ = 'transformers'
    __table_args__ = (UniqueConstraint('code', 'process_id', 'zone_id', name='uq_transformer_process_zone'),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(80), index=True)
    process_id: Mapped[int] = mapped_column(ForeignKey('process_stations.id', ondelete='RESTRICT'), index=True)
    zone_id: Mapped[int] = mapped_column(ForeignKey('factory_zones.id', ondelete='RESTRICT'), index=True)
    process = relationship('ProcessStation', back_populates='transformers')
    zone = relationship('FactoryZone')
    po_guns = relationship('PoGun', back_populates='transformer')
    assignments = relationship('EquipmentAssignment', back_populates='transformer')

class PoGun(Base):
    __tablename__ = 'po_guns'
    __table_args__ = (UniqueConstraint('code', 'transformer_id', name='uq_po_gun_transformer'),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(120), index=True)
    gun_type: Mapped[str | None] = mapped_column(String(60), nullable=True)
    transformer_id: Mapped[int] = mapped_column(ForeignKey('transformers.id', ondelete='RESTRICT'), index=True)
    transformer = relationship('Transformer', back_populates='po_guns')
    assignments = relationship('EquipmentAssignment', back_populates='po_gun')

class EquipmentAssignment(Base):
    __tablename__ = 'equipment_assignments'
    __table_args__ = (
        UniqueConstraint('source_key', name='uq_assignment_source_key'),
        Index('ix_assignment_model_zone', 'car_model_id', 'zone_id'),
        Index('ix_assignment_process_model', 'process_id', 'car_model_id'),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_key: Mapped[str] = mapped_column(String(500), unique=True, index=True)
    source_row: Mapped[int | None] = mapped_column(Integer, nullable=True)
    car_model_id: Mapped[int] = mapped_column(ForeignKey('car_models.id', ondelete='RESTRICT'), index=True)
    zone_id: Mapped[int] = mapped_column(ForeignKey('factory_zones.id', ondelete='RESTRICT'), index=True)
    process_id: Mapped[int] = mapped_column(ForeignKey('process_stations.id', ondelete='RESTRICT'), index=True)
    transformer_id: Mapped[int] = mapped_column(ForeignKey('transformers.id', ondelete='RESTRICT'), index=True)
    po_gun_id: Mapped[int] = mapped_column(ForeignKey('po_guns.id', ondelete='RESTRICT'), index=True)
    current_actual: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_target: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    pressure_actual: Mapped[float | None] = mapped_column(Float, nullable=True)
    pressure_target: Mapped[float | None] = mapped_column(Float, nullable=True)
    pressure_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    pressure_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_unit: Mapped[str] = mapped_column(String(80), default='Source unit (not labelled in register)')
    pressure_unit: Mapped[str] = mapped_column(String(80), default='Source unit (not labelled in register)')
    snapshot_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    map_position: Mapped[str | None] = mapped_column(String(200), nullable=True)
    current_status: Mapped[str] = mapped_column(String(20), default='UNVERIFIED', index=True)
    pressure_status: Mapped[str] = mapped_column(String(20), default='UNVERIFIED', index=True)
    overall_status: Mapped[str] = mapped_column(String(20), default='UNVERIFIED', index=True)
    source_current_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    source_pressure_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    source_overall_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    car_model = relationship('CarModel', back_populates='assignments')
    zone = relationship('FactoryZone')
    process = relationship('ProcessStation', back_populates='assignments')
    transformer = relationship('Transformer', back_populates='assignments')
    po_gun = relationship('PoGun', back_populates='assignments')
    readings = relationship('ParameterReading', back_populates='assignment', cascade='all, delete-orphan')
    corrective_actions = relationship('CorrectiveAction', back_populates='assignment')

class ParameterReading(Base):
    __tablename__ = 'parameter_readings'
    __table_args__ = (
        CheckConstraint("parameter_name IN ('Welding Current', 'Pressure')", name='ck_reading_parameter'),
        Index('ix_reading_assignment_observed', 'assignment_id', 'observed_at'),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    assignment_id: Mapped[int] = mapped_column(ForeignKey('equipment_assignments.id', ondelete='CASCADE'), index=True)
    parameter_name: Mapped[str] = mapped_column(String(40))
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(80))
    observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    source: Mapped[str] = mapped_column(String(160), default='Manual entry')
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    recorded_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    assignment = relationship('EquipmentAssignment', back_populates='readings')
    recorded_by = relationship('User')

class CorrectiveAction(Base):
    __tablename__ = 'corrective_actions'
    __table_args__ = (
        Index('ix_action_status_due', 'action_status', 'due_date'),
        Index('ix_action_assignment_parameter', 'assignment_id', 'abnormal_parameter'),
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    action_code: Mapped[str | None] = mapped_column(String(100), unique=True, nullable=True, index=True)
    source_row: Mapped[int | None] = mapped_column(Integer, nullable=True)
    assignment_id: Mapped[int | None] = mapped_column(ForeignKey('equipment_assignments.id', ondelete='SET NULL'), nullable=True, index=True)
    car_model_name: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    zone_name: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    process_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    transformer_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    po_gun_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    abnormal_parameter: Mapped[str] = mapped_column(String(40), default='Welding Current')
    actual_reading: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_or_limit: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_or_limit_text: Mapped[str | None] = mapped_column(String(100), nullable=True)
    problem_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    corrective_action_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    pic: Mapped[str | None] = mapped_column(String(120), nullable=True)
    date_reported: Mapped[date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    action_status: Mapped[str] = mapped_column(String(40), default='Open', index=True)
    verified_by: Mapped[str | None] = mapped_column(String(120), nullable=True)
    verification_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    verification_status: Mapped[str | None] = mapped_column(String(60), nullable=True)
    source_label: Mapped[str] = mapped_column(String(120), default='Application')
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    assignment = relationship('EquipmentAssignment', back_populates='corrective_actions')
    created_by = relationship('User')

class ImportBatch(Base):
    __tablename__ = 'import_batches'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_file: Mapped[str] = mapped_column(String(255))
    source_sheet: Mapped[str] = mapped_column(String(120))
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    created_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_count: Mapped[int] = mapped_column(Integer, default=0)
    rejected_count: Mapped[int] = mapped_column(Integer, default=0)
    errors_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    imported_by_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    imported_by = relationship('User')

class AuditLog(Base):
    __tablename__ = 'audit_logs'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey('users.id', ondelete='SET NULL'), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(80), index=True)
    entity_type: Mapped[str] = mapped_column(String(80), index=True)
    entity_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    details_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    user = relationship('User')

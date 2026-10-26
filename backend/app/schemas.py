from __future__ import annotations
from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=300)

class ReadingCreate(BaseModel):
    parameter_name: Literal['Welding Current', 'Pressure']
    value: float
    unit: str = Field(min_length=1, max_length=80)
    observed_at: datetime
    note: str | None = Field(default=None, max_length=2000)

class CorrectiveActionCreate(BaseModel):
    assignment_id: int | None = None
    car_model: str | None = None
    zone: str | None = None
    process: str | None = None
    transformer_id: str | None = None
    po_gun_id: str | None = None
    abnormal_parameter: Literal['Welding Current', 'Pressure'] = 'Welding Current'
    actual_reading: float | None = None
    target_or_limit: float | None = None
    target_or_limit_text: str | None = Field(default=None, max_length=100)
    problem_description: str = Field(min_length=3, max_length=3000)
    corrective_action: str | None = Field(default=None, max_length=3000)
    pic: str | None = Field(default=None, max_length=120)
    date_reported: date | None = None
    due_date: date | None = None
    action_status: Literal['Open', 'In Progress', 'Pending Verification', 'Closed - Verified'] = 'Open'
    remarks: str | None = Field(default=None, max_length=3000)
    allow_duplicate: bool = False

class CorrectiveActionUpdate(BaseModel):
    action_status: Literal['Open', 'In Progress', 'Pending Verification', 'Closed - Verified'] | None = None
    corrective_action: str | None = Field(default=None, max_length=3000)
    pic: str | None = Field(default=None, max_length=120)
    due_date: date | None = None
    verified_by: str | None = Field(default=None, max_length=120)
    verification_date: date | None = None
    verification_status: str | None = Field(default=None, max_length=60)
    remarks: str | None = Field(default=None, max_length=3000)

class ImportRequest(BaseModel):
    confirm: bool = False

class ModelConfigUpdate(BaseModel):
    current_unit: str | None = None
    pressure_unit: str | None = None

class MapPositionUpdate(BaseModel):
    map_x: float = Field(ge=0, le=100)
    map_y: float = Field(ge=0, le=100)
    coordinates_verified: bool = False

class UnitUpdate(BaseModel):
    current_unit: str | None = None
    pressure_unit: str | None = None

class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=12, max_length=300)
    role: Literal['admin', 'engineer', 'technician', 'quality_inspector'] = 'technician'

class UserUpdate(BaseModel):
    active: bool | None = None
    role: Literal['admin', 'engineer', 'technician', 'quality_inspector'] | None = None
    password: str | None = Field(default=None, min_length=12, max_length=300)

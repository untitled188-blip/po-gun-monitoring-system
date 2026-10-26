from __future__ import annotations
import math
from typing import Optional

VALID_STATUSES = {'OK', 'NG', 'UNVERIFIED'}

def valid_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))

def evaluate_parameter_status(actual: Optional[float], minimum: Optional[float], maximum: Optional[float]) -> str:
    """Status uses actual vs approved limits; target deviation is a separate metric."""
    if not all(valid_number(v) for v in (actual, minimum, maximum)):
        return 'UNVERIFIED'
    if float(minimum) > float(maximum):
        return 'UNVERIFIED'
    return 'NG' if float(actual) < float(minimum) or float(actual) > float(maximum) else 'OK'

def overall_status(current_status: str, pressure_status: str) -> str:
    if 'NG' in (current_status, pressure_status):
        return 'NG'
    if 'UNVERIFIED' in (current_status, pressure_status):
        return 'UNVERIFIED'
    return 'OK'

def deviation(actual: Optional[float], target: Optional[float]) -> Optional[float]:
    if not valid_number(actual) or not valid_number(target):
        return None
    return float(actual) - float(target)

def deviation_percent(actual: Optional[float], target: Optional[float]) -> Optional[float]:
    delta = deviation(actual, target)
    if delta is None or not valid_number(target) or float(target) == 0:
        return None
    return delta / float(target) * 100.0

def recompute_assignment(assignment) -> None:
    assignment.current_status = evaluate_parameter_status(assignment.current_actual, assignment.current_min, assignment.current_max)
    assignment.pressure_status = evaluate_parameter_status(assignment.pressure_actual, assignment.pressure_min, assignment.pressure_max)
    assignment.overall_status = overall_status(assignment.current_status, assignment.pressure_status)

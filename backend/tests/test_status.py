import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.status import evaluate_parameter_status, overall_status, deviation, deviation_percent

def test_status_boundaries_are_ok():
    assert evaluate_parameter_status(8.0, 7.5, 8.5) == 'OK'
    assert evaluate_parameter_status(7.5, 7.5, 8.5) == 'OK'
    assert evaluate_parameter_status(8.5, 7.5, 8.5) == 'OK'

def test_status_outside_limits_is_ng():
    assert evaluate_parameter_status(7.49, 7.5, 8.5) == 'NG'
    assert evaluate_parameter_status(8.51, 7.5, 8.5) == 'NG'

def test_status_missing_or_invalid_is_unverified():
    assert evaluate_parameter_status(None, 1, 2) == 'UNVERIFIED'
    assert evaluate_parameter_status(1.5, None, 2) == 'UNVERIFIED'
    assert evaluate_parameter_status(1.5, 2, 1) == 'UNVERIFIED'

def test_overall_status_ng_takes_precedence():
    assert overall_status('NG', 'UNVERIFIED') == 'NG'
    assert overall_status('OK', 'UNVERIFIED') == 'UNVERIFIED'
    assert overall_status('OK', 'OK') == 'OK'

def test_deviation_and_zero_target():
    assert deviation(8.53, 8.5) == 0.02999999999999936
    assert round(deviation_percent(8.53, 8.5), 4) == round((0.03 / 8.5) * 100, 4)
    assert deviation_percent(1, 0) is None
    assert deviation(None, 1) is None

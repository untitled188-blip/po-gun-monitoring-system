import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SNAPSHOT = ROOT / 'data' / 'source_snapshot.json'

def test_snapshot_has_register_counts_and_valid_models():
    data = json.loads(SNAPSHOT.read_text(encoding='utf-8'))
    equipment = data['equipment']
    assert len(equipment) == 206
    model_counts = Counter(row['car_model'] for row in equipment)
    assert model_counts == {'CITY 4D': 53, 'CITY 5D': 49, 'HR-V': 51, 'WR-V': 53}
    expected = {'CITY 4D', 'CITY 5D', 'HR-V', 'WR-V'}
    assert set(model_counts) == expected

def test_zone_counts_reconcile_and_data_is_not_fabricated():
    data = json.loads(SNAPSHOT.read_text(encoding='utf-8'))
    zones = defaultdict(Counter)
    for row in data['equipment']:
        zones[row['car_model']][row['zone']] += 1
    assert zones['CITY 4D'] == {'ZONE A': 22, 'ZONE B': 31}
    assert zones['CITY 5D'] == {'ZONE A': 21, 'ZONE B': 28}
    assert zones['HR-V'] == {'ZONE A': 23, 'ZONE B': 28}
    assert zones['WR-V'] == {'ZONE A': 23, 'ZONE B': 30}
    assert all(row['map_position'] is None for row in data['equipment'])
    assert all(row.get('snapshot_label', '').startswith('September') for row in data['equipment'])
    assert len(data.get('corrective_actions', [])) == 4

"""Validate the curated local mythology knowledge base without changing it."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dataset_service import DATASET_PATH, Dataset, DatasetError, REQUIRED_FIELDS


def main():
    try:
        dataset = Dataset.load(DATASET_PATH)
    except DatasetError as error:
        print(f'Dataset invalid: {error}')
        return 1

    report = dataset.validation_report()
    problems = list(report['invalid_records'])
    problems.extend({'id': record_id, 'issue': 'duplicate id'}
                    for record_id in report['duplicate_ids'])
    problems.extend({'id': record_id, 'issue': 'missing source'}
                    for record_id in report['missing_sources'])
    if problems:
        print(json.dumps({'status': 'invalid', 'problems': problems}, indent=2))
        return 1

    # Check the raw files as well, so malformed extension data cannot be hidden
    # by the Dataset loader's per-record validation.
    for path in (DATASET_PATH,):
        with open(path, encoding='utf-8') as handle:
            raw = json.load(handle)
        for index, record in enumerate(raw):
            missing = [field for field in REQUIRED_FIELDS if field not in record]
            if missing:
                print(f'{path.name}[{index}] missing: {", ".join(missing)}')
                return 1

    print(json.dumps({
        'status': 'valid',
        'records': report['record_count'],
        'categories': len(report['categories']),
        'sources_present': True,
    }, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())

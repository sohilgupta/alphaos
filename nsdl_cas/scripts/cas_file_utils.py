from __future__ import annotations

import re
from pathlib import Path

from detect_missing import last_day_of_month


MONTH_MAP = {
    "JAN": 1,
    "FEB": 2,
    "MAR": 3,
    "APR": 4,
    "MAY": 5,
    "JUN": 6,
    "JUL": 7,
    "AUG": 8,
    "SEP": 9,
    "OCT": 10,
    "NOV": 11,
    "DEC": 12,
}


def parse_statement_date_from_filename(filename: str) -> str | None:
    iso_match = re.match(r"^(\d{4}-\d{2}-\d{2})_", filename)
    if iso_match:
        return iso_match.group(1)

    month_match = re.search(r"_(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)_(\d{4})", filename.upper())
    if not month_match:
        return None

    month = MONTH_MAP[month_match.group(1)]
    year = int(month_match.group(2))
    return last_day_of_month(year, month).isoformat()


def canonical_pdf_filename(statement_date: str, original_filename: str) -> str:
    month_match = re.search(r"_(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)_(\d{4})", original_filename.upper())
    if month_match:
        month_token = month_match.group(1)
        year_token = month_match.group(2)
    else:
        year_token, month_number, _ = statement_date.split("-")
        reverse_month_map = {value: key for key, value in MONTH_MAP.items()}
        month_token = reverse_month_map[int(month_number)]

    return f"{statement_date}_NSDLe-CAS_106602284_{month_token}_{year_token}.PDF"


def iter_pdf_paths(directory: Path) -> list[Path]:
    return sorted(path for path in directory.iterdir() if path.is_file() and path.suffix.lower() == ".pdf")

from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Detect missing NSDL CAS statement dates from the SQLite snapshots table.",
    )
    parser.add_argument(
        "--db-path",
        default="data/net_worth.db",
        help="SQLite database path.",
    )
    parser.add_argument(
        "--start-date",
        help="Optional start date in YYYY-MM-DD. Defaults to the earliest snapshot date.",
    )
    parser.add_argument(
        "--end-date",
        help="Optional end date in YYYY-MM-DD. Defaults to the last day of the previous month.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit JSON instead of plain text.",
    )
    return parser.parse_args()


def parse_iso_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def last_day_of_month(year: int, month: int) -> date:
    if month == 12:
        return date(year + 1, 1, 1) - timedelta(days=1)
    return date(year, month + 1, 1) - timedelta(days=1)


def last_completed_month_end(today: date | None = None) -> date:
    current = today or date.today()
    first_of_month = current.replace(day=1)
    return first_of_month - timedelta(days=1)


def month_end_series(start_date: date, end_date: date) -> list[date]:
    if start_date > end_date:
        return []

    cursor = last_day_of_month(start_date.year, start_date.month)
    month_ends: list[date] = []
    while cursor <= end_date:
        if cursor >= start_date:
            month_ends.append(cursor)
        if cursor.month == 12:
            cursor = last_day_of_month(cursor.year + 1, 1)
        else:
            cursor = last_day_of_month(cursor.year, cursor.month + 1)
    return month_ends


def load_snapshot_dates(connection: sqlite3.Connection) -> list[date]:
    rows = connection.execute("SELECT date FROM snapshots ORDER BY date").fetchall()
    return [parse_iso_date(row[0]) for row in rows]


def resolve_date_window(
    snapshot_dates: list[date],
    start_date: str | None = None,
    end_date: str | None = None,
) -> tuple[date, date]:
    if start_date:
        resolved_start = parse_iso_date(start_date)
    elif snapshot_dates:
        resolved_start = snapshot_dates[0]
    else:
        raise ValueError("No snapshots found. Provide --start-date to define the expected range.")

    resolved_end = parse_iso_date(end_date) if end_date else last_completed_month_end()
    if resolved_end < resolved_start:
        raise ValueError("Resolved end date is earlier than the start date.")
    return resolved_start, resolved_end


def detect_missing_dates(
    connection: sqlite3.Connection,
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[str]:
    snapshot_dates = load_snapshot_dates(connection)
    resolved_start, resolved_end = resolve_date_window(snapshot_dates, start_date, end_date)
    expected_dates = month_end_series(resolved_start, resolved_end)
    existing = {snapshot_date.isoformat() for snapshot_date in snapshot_dates}
    return [statement_date.isoformat() for statement_date in expected_dates if statement_date.isoformat() not in existing]


def main() -> None:
    args = parse_args()
    db_path = Path(args.db_path).expanduser().resolve()
    if not db_path.exists():
        raise FileNotFoundError(f"SQLite database does not exist: {db_path}")

    with sqlite3.connect(db_path) as connection:
        missing_dates = detect_missing_dates(
            connection,
            start_date=args.start_date,
            end_date=args.end_date,
        )

    if args.json:
        print(json.dumps({"missing_statement_dates": missing_dates}, indent=2))
        return

    if not missing_dates:
        print("No missing statement dates detected.")
        return

    for statement_date in missing_dates:
        print(statement_date)


if __name__ == "__main__":
    main()

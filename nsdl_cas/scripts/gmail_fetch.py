from __future__ import annotations

import argparse
import base64
import io
import sqlite3
from collections import defaultdict
from collections.abc import Iterable
from datetime import datetime, timedelta
from pathlib import Path

import fitz
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

from cas_file_utils import canonical_pdf_filename, parse_statement_date_from_filename
from detect_missing import detect_missing_dates, parse_iso_date
from parse import extract_statement_date


SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
KNOWN_SENDERS = ("cas@nsdl.co.in",)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download only missing NSDL CAS PDFs from Gmail using OAuth.",
    )
    parser.add_argument(
        "--db-path",
        default="data/net_worth.db",
        help="SQLite database path.",
    )
    parser.add_argument(
        "--output-dir",
        default="cas_pdfs",
        help="Directory where missing PDFs will be saved.",
    )
    parser.add_argument(
        "--credentials-file",
        default="credentials.json",
        help="OAuth client credentials JSON from Google Cloud.",
    )
    parser.add_argument(
        "--token-file",
        default="token.json",
        help="Path used to cache the Gmail OAuth token.",
    )
    parser.add_argument(
        "--start-date",
        help="Optional start date in YYYY-MM-DD for missing-date detection.",
    )
    parser.add_argument(
        "--end-date",
        help="Optional end date in YYYY-MM-DD for missing-date detection.",
    )
    parser.add_argument(
        "--pdf-password",
        help="Optional CAS PDF password (PAN in uppercase) used to inspect ambiguous PDFs before saving.",
    )
    parser.add_argument(
        "--max-messages",
        type=int,
        default=500,
        help="Maximum Gmail messages to inspect per search query.",
    )
    return parser.parse_args()


def build_gmail_service(credentials_file: Path, token_file: Path):
    creds: Credentials | None = None
    if token_file.exists():
        creds = Credentials.from_authorized_user_file(str(token_file), SCOPES)

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    elif not creds or not creds.valid:
        flow = InstalledAppFlow.from_client_secrets_file(str(credentials_file), SCOPES)
        creds = flow.run_local_server(port=0)

    token_file.write_text(creds.to_json(), encoding="utf-8")
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def gmail_search_queries_for_date(statement_date: str) -> list[str]:
    target = parse_iso_date(statement_date)
    after_date = target - timedelta(days=7)
    before_date = target + timedelta(days=45)
    date_window = f"after:{after_date:%Y/%m/%d} before:{before_date:%Y/%m/%d}"

    return [
        f'from:cas@nsdl.co.in has:attachment filename:pdf {date_window}',
        f'has:attachment filename:pdf subject:"Consolidated Account Statement" {date_window}',
        f'has:attachment filename:pdf subject:CAS {date_window}',
    ]


def list_message_ids(service, query: str, max_messages: int) -> list[str]:
    message_ids: list[str] = []
    page_token: str | None = None

    while len(message_ids) < max_messages:
        response = (
            service.users()
            .messages()
            .list(userId="me", q=query, pageToken=page_token, maxResults=min(100, max_messages - len(message_ids)))
            .execute()
        )
        for message in response.get("messages", []):
            message_ids.append(message["id"])

        page_token = response.get("nextPageToken")
        if not page_token:
            break

    return message_ids


def walk_parts(payload: dict) -> Iterable[dict]:
    yield payload
    for part in payload.get("parts", []) or []:
        yield from walk_parts(part)


def is_probable_nsdl_cas(filename: str) -> bool:
    upper_name = filename.upper()
    return "CAS" in upper_name or "NSDL" in upper_name


def existing_pdf_filenames(output_dir: Path) -> set[str]:
    return {path.name.lower() for path in output_dir.glob("*.pdf")}


def existing_statement_dates(output_dir: Path) -> set[str]:
    dates: set[str] = set()
    for path in output_dir.glob("*.pdf"):
        parsed = parse_statement_date_from_filename(path.name)
        if parsed:
            dates.add(parsed)
    return dates


def fetch_attachment_bytes(service, message_id: str, attachment_id: str) -> bytes:
    attachment = (
        service.users()
        .messages()
        .attachments()
        .get(userId="me", messageId=message_id, id=attachment_id)
        .execute()
    )
    data = attachment.get("data", "")
    return base64.urlsafe_b64decode(data.encode("utf-8"))


def extract_statement_date_from_pdf_bytes(pdf_bytes: bytes, password: str | None) -> str | None:
    if not password:
        return None

    document = fitz.open(stream=io.BytesIO(pdf_bytes), filetype="pdf")
    try:
        if document.needs_pass and not document.authenticate(password):
            return None

        preview_pages = [document.load_page(index).get_text("text") for index in range(min(3, document.page_count))]
        return extract_statement_date("\n".join(preview_pages))
    except Exception:  # noqa: BLE001
        return None
    finally:
        document.close()


def attachment_target_date(
    filename: str,
    pdf_bytes: bytes | None,
    pdf_password: str | None,
) -> str | None:
    by_filename = parse_statement_date_from_filename(filename)
    if by_filename:
        return by_filename

    if pdf_bytes is None:
        return None

    return extract_statement_date_from_pdf_bytes(pdf_bytes, pdf_password)


def detect_missing_from_db(db_path: Path, start_date: str | None, end_date: str | None) -> list[str]:
    with sqlite3.connect(db_path) as connection:
        return detect_missing_dates(connection, start_date=start_date, end_date=end_date)


def message_received_date(message: dict) -> str:
    internal_millis = message.get("internalDate")
    if not internal_millis:
        return "unknown"
    return datetime.fromtimestamp(int(internal_millis) / 1000).date().isoformat()


def save_pdf(output_dir: Path, filename: str, content: bytes) -> Path:
    output_path = output_dir / filename
    output_path.write_bytes(content)
    return output_path


def fetch_missing_cas_pdfs(
    service,
    missing_dates: set[str],
    output_dir: Path,
    pdf_password: str | None,
    max_messages: int,
) -> tuple[list[str], list[str]]:
    existing_names = existing_pdf_filenames(output_dir)
    existing_dates = existing_statement_dates(output_dir)
    downloaded_paths: list[str] = []
    not_found_dates: list[str] = []
    inspected_message_ids_by_date: defaultdict[str, set[str]] = defaultdict(set)

    for statement_date in sorted(missing_dates):
        found_for_date = False

        for query in gmail_search_queries_for_date(statement_date):
            for message_id in list_message_ids(service, query, max_messages):
                if message_id in inspected_message_ids_by_date[statement_date]:
                    continue
                inspected_message_ids_by_date[statement_date].add(message_id)

                message = (
                    service.users()
                    .messages()
                    .get(userId="me", id=message_id, format="full")
                    .execute()
                )

                for part in walk_parts(message.get("payload", {})):
                    filename = (part.get("filename") or "").strip()
                    body = part.get("body", {})
                    attachment_id = body.get("attachmentId")
                    if not filename or not attachment_id or not filename.lower().endswith(".pdf"):
                        continue
                    if not is_probable_nsdl_cas(filename):
                        continue

                    pdf_bytes: bytes | None = None
                    target_date = parse_statement_date_from_filename(filename)
                    if target_date != statement_date:
                        # Only inspect attachment bytes for ambiguous candidate PDFs in this date window.
                        if target_date is not None:
                            continue
                        pdf_bytes = fetch_attachment_bytes(service, message_id, attachment_id)
                        target_date = attachment_target_date(filename, pdf_bytes, pdf_password)
                        if target_date != statement_date:
                            continue

                    canonical_name = canonical_pdf_filename(statement_date, filename)
                    if canonical_name.lower() in existing_names or statement_date in existing_dates:
                        found_for_date = True
                        break

                    if pdf_bytes is None:
                        pdf_bytes = fetch_attachment_bytes(service, message_id, attachment_id)

                    saved_path = save_pdf(output_dir, canonical_name, pdf_bytes)
                    downloaded_paths.append(f"{saved_path.name} ({statement_date}, email {message_received_date(message)})")
                    existing_names.add(canonical_name.lower())
                    existing_dates.add(statement_date)
                    found_for_date = True
                    break

                if found_for_date:
                    break

            if found_for_date:
                break

        if found_for_date:
            missing_dates.discard(statement_date)
        else:
            not_found_dates.append(statement_date)

    return downloaded_paths, not_found_dates


def main() -> None:
    args = parse_args()
    db_path = Path(args.db_path).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    credentials_file = Path(args.credentials_file).expanduser().resolve()
    token_file = Path(args.token_file).expanduser().resolve()

    if not db_path.exists():
        raise FileNotFoundError(f"SQLite database does not exist: {db_path}")
    if not credentials_file.exists():
        raise FileNotFoundError(
            f"Gmail OAuth credentials file was not found: {credentials_file}. "
            "Create it in Google Cloud and download the Desktop app OAuth client JSON."
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    missing_dates = set(detect_missing_from_db(db_path, args.start_date, args.end_date))

    if not missing_dates:
        print("No missing statement dates detected. Nothing to fetch from Gmail.")
        return

    print(f"Missing statement dates: {', '.join(sorted(missing_dates))}")
    service = build_gmail_service(credentials_file, token_file)
    downloaded, not_found_dates = fetch_missing_cas_pdfs(
        service,
        missing_dates=missing_dates,
        output_dir=output_dir,
        pdf_password=args.pdf_password,
        max_messages=args.max_messages,
    )

    if downloaded:
        print("Downloaded PDFs:")
        for item in downloaded:
            print(f"- {item}")
    else:
        print("No matching Gmail attachments were found for the missing dates.")

    if not_found_dates:
        print("Still missing:")
        for statement_date in sorted(not_found_dates):
            print(f"- {statement_date}")


if __name__ == "__main__":
    main()

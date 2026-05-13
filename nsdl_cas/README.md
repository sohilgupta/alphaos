# NSDL CAS Net Worth Pipeline

Parses password-protected NSDL CAS PDF statements, writes one JSON snapshot per
PDF, and ingests them into SQLite for net-worth tracking. Replaces the original
standalone Streamlit project — the dashboard view now lives in the alphaos
Next.js app at `/dashboard/nsdl` (owner-only).

## Layout (monorepo)

```text
alphaos/
├── nsdl_cas/
│   ├── scripts/
│   │   ├── cas_file_utils.py     Shared CAS filename/date helpers
│   │   ├── rename_cas_files.py   YYYY-MM-DD_*.PDF normaliser
│   │   ├── parse.py              PDF → JSON parser (PyMuPDF)
│   │   ├── ingest.py             JSON → SQLite ingestion
│   │   ├── ingest_latest.py      One-shot rename + parse + ingest workflow
│   │   ├── detect_missing.py     Missing-statement detector
│   │   ├── gmail_fetch.py        Gmail OAuth downloader for missing PDFs
│   │   └── nsdl_cas_to_excel.py  Excel export
│   ├── requirements.txt
│   └── README.md (this file)
└── vault/nsdl/                  ← data (gitignored)
    ├── cas_pdfs/                 Input PDFs (canonical filenames)
    ├── parsed_json/              parse.py output
    └── data/net_worth.db         SQLite, ingest.py target
```

## Setup

```bash
cd nsdl_cas
python3.11 -m venv .venv
./.venv/bin/pip install -r requirements.txt
export ALPHAOS_CAS_PASSWORD=YOUR_PAN_IN_CAPS     # or pass --password
```

## Common workflow — adding a new month's statement

```bash
# 1. Drop the new PDF into vault/nsdl/cas_pdfs/ (filename can be anything;
#    rename_cas_files.py will normalise it to 2026-04-30_NSDLe-CAS_*.PDF).
# 2. Run the one-shot helper:
python nsdl_cas/scripts/ingest_latest.py --only-latest
```

`ingest_latest.py` is idempotent — it renames anything non-canonical, parses
only PDFs whose JSON doesn't exist yet, and ingest.py skips duplicate
snapshots by `statement_date`. Safe to re-run.

## Lower-level commands

Run from the repo root.

```bash
# Rename only
python nsdl_cas/scripts/rename_cas_files.py --input-dir vault/nsdl/cas_pdfs

# Parse all PDFs to JSON
python nsdl_cas/scripts/parse.py \
  --input-dir  vault/nsdl/cas_pdfs \
  --output-dir vault/nsdl/parsed_json \
  --password   $ALPHAOS_CAS_PASSWORD

# Ingest JSON to SQLite
python nsdl_cas/scripts/ingest.py \
  --json-dir vault/nsdl/parsed_json \
  --db-path  vault/nsdl/data/net_worth.db

# Detect months still missing
python nsdl_cas/scripts/detect_missing.py --db-path vault/nsdl/data/net_worth.db

# Fetch missing PDFs from Gmail
python nsdl_cas/scripts/gmail_fetch.py \
  --db-path        vault/nsdl/data/net_worth.db \
  --output-dir     vault/nsdl/cas_pdfs \
  --credentials-file ~/.config/alphaos/credentials.json \
  --token-file       ~/.config/alphaos/gmail_token.json \
  --pdf-password   $ALPHAOS_CAS_PASSWORD
```

## Schema

`snapshots(date, total_value, source_file, inserted_at)` — one row per CAS
statement, keyed by `statement_date` (YYYY-MM-DD month-end).

`holdings(snapshot_date, asset_name, asset_type, value)` — N rows per
snapshot. `asset_type` is one of: `equity`, `mutual_fund`, `bond`,
`government_security`, `money_market`, `securitised_instrument`,
`alternate_investment_fund`, `nps`, `zero_coupon_zero_principal`.

## Assumptions

- NSDL CAS PDFs use the PAN in uppercase as the password.
- Holdings are extracted from the detailed holdings pages, not the summary
  composition table.
- Some historical PDFs vary in layout, so the parser aggregates holdings by
  `(asset_name, asset_type)` inside each statement to reduce duplicate rows
  created by account-level splits.
- Gmail attachment matching prefers the statement month embedded in NSDL CAS
  filenames and only falls back to inspecting PDF contents when the filename
  is ambiguous.

## Gmail API setup (one-time, for `gmail_fetch.py`)

1. Cloud Console → enable Gmail API.
2. Configure OAuth consent screen as `External`.
3. Create OAuth client credentials, type `Desktop app`.
4. Download client JSON → place at `~/.config/alphaos/credentials.json`.
5. Run `gmail_fetch.py` once; the browser will open for consent and a refresh
   token is cached at `~/.config/alphaos/gmail_token.json`.

Scope: `https://www.googleapis.com/auth/gmail.readonly` (read-only).

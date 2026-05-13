"""
One-shot workflow: rename any new CAS PDFs to canonical format, parse them,
ingest into SQLite. Idempotent — safe to run repeatedly.

Default paths assume the alphaos monorepo layout:
  nsdl_cas/scripts/   ← this file
  vault/nsdl/cas_pdfs/
  vault/nsdl/parsed_json/
  vault/nsdl/data/net_worth.db

Override any of these with env vars or CLI flags. The CAS password defaults to
the ALPHAOS_CAS_PASSWORD env var; pass --password to override.

Usage:
    export ALPHAOS_CAS_PASSWORD=YOUR_PAN_IN_CAPS
    python nsdl_cas/scripts/ingest_latest.py            # process all new PDFs
    python nsdl_cas/scripts/ingest_latest.py --only-latest   # latest only
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCRIPTS = Path(__file__).resolve().parent
PDF_DIR = ROOT / "vault" / "nsdl" / "cas_pdfs"
JSON_DIR = ROOT / "vault" / "nsdl" / "parsed_json"
DB_PATH = ROOT / "vault" / "nsdl" / "data" / "net_worth.db"


def run(cmd: list[str], step: str) -> int:
    print(f"\n▸ {step}")
    print(f"  $ {' '.join(cmd)}")
    return subprocess.call(cmd)


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--input-dir", default=str(PDF_DIR), type=Path)
    p.add_argument("--output-dir", default=str(JSON_DIR), type=Path)
    p.add_argument("--db-path", default=str(DB_PATH), type=Path)
    p.add_argument("--password", default=os.environ.get("ALPHAOS_CAS_PASSWORD"))
    p.add_argument("--only-latest", action="store_true",
                   help="Parse only the lexically-latest PDF in input-dir.")
    args = p.parse_args()

    if not args.password:
        print("ERROR: password not provided. Set ALPHAOS_CAS_PASSWORD or pass --password.")
        sys.exit(1)

    args.input_dir.mkdir(parents=True, exist_ok=True)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    args.db_path.parent.mkdir(parents=True, exist_ok=True)

    # Step 1: rename all non-canonical filenames
    rc = run([sys.executable, str(SCRIPTS / "rename_cas_files.py"),
              "--input-dir", str(args.input_dir)],
             "Rename PDFs to canonical YYYY-MM-DD_*.PDF format")
    if rc != 0:
        sys.exit(rc)

    # Step 2: parse PDFs to JSON
    parse_cmd = [sys.executable, str(SCRIPTS / "parse.py"),
                 "--input-dir", str(args.input_dir),
                 "--output-dir", str(args.output_dir),
                 "--password", args.password]
    if args.only_latest:
        # parse.py doesn't have a --only-latest flag; emulate by passing a
        # temporary dir containing just the latest file via symlink.
        latest = sorted(args.input_dir.glob("*.PDF"))[-1]
        print(f"\n▸ Latest PDF: {latest.name}")
        tmp = args.input_dir / "_latest_only"
        tmp.mkdir(exist_ok=True)
        for f in tmp.iterdir():
            f.unlink()
        (tmp / latest.name).symlink_to(latest)
        parse_cmd = [sys.executable, str(SCRIPTS / "parse.py"),
                     "--input-dir", str(tmp),
                     "--output-dir", str(args.output_dir),
                     "--password", args.password]
        rc = run(parse_cmd, f"Parse only {latest.name}")
        for f in tmp.iterdir():
            f.unlink()
        tmp.rmdir()
    else:
        rc = run(parse_cmd, "Parse PDFs → JSON (skips already-parsed)")
    if rc != 0:
        sys.exit(rc)

    # Step 3: ingest JSON to SQLite
    rc = run([sys.executable, str(SCRIPTS / "ingest.py"),
              "--json-dir", str(args.output_dir),
              "--db-path", str(args.db_path)],
             "Ingest JSON → SQLite (skips duplicate snapshots)")
    sys.exit(rc)


if __name__ == "__main__":
    main()

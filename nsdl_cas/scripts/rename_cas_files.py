from __future__ import annotations

import argparse
from pathlib import Path

from cas_file_utils import canonical_pdf_filename, iter_pdf_paths, parse_statement_date_from_filename


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Rename NSDL CAS PDFs into a canonical sortable filename format.",
    )
    parser.add_argument(
        "--input-dir",
        default="cas_pdfs",
        help="Directory containing CAS PDFs.",
    )
    return parser.parse_args()


def rename_cas_files(input_dir: Path) -> tuple[int, int]:
    renamed = 0
    skipped = 0

    for pdf_path in iter_pdf_paths(input_dir):
        statement_date = parse_statement_date_from_filename(pdf_path.name)
        if not statement_date:
            skipped += 1
            print(f"Skipped {pdf_path.name}: could not infer statement date from filename")
            continue

        target_name = canonical_pdf_filename(statement_date, pdf_path.name)
        target_path = pdf_path.with_name(target_name)
        if target_path == pdf_path:
            skipped += 1
            continue

        if target_path.exists():
            skipped += 1
            print(f"Skipped {pdf_path.name}: target already exists as {target_name}")
            continue

        pdf_path.rename(target_path)
        renamed += 1
        print(f"Renamed {pdf_path.name} -> {target_name}")

    return renamed, skipped


def main() -> None:
    args = parse_args()
    input_dir = Path(args.input_dir).expanduser().resolve()
    if not input_dir.exists():
        raise FileNotFoundError(f"Input directory does not exist: {input_dir}")

    renamed, skipped = rename_cas_files(input_dir)
    print(f"Completed renaming. Renamed: {renamed}, Skipped: {skipped}")


if __name__ == "__main__":
    main()

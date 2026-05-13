from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable

import fitz


DATE_FORMAT = "%d-%b-%Y"

SECTION_ALIASES = {
    "equities (e)": "equity",
    "mutual fund folios (f)": "mutual_fund",
    "mutual funds (m)": "mutual_fund",
    "corporate bonds (c)": "bond",
    "government securities (g)": "government_security",
    "money market instruments (i)": "money_market",
    "securitised instruments (s)": "securitised_instrument",
    "alternate investment fund (a)": "alternate_investment_fund",
    "national pension system (n)": "nps",
    "zero coupon zero principal(z)": "zero_coupon_zero_principal",
    "zero coupon zero principal (z)": "zero_coupon_zero_principal",
}

IGNORED_LINE_PATTERNS = (
    re.compile(r"^page \d+$", re.IGNORECASE),
    re.compile(r"^consolidated account statement$", re.IGNORECASE),
    re.compile(r"^(summary|holdings|transactions|your account|about nsdl)$", re.IGNORECASE),
    re.compile(r"^portfolio value trend$", re.IGNORECASE),
    re.compile(r"^monthly movement of your consolidated portfolio value", re.IGNORECASE),
)

ISIN_PATTERN = re.compile(r"^[A-Z0-9]{12}$")
AMOUNT_PATTERN = re.compile(r"[-+]?\d[\d,]*\.\d+")


@dataclass
class Holding:
    name: str
    asset_type: str
    value: float


@dataclass
class ParsedStatement:
    source_file: str
    statement_date: str
    total_portfolio_value: float
    holdings: list[Holding]
    warnings: list[str]

    def to_dict(self) -> dict:
        return {
            "source_file": self.source_file,
            "statement_date": self.statement_date,
            "total_portfolio_value": self.total_portfolio_value,
            "holdings": [
                {
                    "name": holding.name,
                    "type": holding.asset_type,
                    "value": holding.value,
                }
                for holding in self.holdings
            ],
            "warnings": self.warnings,
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Parse password-protected NSDL CAS PDFs into JSON snapshots.",
    )
    parser.add_argument(
        "--input-dir",
        default="cas_pdfs",
        help="Directory containing NSDL CAS PDFs.",
    )
    parser.add_argument(
        "--output-dir",
        default="parsed_json",
        help="Directory where parsed JSON files will be written.",
    )
    parser.add_argument(
        "--password",
        required=True,
        help="PDF password. For NSDL CAS this is typically the PAN in uppercase.",
    )
    return parser.parse_args()


def clean_amount(value: str) -> float:
    stripped = re.sub(r"[^\d.\-]", "", value.replace(",", ""))
    if not stripped:
        raise ValueError(f"Unable to parse amount from {value!r}")
    return float(stripped)


def iter_pdf_paths(input_dir: Path) -> Iterable[Path]:
    return sorted(path for path in input_dir.iterdir() if path.is_file() and path.suffix.lower() == ".pdf")


def normalize_line(line: str) -> str:
    return re.sub(r"\s+", " ", line).strip()


def should_ignore_line(line: str) -> bool:
    if not line:
        return True
    return any(pattern.search(line) for pattern in IGNORED_LINE_PATTERNS)


def extract_statement_date(text: str) -> str:
    match = re.search(
        r"Statement for the period from \d{2}-[A-Za-z]{3}-\d{4} to (\d{2}-[A-Za-z]{3}-\d{4})",
        text,
        re.IGNORECASE,
    )
    if not match:
        raise ValueError("Statement date not found in CAS text.")
    return datetime.strptime(match.group(1), DATE_FORMAT).date().isoformat()


def extract_total_portfolio_value(text: str) -> float:
    anchors = [
        r"YOUR CONSOLIDATED\s+PORTFOLIO VALUE\s+[`₹]?\s*([0-9,]+\.\d{2})",
        r"Grand Total\s+([0-9,]+\.\d{2})",
    ]
    for pattern in anchors:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return clean_amount(match.group(1))
    raise ValueError("Total portfolio value not found in CAS text.")


def load_pdf_text(pdf_path: Path, password: str) -> list[str]:
    document = fitz.open(pdf_path)
    try:
        if document.needs_pass and not document.authenticate(password):
            raise ValueError(f"Authentication failed for {pdf_path.name}.")
        return [document.load_page(page_number).get_text("text") for page_number in range(document.page_count)]
    finally:
        document.close()


def is_section_heading(line: str) -> bool:
    return line.lower() in SECTION_ALIASES


def is_subtotal_line(line: str) -> bool:
    lowered = line.lower()
    return lowered.startswith("sub total") or lowered == "total"


def extract_amounts_from_block(lines: list[str]) -> list[float]:
    amounts: list[float] = []
    for line in lines:
        for token in AMOUNT_PATTERN.findall(line):
            amounts.append(clean_amount(token))
    return amounts


def select_holding_value(asset_type: str, amounts: list[float]) -> float | None:
    if not amounts:
        return None

    if asset_type == "mutual_fund":
        # Mutual fund rows end with the value columns, while older layouts end with units, NAV, value.
        # In both layouts, the current value is typically the largest magnitude among the final three numbers.
        tail = amounts[-3:] if len(amounts) >= 3 else amounts
        return max(tail, key=abs)

    return amounts[-1]


def is_code_or_identifier(line: str) -> bool:
    if ISIN_PATTERN.match(line):
        return True
    if re.fullmatch(r"[A-Z0-9./#&()' -]{3,}", line) and len(line) <= 24 and any(char.isdigit() for char in line):
        return True
    return False


def looks_like_account_header(line: str) -> bool:
    patterns = (
        r"^(nsdl|cdsl) demat account$",
        r"^dp id:",
        r"^account holder$",
        r"^folio no\.$",
        r"^isin$",
        r"^stock symbol$",
        r"^security$",
        r"^company name$",
        r"^isin description$",
        r"^value in [`₹]$",
        r"^market price",
        r"^face value",
        r"^no\. of",
        r"^nav",
        r"^current bal\.$",
        r"^free bal\.$",
        r"^locked in bal\.$",
        r"^pledged bal\.$",
        r"^earmarked bal\.$",
        r"^lien bal\.$",
        r"^coupon rate",
        r"^maturity date$",
        r"^type of policy$",
    )
    lowered = line.lower()
    return any(re.search(pattern, lowered) for pattern in patterns)


def build_name(block_lines: list[str], asset_type: str) -> str | None:
    descriptive: list[str] = []
    started_numbers = False

    for raw_line in block_lines[1:]:
        line = normalize_line(raw_line)
        if not line or looks_like_account_header(line):
            continue
        if AMOUNT_PATTERN.fullmatch(line):
            started_numbers = True
            continue
        if started_numbers and re.fullmatch(r"[\d,]+", line):
            continue
        if re.fullmatch(r"[A-Z0-9]{4,}", line) and asset_type == "mutual_fund":
            continue
        if re.fullmatch(r"\d{4,}", line):
            continue
        descriptive.append(line)

    if asset_type == "equity" and len(descriptive) >= 2 and re.search(r"\.(NSE|BSE)$", descriptive[0]):
        descriptive = descriptive[1:]

    if asset_type == "mutual_fund" and descriptive and descriptive[0] == "NOT AVAILABLE":
        descriptive = descriptive[1:]

    cleaned = [line for line in descriptive if not is_code_or_identifier(line)]
    if not cleaned:
        return None

    # Mutual fund and bond descriptions can wrap across multiple lines.
    joined = " ".join(cleaned[:4])
    joined = re.sub(r"\s+", " ", joined).strip(" -")
    joined = re.sub(r"\bof which blocked\b", "", joined, flags=re.IGNORECASE)
    joined = re.sub(
        r"\b(Current|Free|Lent|Safekeep|Locked In|Pledge Setup|Pledged|Earmarked|Pledgee)\s+Bal\.?\b",
        "",
        joined,
        flags=re.IGNORECASE,
    )
    joined = re.sub(r"\bin [`']\s*Shares\s+Market\b", "", joined, flags=re.IGNORECASE)
    joined = re.sub(r"\s+", " ", joined).strip(" -")
    return joined or None


def parse_holdings_from_pages(page_texts: list[str]) -> tuple[list[Holding], list[str]]:
    warnings: list[str] = []
    holdings_map: defaultdict[tuple[str, str], float] = defaultdict(float)
    active_section: str | None = None
    current_block: list[str] = []

    combined_text = "\n".join(page_texts)

    # Locate the start of detailed holdings. Try multiple markers because NSDL
    # has subtly changed the layout over the years — the canonical "Holdings
    # as on DD-MMM-YYYY" was missing in the March 2026 statement.
    start_patterns = [
        r"Holdings\s+as on \d{2}-[A-Za-z]{3}-\d{4}",                          # canonical
        r"(?i)Equities\s*\(E\)",                                              # first equity section header
        r"(?i)Mutual\s+Fund\s+Folios\s*\(F\)",                                # MF section header
        r"\b(IN[EF0-9][A-Z0-9]{10})\b",                                       # first ISIN as last resort
    ]
    start_index: int | None = None
    for pat in start_patterns:
        m = re.search(pat, combined_text)
        if m:
            start_index = m.start()
            if pat == start_patterns[0]:
                break  # Prefer the canonical marker; otherwise try them all
            # If using a fallback, walk back to a preceding section header so
            # active_section gets set on the first iteration.
            section_back = list(re.finditer(
                r"(?i)(Equities|Mutual Fund Folios|Mutual Funds|Corporate Bonds|Government Securities|Alternate Investment Fund)\s*\([A-Z]\)",
                combined_text[:start_index]
            ))
            if section_back:
                start_index = section_back[-1].start()
            break

    if start_index is None:
        warnings.append("Holdings section marker not found in CAS text.")
        return [], warnings

    end_markers = [
        r"Transactions\s+for the period from \d{2}-[A-Za-z]{3}-\d{4}",
        r"Mutual Funds Transaction Statement for the Period from \d{2}-[A-Za-z]{3}-\d{4}",
        r"\*\*\*End of Statement\*\*\*",
        r"Know more about your accounts",
    ]

    end_index = len(combined_text)
    for pattern in end_markers:
        end_match = re.search(pattern, combined_text[start_index:], re.IGNORECASE)
        if end_match:
            end_index = min(end_index, start_index + end_match.start())

    holdings_text = combined_text[start_index:end_index]

    def flush_block() -> None:
        nonlocal current_block
        if not current_block or active_section is None:
            current_block = []
            return

        amounts = extract_amounts_from_block(current_block)
        value = select_holding_value(active_section, amounts)
        name = build_name(current_block, active_section)
        if value is None or not name:
            current_block = []
            return

        holdings_map[(name, active_section)] += value
        current_block = []

    for raw_line in holdings_text.splitlines():
        line = normalize_line(raw_line)
        if should_ignore_line(line):
            continue

        lowered = line.lower()
        if is_section_heading(lowered):
            flush_block()
            active_section = SECTION_ALIASES[lowered]
            continue

        if active_section is None:
            continue

        if is_subtotal_line(line):
            flush_block()
            continue

        if looks_like_account_header(line):
            continue

        if ISIN_PATTERN.match(line):
            flush_block()
            current_block = [line]
            continue

        if current_block:
            if is_section_heading(lowered):
                flush_block()
                active_section = SECTION_ALIASES[lowered]
                continue
            current_block.append(line)

    flush_block()

    holdings = [
        Holding(name=name, asset_type=asset_type, value=round(value, 2))
        for (name, asset_type), value in sorted(holdings_map.items())
    ]
    if not holdings:
        warnings.append("No detailed holdings could be parsed from holdings pages.")
    return holdings, warnings


def parse_pdf(pdf_path: Path, password: str) -> ParsedStatement:
    page_texts = load_pdf_text(pdf_path, password)
    combined_text = "\n".join(page_texts)

    statement_date = extract_statement_date(combined_text)
    total_value = extract_total_portfolio_value(combined_text)

    # Statement layouts vary by year, so we scan the full document for the first holdings marker.
    holdings, warnings = parse_holdings_from_pages(page_texts)

    return ParsedStatement(
        source_file=pdf_path.name,
        statement_date=statement_date,
        total_portfolio_value=round(total_value, 2),
        holdings=holdings,
        warnings=warnings,
    )


def write_json(statement: ParsedStatement, output_dir: Path) -> Path:
    safe_stem = Path(statement.source_file).stem.replace(" ", "_")
    # If the source filename already starts with the canonical YYYY-MM-DD prefix
    # (e.g. after rename_cas_files.py), avoid prepending the date a second time.
    if re.match(r"^\d{4}-\d{2}-\d{2}_", safe_stem):
        output_path = output_dir / f"{safe_stem}.json"
    else:
        output_path = output_dir / f"{statement.statement_date}_{safe_stem}.json"
    output_path.write_text(json.dumps(statement.to_dict(), indent=2), encoding="utf-8")
    return output_path


def main() -> None:
    args = parse_args()
    input_dir = Path(args.input_dir).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    if not input_dir.exists():
        raise FileNotFoundError(f"Input directory does not exist: {input_dir}")

    pdf_paths = list(iter_pdf_paths(input_dir))
    if not pdf_paths:
        raise FileNotFoundError(f"No PDF files found in {input_dir}")

    parsed_count = 0
    error_count = 0

    for pdf_path in pdf_paths:
        try:
            parsed = parse_pdf(pdf_path, args.password)
            output_path = write_json(parsed, output_dir)
            parsed_count += 1
            print(f"Parsed {pdf_path.name} -> {output_path.name}")
        except Exception as exc:  # noqa: BLE001
            error_count += 1
            print(f"Failed to parse {pdf_path.name}: {exc}")

    print(f"Completed parsing. Success: {parsed_count}, Failed: {error_count}")


if __name__ == "__main__":
    main()

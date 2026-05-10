"""
Fix the sheet layout mess created by sync_watchlist.py:
- AI Stocks: delete 110 rows of duplicate headers + blanks (rows 99-208),
             place NVT in Power & Grid, GPUS in Data Centers
             remove BHP (wrong tab), skip SND/IPSI (not AI stocks)
- Robotics:  remove duplicate Defence header+RYCEF rows, re-insert RYCEF
             in existing Defence section
- US WL:     remove Uncategorized header + GOOG (already exists as NASDAQ:googl)
- Rare Earth: add BHP to Rare Earth/Strategic Metals section
- Stock WL2:  delete 174 rows of junk, re-place Power & Grid and DC Stack stocks
"""
from __future__ import annotations
import json, sys, time
from pathlib import Path

VAULT = Path(__file__).resolve().parent.parent.parent / "vault"
sys.path.insert(0, str(Path(__file__).resolve().parent))
from update_fair_prices import get_credentials, SHEET_IDS, CREDS_DIR, SCOPES
from google.oauth2.credentials import Credentials
import googleapiclient.discovery

creds = Credentials.from_authorized_user_file(str(CREDS_DIR / "token.json"), SCOPES)
svc   = googleapiclient.discovery.build("sheets", "v4", credentials=creds)

US_SS   = SHEET_IDS["us"]
IND_SS  = SHEET_IDS["india"]

# Numeric sheet IDs (from spreadsheet metadata)
SID = {
    "AI Stocks":        1533328577,
    "Robotics Stocks":  516783492,
    "High Growth":      516378578,
    "Space Exploration":612209168,
    "Rare Earth Metals":1167810963,
    "US Stock Watchlist":1024112014,
    "Stock Watchlist 2":1498181643,
}

VAL_DIR = VAULT / "data" / "valuations"
FIN_DIR = VAULT / "data" / "financials"

BLUE   = {"red": 0.259, "green": 0.522, "blue": 0.957}   # US section headers
ORANGE = {"red": 0.851, "green": 0.329, "blue": 0.110}   # India section headers
WHITE  = {"red": 1.0,   "green": 1.0,   "blue": 1.0}
WHITE_TEXT = {"red": 1.0, "green": 1.0, "blue": 1.0}
BLACK_TEXT = {"red": 0.0, "green": 0.0, "blue": 0.0}


def load_val(ticker):
    f = VAL_DIR / f"{ticker}.json"
    if f.exists():
        d = json.loads(f.read_text())
        if "error" not in d:
            return d
    return {}

def load_fin(ticker):
    f = FIN_DIR / f"{ticker}.json"
    if f.exists():
        d = json.loads(f.read_text())
        if "error" not in d:
            return d
    return {}


def del_rows(sheet_id, start0, end0):
    """Delete rows [start0, end0) (0-indexed)."""
    return {
        "deleteDimension": {
            "range": {
                "sheetId": sheet_id,
                "dimension": "ROWS",
                "startIndex": start0,
                "endIndex": end0,
            }
        }
    }


def ins_row(sheet_id, before0):
    """Insert 1 blank row before 0-indexed position."""
    return {
        "insertDimension": {
            "range": {
                "sheetId": sheet_id,
                "dimension": "ROWS",
                "startIndex": before0,
                "endIndex": before0 + 1,
            },
            "inheritFromBefore": True,
        }
    }


def write_row(sheet_id, row0, values):
    """Write list of cell values starting at col A, row row0 (0-indexed)."""
    cells = []
    for v in values:
        if v is None:
            cells.append({})
        else:
            cells.append({"userEnteredValue": {"stringValue": str(v)} if isinstance(v, str)
                          else {"numberValue": v}})
    return {
        "updateCells": {
            "rows": [{"values": cells}],
            "fields": "userEnteredValue",
            "start": {"sheetId": sheet_id, "rowIndex": row0, "columnIndex": 0},
        }
    }


def color_row(sheet_id, row0, bg, bold=False, text_color=None):
    tc = text_color or BLACK_TEXT
    fmt = {
        "backgroundColor": bg,
        "textFormat": {"bold": bold, "foregroundColor": tc},
    }
    return {
        "repeatCell": {
            "range": {
                "sheetId": sheet_id,
                "startRowIndex": row0,
                "endRowIndex": row0 + 1,
                "startColumnIndex": 0,
                "endColumnIndex": 26,
            },
            "cell": {"userEnteredFormat": fmt},
            "fields": "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat",
        }
    }


def us_stock_row(sheet_id, row0, ticker, col_g, col_i=None, col_j=None):
    """Write B=ticker, C=name, D=desc, G=FV, I=verdict, J=conf for a US stock row."""
    fin = load_fin(ticker)
    val = load_val(ticker)
    name = fin.get("name") or ticker
    industry = fin.get("industry") or ""
    sector   = fin.get("sector") or ""
    desc     = f"{industry}; {sector.lower()} sector" if industry and sector else industry or sector
    fv  = val.get("weighted_fair_value")
    ver = val.get("verdict", "")
    conf= val.get("confidence", "")

    reqs = []
    # B,C,D
    reqs.append(write_row(sheet_id, row0,
        [None, ticker, name, desc]))
    # G (col index 6)
    if fv is not None:
        reqs.append({
            "updateCells": {
                "rows": [{"values": [{"userEnteredValue": {"numberValue": fv}}]}],
                "fields": "userEnteredValue",
                "start": {"sheetId": sheet_id, "rowIndex": row0, "columnIndex": 6},
            }
        })
    # I (col 8), J (col 9)
    if ver and col_i is not None:
        reqs.append({
            "updateCells": {
                "rows": [{"values": [
                    {"userEnteredValue": {"stringValue": ver}},
                    {"userEnteredValue": {"stringValue": conf}},
                ]}],
                "fields": "userEnteredValue",
                "start": {"sheetId": sheet_id, "rowIndex": row0, "columnIndex": 8},
            }
        })
    reqs.append(color_row(sheet_id, row0, WHITE))
    return reqs


def india_stock_row(sheet_id, row0, ticker, nse_code):
    """Write A=name, B=nse:code, F=FV, H=verdict, I=conf for an India stock row."""
    fin = load_fin(ticker)
    val = load_val(ticker)
    name = fin.get("name") or ticker
    fv   = val.get("weighted_fair_value")
    ver  = val.get("verdict", "")
    conf = val.get("confidence", "")

    reqs = []
    reqs.append(write_row(sheet_id, row0, [name, nse_code]))
    if fv is not None:
        reqs.append({
            "updateCells": {
                "rows": [{"values": [{"userEnteredValue": {"numberValue": fv}}]}],
                "fields": "userEnteredValue",
                "start": {"sheetId": sheet_id, "rowIndex": row0, "columnIndex": 5},  # col F
            }
        })
    if ver:
        reqs.append({
            "updateCells": {
                "rows": [{"values": [
                    {"userEnteredValue": {"stringValue": ver}},
                    {"userEnteredValue": {"stringValue": conf}},
                ]}],
                "fields": "userEnteredValue",
                "start": {"sheetId": sheet_id, "rowIndex": row0, "columnIndex": 7},  # col H
            }
        })
    reqs.append(color_row(sheet_id, row0, WHITE))
    return reqs


def section_header_row(sheet_id, row0, label, bg, text_color=WHITE_TEXT):
    reqs = [
        write_row(sheet_id, row0, [label]),
        color_row(sheet_id, row0, bg, bold=True, text_color=text_color),
    ]
    return reqs


def execute(ss_id, requests, label):
    if not requests:
        print(f"  {label}: nothing to do")
        return
    svc.spreadsheets().batchUpdate(
        spreadsheetId=ss_id,
        body={"requests": requests}
    ).execute()
    print(f"  {label}: {len(requests)} ops applied")
    time.sleep(2)


# ─────────────────────────────────────────────────────────────────────────────
# 1. AI Stocks cleanup
# ─────────────────────────────────────────────────────────────────────────────
print("\n[AI Stocks]")
ai_sid = SID["AI Stocks"]
reqs = []

# Delete rows 99-208 (0-indexed 98..208) — all duplicates + blanks
reqs.append(del_rows(ai_sid, 98, 208))
execute(US_SS, reqs, "delete duplicate rows 99-208")
time.sleep(1)

# Now tab has 98 rows.
# Insert NVT after row 9 (STM, last in Power & Grid). Row 10 becomes NVT.
reqs2 = []
reqs2.append(ins_row(ai_sid, 9))      # row 10 (0-indexed 9)
reqs2 += us_stock_row(ai_sid, 9, "NVT", col_g=True, col_i=True, col_j=True)

# After NVT insert: Data Centers header is at row 11, stocks 12-15 (JBL,EQIX,DLR,AMT)
# Insert GPUS after AMT (row 15). Row 16 becomes GPUS.
reqs2.append(ins_row(ai_sid, 15))     # row 16 (0-indexed 15)
reqs2 += us_stock_row(ai_sid, 15, "GPUS", col_g=True, col_i=True, col_j=True)

execute(US_SS, reqs2, "insert NVT (Power & Grid) and GPUS (Data Centers)")

# ─────────────────────────────────────────────────────────────────────────────
# 2. Robotics Stocks cleanup
# ─────────────────────────────────────────────────────────────────────────────
print("\n[Robotics Stocks]")
rob_sid = SID["Robotics Stocks"]
reqs3 = []

# Delete rows 77-78 (0-indexed 76..78) — duplicate Defence header + RYCEF
reqs3.append(del_rows(rob_sid, 76, 78))

# Now tab has 96 rows. Defence section: header row 9, stocks rows 10-31 (LPTH last).
# Insert RYCEF after row 31 (0-indexed 31) — before Industrial Robots header.
reqs3.append(ins_row(rob_sid, 31))   # row 32 (0-indexed 31)
reqs3 += us_stock_row(rob_sid, 31, "RYCEF", col_g=True, col_i=True, col_j=True)

execute(US_SS, reqs3, "delete dup Defence header, re-insert RYCEF at row 32")

# ─────────────────────────────────────────────────────────────────────────────
# 3. US Stock Watchlist cleanup
# ─────────────────────────────────────────────────────────────────────────────
print("\n[US Stock Watchlist]")
wl_sid = SID["US Stock Watchlist"]
reqs4 = [del_rows(wl_sid, 60, 62)]   # rows 61-62: Uncategorized header + GOOG
execute(US_SS, reqs4, "delete Uncategorized header + GOOG rows 61-62")

# ─────────────────────────────────────────────────────────────────────────────
# 4. Rare Earth Metals — add BHP
# ─────────────────────────────────────────────────────────────────────────────
print("\n[Rare Earth Metals]")
re_sid = SID["Rare Earth Metals"]
reqs5 = []
# Rare Earth / Strategic Metals section ends at row 25 (AXTI).
# Insert BHP after row 25, before Lithium header (row 26).
reqs5.append(ins_row(re_sid, 25))   # row 26 (0-indexed 25)
reqs5 += us_stock_row(re_sid, 25, "BHP", col_g=True, col_i=True, col_j=True)
execute(US_SS, reqs5, "insert BHP in Rare Earth / Strategic Metals")

# ─────────────────────────────────────────────────────────────────────────────
# 5. Stock Watchlist 2 (India) cleanup
# ─────────────────────────────────────────────────────────────────────────────
print("\n[Stock Watchlist 2 — India]")
sw2_sid = SID["Stock Watchlist 2"]
reqs6 = []

# Delete rows 64-237 (0-indexed 63..237) — all junk
reqs6.append(del_rows(sw2_sid, 63, 237))
execute(IND_SS, reqs6, "delete junk rows 64-237")
time.sleep(1)

# Now tab has 63 rows.
# Power & Grid India section: header row 62, KRN row 63.
# Insert TARIL, AMARAJABAT, EXIDE, SHILCHAR into Power & Grid section.
reqs7 = []
for i, (ticker, code) in enumerate([
    ("TARIL",      "nse:taril"),
    ("AMARAJABAT", "nse:amarajabat"),
    ("EXIDE",      "nse:exide"),
    ("SHILCHAR",   "nse:shilchar"),
]):
    row0 = 63 + i   # 0-indexed: rows 64,65,66,67 → 0-indexed 63,64,65,66
    reqs7.append(ins_row(sw2_sid, row0))
    reqs7 += india_stock_row(sw2_sid, row0, ticker, code)

# Add India Data Center Stack section after the 4 new Power stocks.
# Power & Grid rows now: 62(header),63(KRN),64(TARIL),65(AMARAJABAT),66(EXIDE),67(SHILCHAR)
# DC Stack header at row 68 (0-indexed 67), then AMBER(69), TATACOMM(70), RASHI(71)
dc_stocks = [
    ("AMBER",    "nse:amber"),
    ("TATACOMM", "nse:tatacomm"),
    ("RASHI",    "nse:rashi"),
]
reqs7.append(ins_row(sw2_sid, 67))    # row 68 header (0-indexed 67)
reqs7 += section_header_row(sw2_sid, 67, "India Data Center Stack", ORANGE)

for i, (ticker, code) in enumerate(dc_stocks):
    row0 = 68 + i   # 0-indexed 68,69,70
    reqs7.append(ins_row(sw2_sid, row0))
    reqs7 += india_stock_row(sw2_sid, row0, ticker, code)

execute(IND_SS, reqs7, "insert Power & Grid stocks + India DC Stack section")

print("\nDone — all layout fixes applied.")

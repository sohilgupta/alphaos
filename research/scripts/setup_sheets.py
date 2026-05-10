"""
One-time setup: authenticate with Google Sheets API and verify sheet access.

Steps:
  1. Go to console.cloud.google.com
  2. Create a project (or use existing)
  3. Enable "Google Sheets API"
  4. Credentials → + Create Credentials → OAuth 2.0 Client ID
  5. Application type: Desktop app
  6. Download JSON → save as ~/.config/alphaos/credentials.json
  7. Run: python scripts/setup_sheets.py
"""
from pathlib import Path
import json

CREDS_DIR = Path.home() / ".config" / "alphaos"
CREDS_FILE = CREDS_DIR / "credentials.json"
TOKEN_FILE = CREDS_DIR / "token.json"
SHEET_ID = "1HVEG6wtWsm68o3YMgznhhLrlENOARqF41kqrcbJlqq4"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]


def main():
    print("AlphaOS — Google Sheets Setup")
    print("=" * 40)

    if not CREDS_FILE.exists():
        print(f"\nERROR: Credentials file not found at:\n  {CREDS_FILE}")
        print("\nSteps to fix:")
        print("  1. Go to https://console.cloud.google.com")
        print("  2. Create project → Enable 'Google Sheets API'")
        print("  3. Credentials → Create OAuth 2.0 Client ID (Desktop app)")
        print(f"  4. Download JSON → save as {CREDS_FILE}")
        print("  5. Run this script again.")
        return

    print(f"\nFound credentials at {CREDS_FILE}")

    try:
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from google.auth.transport.requests import Request
        import gspread
    except ImportError:
        print("\nERROR: Missing packages. Run:")
        print("  pip install gspread google-auth google-auth-oauthlib google-auth-httplib2")
        return

    creds = None
    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("Refreshing token…")
            creds.refresh(Request())
        else:
            print("\nOpening browser for Google sign-in…")
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDS_FILE), SCOPES)
            creds = flow.run_local_server(port=0)
        TOKEN_FILE.write_text(creds.to_json())
        print(f"Token saved → {TOKEN_FILE}")

    print("\nVerifying sheet access…")
    gc = gspread.authorize(creds)
    sheet = gc.open_by_key(SHEET_ID)
    tabs = [ws.title for ws in sheet.worksheets()]
    print(f"\nConnected: '{sheet.title}'")
    print(f"Tabs ({len(tabs)}): {', '.join(tabs)}")
    print("\nSetup complete. You can now run:")
    print("  python scripts/sync_watchlist.py --dry-run")


if __name__ == "__main__":
    main()

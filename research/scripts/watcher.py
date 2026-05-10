"""
Filesystem watcher. Monitors /raw/ and triggers ingest.py on new .md files.

Usage:
    python scripts/watcher.py
    python scripts/watcher.py --no-fetch   # skip yfinance calls
"""
import argparse
import subprocess
import sys
import time
from pathlib import Path

from watchdog.events import FileSystemEventHandler, FileCreatedEvent
from watchdog.observers import Observer

VAULT = Path(__file__).resolve().parent.parent.parent / "vault"
RAW_DIR = VAULT / "raw"


class RawHandler(FileSystemEventHandler):
    def __init__(self, no_fetch: bool):
        self.no_fetch = no_fetch
        self._cooldown: set[str] = set()

    def on_created(self, event: FileCreatedEvent):
        if event.is_directory:
            return
        path = Path(event.src_path)
        if path.suffix.lower() != ".md":
            return
        if str(path) in self._cooldown:
            return

        self._cooldown.add(str(path))
        print(f"\nNew file detected: {path.relative_to(VAULT)}")
        self._run_pipeline()

    def _run_pipeline(self):
        cmd = [sys.executable, str(Path(__file__).resolve().parent / "pipeline.py"), "run"]
        if self.no_fetch:
            cmd.append("--no-fetch")
        subprocess.run(cmd, cwd=str(VAULT))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-fetch", action="store_true")
    args = parser.parse_args()

    handler = RawHandler(no_fetch=args.no_fetch)
    observer = Observer()
    observer.schedule(handler, str(RAW_DIR), recursive=True)
    observer.start()

    print(f"Watching {RAW_DIR.relative_to(VAULT)}/ for new .md files…")
    print("Drop files into /raw/ to trigger the pipeline. Ctrl+C to stop.\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()


if __name__ == "__main__":
    main()

# AlphaOS

Investor-grade portfolio analytics + research pipeline.

## Layout

```
alphaos/
├── dashboard/   Next.js app (Vercel-deployed). Reads Google Sheets, renders dashboard.
├── research/    Python pipeline. Ingests sources, computes fair price, writes to Sheets.
├── vault/       Obsidian vault — research data, themes, memos, raw articles. (Gitignored.)
├── shared/      Schema contract between dashboard and research. Read this first.
└── README.md
```

The seam between dashboard and research is the two Google Sheets listed in
`shared/SCHEMA.md`. Research **writes** verdict / confidence / fair-price
columns; dashboard **reads** them.

## Dashboard

```bash
cd dashboard
npm install
npm run dev      # http://localhost:3000
npm run build    # production build (Vercel runs this)
```

Vercel deploys the `dashboard/` subdirectory only — set **Root Directory** to
`dashboard` in the Vercel project settings (Project → Settings → General).

## Research

```bash
cd research
python3 -m venv .venv && source .venv/bin/activate
pip install -r scripts/requirements.txt

# Configure Google Sheets credentials (one-time)
mkdir -p ~/.config/alphaos
# place OAuth client credentials at ~/.config/alphaos/credentials.json
python scripts/setup_sheets.py

# Run the pipeline
python scripts/pipeline.py run        # extract → fetch → score → sync
python scripts/pipeline.py queue      # show tickers needing Claude valuation
python scripts/pipeline.py sync       # push valuations to Sheets
python scripts/watcher.py             # auto-trigger on new files in vault/raw/
```

Scripts default to `vault/` for data. Override with `ALPHAOS_VAULT=/path/to/vault`.

## Vault

Open `vault/` in Obsidian. The `.obsidian/` config travels with the repo;
the data inside (data/, raw/, processed/, memos/, logs/) is gitignored.

## Schema

Anything that crosses the dashboard ↔ research boundary is documented in
`shared/SCHEMA.md` — sheet column mappings, canonical verdict / confidence
values, ticker formats. Update both sides when you change either.

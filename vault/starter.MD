AlphaOS Obsidian Vault Starter Pack

Folder Structure

Vault/
│
├── raw/
│   ├── twitter/
│   ├── screenshots/
│   ├── youtube/
│   ├── earnings/
│   ├── research/
│   ├── articles/
│   ├── podcasts/
│   └── misc/
│
├── themes/
│
├── entities/
│   ├── stocks/
│   ├── sectors/
│   ├── technologies/
│   ├── people/
│   ├── companies/
│   └── funds/
│
├── timelines/
│
├── memos/
│
├── dashboards/
│
├── logs/
│
├── inbox/
│
├── archive/
│
└── system/
    ├── AGENTS.md
    ├── WORKFLOW.md
    ├── INGEST_RULES.md
    └── STYLE_GUIDE.md

⸻

Create These Empty Files

/system/AGENTS.md
/system/WORKFLOW.md
/system/INGEST_RULES.md
/system/STYLE_GUIDE.md
/themes/_INDEX.md
/entities/stocks/_INDEX.md
/entities/sectors/_INDEX.md
/entities/technologies/_INDEX.md
/entities/people/_INDEX.md
/entities/companies/_INDEX.md
/entities/funds/_INDEX.md
/timelines/_MASTER_TIMELINE.md
/logs/DAILY_LOG.md
/dashboards/README.md
/inbox/README.md

⸻

/system/AGENTS.md

# AlphaOS Market Memory System
This repository is a persistent investment intelligence system.
Purpose:
- accumulate market intelligence
- preserve investment context
- track evolving narratives
- maintain relationships between themes/entities
- compound market understanding over time
The system should continuously:
- process raw sources
- extract entities/themes
- update relevant pages
- maintain historical continuity
- preserve source attribution
- build interconnected market knowledge
Use concise markdown.
Prefer linked entities/themes.
Avoid repetitive summaries.
Focus on relationships, evolution, and synthesis.

⸻

/system/WORKFLOW.md

# Workflow
When new sources are added to /raw/:
1. Read source
2. Extract:
   - entities
   - themes
   - relationships
   - catalysts
   - risks
3. Update relevant pages
4. Create missing important pages
5. Add timeline entries
6. Preserve historical continuity
7. Link related concepts
The system should evolve continuously over time.

⸻

/system/INGEST_RULES.md

# Ingest Rules
Raw sources are immutable.
Never modify:
- screenshots
- tweets
- PDFs
- transcripts
- articles
Instead:
- synthesize
- structure
- connect
- update themes/entities/timelines
Themes are more important than isolated notes.
Prefer:
- linked knowledge
- evolving narratives
- relationship tracking
- timeline continuity

⸻

/system/STYLE_GUIDE.md

# Style Guide
Prefer:
- concise synthesis
- markdown tables
- linked entities
- timeline entries
- relationship mapping
Avoid:
- fluff
- repetitive summaries
- generic commentary
- isolated notes without context

⸻

/themes/_INDEX.md

# Theme Index

⸻

/timelines/_MASTER_TIMELINE.md

# Master Timeline

⸻

/logs/DAILY_LOG.md

# Daily Research Log

⸻

/dashboards/README.md

# Dashboards
This folder contains:
- thematic dashboards
- market maps
- watchlists
- relationship views
- narrative tracking dashboards

⸻

/inbox/README.md

# Inbox
Temporary processing area for:
- unprocessed notes
- quick observations
- ideas
- partial research
- rough thoughts
Items should eventually be:
- processed
- linked
- moved
- synthesized

⸻

Initial Workflow

1. Dump screenshots/tweets/articles into /raw/
2. Open Claude Code or Codex in the vault folder
3. Say:
"Process new raw sources.
Update themes.
Update entities.
Update timelines.
Preserve relationships and historical continuity."

That’s enough to begin building a persistent market intelligence system without overengineering the stack initially.
# Theme: AI Infrastructure Capex Supercycle

## Core Thesis
AI infrastructure capex is in a supercycle driven by two converging forces:
1. Hyperscaler commitment to 10x+ capex growth
2. Jevons Paradox — cheaper inference unlocking exponentially greater demand

## Key Data Points
| Metric | Value | Source |
|--------|-------|--------|
| Dario Amodei capex guidance | 10x | [@SanCompounding, 2026-04-12] |
| Actual Q1'26 annualized vs Q1'25 | ~80x | [@hoffwil comment, 2026-05-07] |
| Token price drop (o1-level) | 128x in 12 months | [@demian_ai, 2026-05-07] |
| Net compute bill change | Up, not down | [@demian_ai, 2026-05-07] |
| NVDA acquisition of Groq | ~$20B | [@demian_ai, 2026-05-07] |
| Reasoning model token multiplier | 10x vs non-reasoning | [@demian_ai, 2026-05-07] |
| Agentic workflow request multiplier | ~20x vs single-shot | [@demian_ai, 2026-05-07] |

## Jevons Paradox Mechanics
- 100x cheaper tokens × 10,000x more token consumption = 100x larger total compute bill
- Agents, deep research, persistent memory → new product layer consuming orders of magnitude more compute
- KV cache: scales linearly with context length × agent steps; long agent sessions can hold **tens of GB per user per session**

## CPU:GPU Ratio Shift
| Workload | CPU:GPU |
|----------|---------|
| Training | 1:8 |
| Basic chat inference | 1:4 |
| Agentic inference | 1:1 (sometimes CPU-heavy) |

## Infrastructure Bottlenecks Forming
- KV cache / memory state (DRAM, HBM)
- Optical transceivers (bandwidth at scale)
- Power and cooling
- AI interconnect
- Advanced packaging and semiconductor equipment
- Server integration, structured cabling and data-center buildout

## Related Themes
- [[Jevons-Paradox-AI-Compute]]
- [[Agentic-AI-Demand-Wave]]
- [[AI-Supply-Chain-Broadening]]
- [[India-Data-Center-Stack]]

## Related Entities
### Hyperscalers / Cloud
- [[Anthropic]] — Dario 10x capex statement; signed capacity deals with XAI + Amazon
- [[Microsoft Azure]] — 2026 capex guide starts with an eight
- [[OpenAI]] — spending more on compute every quarter than all of 2023
- [[XAI]] — signed capacity deal with Anthropic
- [[Amazon]] — signed capacity deal with Anthropic

### Infrastructure Plays
See [[entities/stocks/_INDEX]] for full basket

### Supply Chain Maps
- [[AI-Supply-Chain-Broadening]] — global Nvidia / AI supplier map across semis, networking, servers and power
- [[India-Data-Center-Stack]] — India-listed value chain for data-center capex

## Sources
- [raw/twitter/Post by @SanCompounding on X.md](../raw/twitter/Post%20by%20@SanCompounding%20on%20X.md) — 2026-04-12
- [raw/twitter/Post by @demian_ai on X.md](../raw/twitter/Post%20by%20@demian_ai%20on%20X.md) — 2026-05-07
- [raw/twitter/Post by @Speculator_io on X.md](../raw/twitter/Post%20by%20@Speculator_io%20on%20X.md) — 2026-01-11
- [raw/twitter/Post by @SanCompounding on X 1.md](../raw/twitter/Post%20by%20@SanCompounding%20on%20X%201.md) — 2026-05-07

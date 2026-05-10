# Theme: Jevons Paradox in AI Compute

## Concept
William Jevons (1865): making coal-burning more efficient increased coal consumption — efficiency unlocked uses that were previously uneconomic.

Applied to AI: cheaper inference per token → more total compute consumed, not less.

## The Math
- Token cost: -128x (in 12 months for o1-level reasoning)
- Token consumption: +~10,000x (agents, deep research, multi-step reasoning)
- Net: ~100x increase in total compute bill

## Why Consumption Exploded
| Product Type | Token Multiplier vs Single-Shot Chat |
|---|---|
| Reasoning model | ~10x (thinks out loud before answering) |
| Agentic workflow | ~20x requests (loops, tools, retries) |
| Deep research query | >10x vs original GPT-4 |
| Persistent agent session (KV state) | Tens of GB per user |

## Investment Implications
- Hyperscaler capex is not peaking — it is a step on an exponential curve
- Inference is **always-on** (unlike training which is bursty) — sizing all downstream infrastructure
- AI software companies on closed APIs face **gross margin compression** as customers get more value (more usage = more compute cost)
- Winners: vertically integrated companies managing their own inference stack

## Downstream Bottlenecks
1. **Memory / KV Cache** — [[MU]], [[SNDK]], [[TOWCF]]
2. **Optical transceivers** — [[COHR]], [[LITE]], [[AAOI]], [[CRDO]]
3. **ASIC / custom silicon** — [[AVGO]], [[MRVL]]
4. **Interconnect** — [[ALAB]]
5. **Neocloud / inference infra** — [[NBIS]], [[CRWV]]
6. **Power, cooling and buildout** — [[India-Data-Center-Stack]]

## Related Themes
- [[AI-Infrastructure-Capex-Supercycle]]
- [[Agentic-AI-Demand-Wave]]
- [[AI-Supply-Chain-Broadening]]
- [[India-Data-Center-Stack]]

## Sources
- [raw/twitter/Post by @demian_ai on X.md](../raw/twitter/Post%20by%20@demian_ai%20on%20X.md) — 2026-05-07

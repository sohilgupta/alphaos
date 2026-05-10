# Theme: Agentic AI Demand Wave

## Core Thesis
Agentic workflows turn cheaper inference into higher total compute consumption. A single user request can become a chain of planning, tool calls, retries, synthesis and memory management.

This is the demand-side mechanism behind [[Jevons-Paradox-AI-Compute]] and the workload shift behind the [[AI-Infrastructure-Capex-Supercycle]].

## Demand Mechanics
| Driver | Compute Effect |
|---|---|
| Reasoning models | Roughly 10x output tokens vs non-reasoning models |
| Agentic workflows | Roughly 20x requests vs single-shot completions |
| Deep research | More compute than 10 original GPT-4 queries |
| Persistent sessions | Long-lived [[KV-Cache]] and memory state per user |

## Infrastructure Consequences
- Inference becomes always-on rather than bursty.
- CPU:GPU ratios move from training-heavy 1:8 toward agentic inference at 1:1 or sometimes CPU-heavy.
- Memory, storage, routing, speculative decoding and quantization become margin-critical.
- Power, cooling, interconnect and data-center design become first-order bottlenecks.

## Related Themes
- [[Jevons-Paradox-AI-Compute]]
- [[AI-Infrastructure-Capex-Supercycle]]
- [[AI-Supply-Chain-Broadening]]

## Sources
- [raw/twitter/Post by @demian_ai on X.md](../raw/twitter/Post%20by%20@demian_ai%20on%20X.md) — 2026-05-07


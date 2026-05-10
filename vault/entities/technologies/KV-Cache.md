# KV Cache (Key-Value Cache)

## What It Is
The running memory state of a long conversation or agent loop. Stores intermediate computation to avoid reprocessing context.

## Why It Matters Now
- Does NOT scale linearly with model parameters
- Scales linearly with **context length × number of agent steps**
- A long agent session can hold **tens of gigabytes of state per user, per session**
- Multiply by all concurrent users → massive DRAM / HBM demand

## Investment Angle
The "silent monster" of the inference era. Directly drives demand for:
- [[MU]] (Micron — DRAM, HBM)
- [[SNDK]] (SanDisk — NAND/storage)
- [[TOWCF]] (memory/packaging)

Google split its TPU line in two — dedicated inference chip with tripled SRAM specifically for KV cache.

## Related Technologies
- Speculative decoding (mitigation)
- Quantization (mitigation)
- Routing (optimization)

## Related Themes
- [[Jevons-Paradox-AI-Compute]]
- [[AI-Infrastructure-Capex-Supercycle]]

## Sources
- [raw/twitter/Post by @demian_ai on X.md](../../raw/twitter/Post%20by%20@demian_ai%20on%20X.md) — 2026-05-07

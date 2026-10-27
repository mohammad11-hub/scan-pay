# AGENTS.md

## Rules
- Bill printing must stay continuous: the browser print path measures the rendered receipt and sets a single-page `@page size: <paper> <measured>mm` (see `applyContinuousPage` in `src/lib/printer.ts`); Android/RawBT/native paths send raw ESC/POS, which is inherently continuous. Why: invalid `@page size: <w> auto` made browsers paginate long bills onto default A4/Letter pages, splitting the UPI QR onto a second page.

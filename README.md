# RPA Operations Terminal — High-Density Enterprise RPA Monitor

A real-time, high-density enterprise control terminal that ingests a continuous
telemetry firehose and visualizes 50,000 RPA project records with sorting,
filtering, fuzzy search, and a hand-built virtualized data grid — all without a
single external data-grid or virtualization library.

> **Built for [Frontend Battle 3.0 — Vibecoding Competition](https://unstop.com/hackathons/frontend-battle-30-vibecoding-competition-indian-institute-of-technology-bhubaneswar-1696294), Round 2 (Phase 2), Indian Institute of Technology Bhubaneswar.**
>
> Phase 2 is a pure test of low-level frontend engineering: client-side state
> orchestration, memory optimization, and rendering efficiency under load.

---

## The Strict Constraint

> **Zero external data-grid or virtualization libraries.** No AG-Grid, TanStack
> Table, react-window, or react-virtualized.

All row layout, structural rendering, and viewport recycling are implemented by
hand using raw framework mechanics and native Web APIs. Runtime dependencies are
**only** `react` and `react-dom`.

```jsonc
"dependencies": { "react": "^19", "react-dom": "^19" }
```

---

## Tech Stack

- **React 19** + **Vite** — fast dev/build, native `public/` static serving
- **Plain CSS** (custom properties, no UI kit) — "operations terminal" theme
- **oxlint** — linting
- No state-management library; state is hand-orchestrated with hooks + refs

---

## Data Flow

```
rpa_database_2026.csv (50k rows)
        │
        ├── seeded once at startup  ─────────────► master dataset (in a ref)
        │   (parsed with the exact uid scheme            │
        │    dataStream.js uses, so updates merge)        │
        │                                                 ▼
        └── dataStream.js  ── 200ms batches (5–50 rows) ─► processBatch()
            (official sim,         of live mutations          │
             untouched)                                        ▼
                                            in-place merge by internal_uid
                                                               │
                                  ┌────────────────────────────┼───────────────┐
                                  ▼                            ▼                ▼
                            KPI counters            filter → search → sort   flash queue
                                                          (derived view)         │
                                                               ▼                 ▼
                                                       VirtualGrid (imperative DOM paint)
```

The provided `dataStream.js` only emits *random* batches, so it would take ~100
minutes to surface all 50k rows. We therefore **seed the full dataset from the
CSV at startup** for an instantly dense grid, then let the stream mutate it live.
KPI counters only advance on real stream ticks (per the Feature 1 spec).

---

## Feature Modules (100 pts)

| # | Feature | Implementation |
|---|---------|----------------|
| 1 | **High-Density KPI Dashboard** | 3 live counters (rows streamed, robots deployed running sum, cumulative savings running sum); `tabular-nums` prevents width jitter. `src/components/KPIStrip.jsx` |
| 2 | **Financial / Numeric Sanitation** | Locale currency formatting, ROI clamped & rounded to 2 dp; cells clip with ellipsis to prevent overlap. `src/utils/format.js` |
| 3 | **Visual Alert & Status Indicators** | Failed / negative-ROI rows flash a warning hue; all other updates get a neutral pulse. CSS animations auto-expire via `animationend`. `src/components/VirtualGrid.jsx` |
| 4 | **Single-Column Sorter** | Click any header → asc → desc → off; order re-derived every tick so it survives the stream. |
| 5 | **Pipeline Buffer (Pause/Play)** | While paused the UI locks under an overlay; incoming batches buffer in a queue and flush in order on resume — no records dropped. |
| 6 | **Workspace Layout Persistence** | Show/hide panels persisted to `localStorage`; survives a hard refresh. `src/components/LayoutManager.jsx` |
| 7 | **Categorical Dropdown Filters** | Multi-select checkbox dropdowns for automation type / department / industry. `src/components/FilterBar.jsx` |
| 8 | **High-Frequency Virtualized DOM Grid** | Custom row recycler: a fixed pool of DOM rows = viewport height ÷ row height; content swapped via `textContent` on scroll (`translateY`), targeting a locked 60 FPS. `src/components/VirtualGrid.jsx` |
| 9 | **Multi-Column Concurrent Sorter** | Shift+click builds a compound sort key (e.g. industry ▲ then ROI ▼) with priority badges; all 13 columns sortable. `src/utils/sort.js` |
| 10 | **Multi-Field Fuzzy Search** | Out-of-order, multi-keyword AND matching across all text fields. `src/utils/fuzzy.js` |

---

## Performance Design (Rendering Performance & Memory)

The render-hot path is engineered to avoid the things the Chrome Performance
Profiler penalizes — memory leaks, heap bloat, layout thrashing, and unnecessary
re-renders during active stream processing:

- **Custom virtualization** — only `⌈viewport ÷ rowHeight⌉ + 2` row nodes ever
  exist in the DOM, regardless of the 50,000-row dataset.
- **Imperative grid painting** — cell text and status/alert states are written
  directly to the DOM (`textContent`, `data-*` attributes), bypassing the React
  reconciler on the 200ms hot path. `data-*` (not `className`) is used so React
  never wipes imperatively-set state on re-render.
- **In-place state, no per-tick copies** — the master dataset is mutated in a
  ref and re-derived through a version counter, eliminating a full 50k-element
  array allocation every tick.
- **Incremental analytics** — status/AI/country counts update by O(batch) deltas
  instead of rescanning all 50k rows every tick.
- **rAF-throttled scrolling** + memoized child components + sticky header.

---

## Project Structure

```
public/
  rpa_database_2026.csv     # 50k-row dataset (served statically)
  dataStream.js             # official telemetry simulator (unmodified)
src/
  App.jsx                   # state orchestration, stream wiring, derived view
  components/
    KPIStrip.jsx            # Feature 1
    VirtualGrid.jsx         # Features 3, 4, 8, 9 (rendering)
    FilterBar.jsx           # Feature 7 (multi-select)
    SearchBar.jsx           # Feature 10 (input)
    PausePlayBtn.jsx        # Feature 5
    LayoutManager.jsx       # Feature 6
  utils/
    grid.js                 # column schema, cell formatting, row coercion
    format.js               # currency / percent / number sanitation (Feature 2)
    sort.js                 # multi-key comparator (Features 4, 9)
    fuzzy.js                # multi-keyword search (Feature 10)
    seed.js                 # full-CSV parser (uid-aligned with dataStream.js)
```

---

## Getting Started

```bash
npm install
npm run dev        # http://localhost:5173
```

```bash
npm run build      # production build → dist/
npm run preview    # preview the production build
npm run lint       # oxlint
```

The dataset and simulator live in `public/` and are served at the site root, so
the app's `fetch('/rpa_database_2026.csv')` resolves identically in local dev and
on static hosting (Vercel / Netlify / GitHub Pages).

---

## Notes

- `dataStream.js` is the official competition simulator and is **left
  unmodified** — the app adapts to whatever it emits.
- The shipped dataset contains no `Failed`/negative-ROI rows, so the red alert
  state (Feature 3) is implemented and correct but won't visibly fire with the
  default data; the neutral update-pulse keeps the live stream visibly active.

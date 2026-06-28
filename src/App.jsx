import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import './App.css';
import KPIStrip from './components/KPIStrip';
import VirtualGrid from './components/VirtualGrid';
import FilterBar from './components/FilterBar';
import SearchBar from './components/SearchBar';
import PausePlayBtn from './components/PausePlayBtn';
import LayoutManager from './components/LayoutManager';
import RowInspector from './components/RowInspector';
import { fuzzyMatch } from './utils/fuzzy';
import { multiSort } from './utils/sort';
import { coerceRow } from './utils/grid';
import { parseCsvSeed } from './utils/seed';

const CSV_URL = '/rpa_database_2026.csv';
const PANELS_KEY = 'rpa_panels';
const FILTER_FIELDS = ['automation_type', 'department', 'industry'];

const STATUS_KEYS = { Active: 'active', Completed: 'completed', Planned: 'planned', Failed: 'failed' };

function loadPanels() {
  try {
    const saved = localStorage.getItem(PANELS_KEY);
    const defaults = { grid: true, controls: true, analytics: true };
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  } catch {
    return { grid: true, controls: true, analytics: true };
  }
}

export default function App() {
  // ── Non-rendering data stores (mutated in place to avoid per-tick GC churn) ──
  const masterRef     = useRef([]);                 // full 50k dataset, updated by uid
  const uidToIdxRef   = useRef(new Map());          // internal_uid -> index in masterRef
  const filterOptSetsRef = useRef({ automation_type: new Set(), department: new Set(), industry: new Set() });
  const countsRef     = useRef({ active: 0, completed: 0, planned: 0, failed: 0, aiEnabled: 0, countries: new Set() });
  const pausedRef     = useRef(false);
  const queueRef      = useRef([]);
  const flashSetRef   = useRef(new Map());           // uid -> 'alert' | 'update'

  // ── React state (drives renders) ──
  const [dataVersion, setDataVersion] = useState(0); // bumped each unpaused tick → recompute view
  const [totalRows, setTotalRows]     = useState(0);
  const [kpis, setKpis]               = useState({ totalStreamed: 0, totalRobots: 0, totalSavings: 0 });
  const [statusCounts, setStatusCounts] = useState({ active: 0, completed: 0, planned: 0, failed: 0, aiEnabled: 0, countries: 0 });
  const [sortKeys, setSortKeys]       = useState([]);
  const [filters, setFilters]         = useState({ automation_type: [], department: [], industry: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [paused, setPaused]           = useState(false);
  const [panels, setPanels]           = useState(loadPanels);
  const [filterOptions, setFilterOptions] = useState({ automation_type: [], department: [], industry: [] });
  const [streamStatus, setStreamStatus] = useState('connecting');
  const [queueSize, setQueueSize]     = useState(0);
  const [selectedRow, setSelectedRow] = useState(null);   // pause-gated inspector

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // Inspector is only meaningful on a frozen snapshot — close it when the
  // stream resumes so it never shows stale, mutating data.
  useEffect(() => { if (!paused) setSelectedRow(null); }, [paused]);

  const snapshotCounts = useCallback(() => {
    const c = countsRef.current;
    return { active: c.active, completed: c.completed, planned: c.planned, failed: c.failed, aiEnabled: c.aiEnabled, countries: c.countries.size };
  }, []);

  // Apply one batch in place. O(batch) — no full-array copies, no full re-scan.
  const processBatch = useCallback((batch) => {
    const master = masterRef.current;
    const uidMap = uidToIdxRef.current;
    const cr = countsRef.current;
    const optSets = filterOptSetsRef.current;
    const toFlash = new Map();

    let robotsDelta = 0, savingsDelta = 0;
    let optChanged = false, countsChanged = false, rowsAdded = false;

    for (let b = 0; b < batch.length; b++) {
      const row = coerceRow(batch[b]);
      robotsDelta  += row.robots_deployed;
      savingsDelta += row.annual_savings_usd;

      // Feature 3: Failed / negative ROI → warning hue; all others → neutral pulse
      toFlash.set(row.internal_uid, (row.project_status === 'Failed' || row.roi_percent < 0) ? 'alert' : 'update');

      const idx = uidMap.get(row.internal_uid);
      if (idx !== undefined) {
        const old = master[idx];
        // Incremental analytics deltas — only touch counts that actually changed
        if (old.project_status !== row.project_status) {
          const ok = STATUS_KEYS[old.project_status]; if (ok) cr[ok]--;
          const nk = STATUS_KEYS[row.project_status]; if (nk) cr[nk]++;
          countsChanged = true;
        }
        if (old.ai_enabled !== row.ai_enabled) {
          if (old.ai_enabled === 'Yes') cr.aiEnabled--;
          if (row.ai_enabled === 'Yes') cr.aiEnabled++;
          countsChanged = true;
        }
        if (row.country && old.country !== row.country && !cr.countries.has(row.country)) {
          cr.countries.add(row.country); countsChanged = true;
        }
        master[idx] = row;
      } else {
        // Defensive: stream surfaced a uid the seed didn't (e.g. seed failed)
        uidMap.set(row.internal_uid, master.length);
        master.push(row);
        rowsAdded = true;
        const nk = STATUS_KEYS[row.project_status]; if (nk) { cr[nk]++; countsChanged = true; }
        if (row.ai_enabled === 'Yes') { cr.aiEnabled++; countsChanged = true; }
        if (row.country && !cr.countries.has(row.country)) { cr.countries.add(row.country); countsChanged = true; }
        for (const f of FILTER_FIELDS) {
          if (row[f] && !optSets[f].has(row[f])) { optSets[f].add(row[f]); optChanged = true; }
        }
      }
    }

    flashSetRef.current = toFlash;

    if (optChanged) {
      setFilterOptions({
        automation_type: [...optSets.automation_type].sort(),
        department:      [...optSets.department].sort(),
        industry:        [...optSets.industry].sort(),
      });
    }
    if (countsChanged) setStatusCounts(snapshotCounts());
    if (rowsAdded) setTotalRows(master.length);

    setKpis(prev => ({
      totalStreamed: prev.totalStreamed + batch.length,
      totalRobots:   prev.totalRobots + robotsDelta,
      totalSavings:  prev.totalSavings + savingsDelta,
    }));
    setStreamStatus('live');
    setDataVersion(v => v + 1);
  }, [snapshotCounts]);

  // Seed the full dataset, then attach the live stream. The stream only emits
  // random batches, so seeding gives an instant dense grid; the stream then
  // mutates it live. KPI counters only move on real stream ticks (Feature 1).
  useEffect(() => {
    let cancelled = false;

    const startStream = () => {
      if (typeof window.initializeRpaStream === 'function') {
        window.initializeRpaStream((batch) => {
          if (pausedRef.current) {
            queueRef.current.push(...batch);   // Feature 5: buffer while UI is locked
            setQueueSize(queueRef.current.length);
          } else {
            processBatch(batch);
          }
        }, CSV_URL);
      } else {
        setTimeout(startStream, 50);
      }
    };

    (async () => {
      try {
        const res = await fetch(CSV_URL);
        if (res.ok) {
          const seeded = parseCsvSeed(await res.text());
          if (!cancelled && seeded.length) {
            const uidMap = uidToIdxRef.current;
            const optSets = filterOptSetsRef.current;
            const cr = countsRef.current;
            for (let i = 0; i < seeded.length; i++) {
              const row = seeded[i];
              uidMap.set(row.internal_uid, i);
              for (const f of FILTER_FIELDS) if (row[f]) optSets[f].add(row[f]);
              const k = STATUS_KEYS[row.project_status]; if (k) cr[k]++;
              if (row.ai_enabled === 'Yes') cr.aiEnabled++;
              if (row.country) cr.countries.add(row.country);
            }
            masterRef.current = seeded;
            setTotalRows(seeded.length);
            setStatusCounts(snapshotCounts());
            setFilterOptions({
              automation_type: [...optSets.automation_type].sort(),
              department:      [...optSets.department].sort(),
              industry:        [...optSets.industry].sort(),
            });
            setDataVersion(v => v + 1);
          }
        }
      } catch {
        // Best-effort seed; the stream will still populate rows on its own.
      }
      if (!cancelled) startStream();
    })();

    return () => { cancelled = true; };
  }, [processBatch, snapshotCounts]);

  const handlePause = useCallback(() => { setPaused(true); pausedRef.current = true; }, []);

  const handlePlay = useCallback(() => {
    setPaused(false);
    pausedRef.current = false;
    if (queueRef.current.length > 0) {
      const queued = queueRef.current.splice(0);   // flush every buffered record, in order
      setQueueSize(0);
      processBatch(queued);
    }
  }, [processBatch]);

  // Single click = solo sort (asc→desc→off); Shift+click = compound multi-sort
  const handleSort = useCallback((field, isMulti) => {
    setSortKeys(prev => {
      if (isMulti) {
        const existing = prev.find(k => k.field === field);
        if (!existing) return [...prev, { field, dir: 'asc' }];
        if (existing.dir === 'asc') return prev.map(k => k.field === field ? { ...k, dir: 'desc' } : k);
        return prev.filter(k => k.field !== field);
      }
      const existing = prev.find(k => k.field === field);
      if (!existing) return [{ field, dir: 'asc' }];
      if (existing.dir === 'asc') return [{ field, dir: 'desc' }];
      return [];
    });
  }, []);

  const handleFilterToggle = useCallback((field, value) => {
    setFilters(prev => {
      const arr = prev[field];
      const next = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
      return { ...prev, [field]: next };
    });
  }, []);

  const handleFilterClear = useCallback((field) => {
    setFilters(prev => ({ ...prev, [field]: [] }));
  }, []);

  const handleRowClick = useCallback((record) => { setSelectedRow(record); }, []);
  const handleInspectorClose = useCallback(() => { setSelectedRow(null); }, []);

  // Derived view: filter → fuzzy search → multi-sort. Recomputes on each tick
  // (dataVersion) and on any control change. Reads the in-place master ref.
  const displayRows = useMemo(() => {
    void dataVersion; // dependency: re-derive when the stream mutates master
    const master = masterRef.current;
    const atSel = filters.automation_type, depSel = filters.department, indSel = filters.industry;
    const needsFilter = atSel.length || depSel.length || indSel.length || searchQuery;

    let result = master;
    if (needsFilter) {
      const atSet  = atSel.length  ? new Set(atSel)  : null;
      const depSet = depSel.length ? new Set(depSel) : null;
      const indSet = indSel.length ? new Set(indSel) : null;
      result = master.filter(r =>
        (!atSet  || atSet.has(r.automation_type)) &&
        (!depSet || depSet.has(r.department)) &&
        (!indSet || indSet.has(r.industry)) &&
        (!searchQuery || fuzzyMatch(r, searchQuery))
      );
    }
    if (sortKeys.length) result = multiSort(result, sortKeys);
    return result;
  }, [dataVersion, filters, searchQuery, sortKeys]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <div className="app-brand">
            <span className="brand-mark">RPA</span>
            <span className="brand-slash">//</span>
            <div className="brand-text">
              <span className="brand-title">OPERATIONS&nbsp;TERMINAL</span>
              <span className="brand-sub">Worldwide RPA Telemetry · Node&nbsp;2026</span>
            </div>
          </div>
          <span className={`stream-badge stream-badge--${paused ? 'paused' : streamStatus}`}>
            <span className="stream-dot" />
            {paused ? 'STREAM HELD' : streamStatus === 'live' ? 'STREAM LIVE' : 'CONNECTING'}
          </span>
        </div>
        <div className="header-right">
          <div className="header-stat">
            <span className="header-stat-label">VISIBLE</span>
            <span className="header-stat-val">{displayRows.length.toLocaleString()}</span>
            <span className="header-stat-sep">/</span>
            <span className="header-stat-total">{totalRows.toLocaleString()}</span>
          </div>
          <LayoutManager panels={panels} onChange={setPanels} />
          <PausePlayBtn
            paused={paused}
            queueSize={queueSize}
            onPause={handlePause}
            onPlay={handlePlay}
          />
        </div>
      </header>

      <KPIStrip kpis={kpis} />

      {panels.analytics && (
        <div className="analytics-strip">
          <div className="stat-pill">
            <span className="stat-marker stat--active" />
            <span className="stat-label">Active</span>
            <span className="stat-val">{statusCounts.active.toLocaleString()}</span>
          </div>
          <div className="stat-pill">
            <span className="stat-marker stat--completed" />
            <span className="stat-label">Completed</span>
            <span className="stat-val">{statusCounts.completed.toLocaleString()}</span>
          </div>
          <div className="stat-pill">
            <span className="stat-marker stat--planned" />
            <span className="stat-label">Planned</span>
            <span className="stat-val">{statusCounts.planned.toLocaleString()}</span>
          </div>
          {statusCounts.failed > 0 && (
            <div className="stat-pill">
              <span className="stat-marker stat--failed" />
              <span className="stat-label">Failed</span>
              <span className="stat-val">{statusCounts.failed.toLocaleString()}</span>
            </div>
          )}
          <div className="stat-pill">
            <span className="stat-marker stat--ai" />
            <span className="stat-label">AI-Enabled</span>
            <span className="stat-val">{statusCounts.aiEnabled.toLocaleString()}</span>
          </div>
          <div className="stat-pill stat-pill--wide">
            <span className="stat-label">Countries</span>
            <span className="stat-val">{statusCounts.countries}</span>
          </div>
        </div>
      )}

      {panels.controls && (
        <div className="control-bar">
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
          <FilterBar
            filters={filters}
            options={filterOptions}
            onToggle={handleFilterToggle}
            onClear={handleFilterClear}
          />
        </div>
      )}

      {panels.grid && (
        <div className="grid-wrapper">
          <VirtualGrid
            rows={displayRows}
            sortKeys={sortKeys}
            onSort={handleSort}
            flashSetRef={flashSetRef}
            paused={paused}
            queueSize={queueSize}
            onRowClick={handleRowClick}
            selectedUid={selectedRow?.internal_uid || null}
          />
        </div>
      )}

      {selectedRow && (
        <RowInspector record={selectedRow} onClose={handleInspectorClose} />
      )}
    </div>
  );
}

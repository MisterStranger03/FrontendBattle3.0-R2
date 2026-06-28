import { useRef, useEffect, useCallback, useState, memo } from 'react';
import { COLUMNS, TOTAL_COL_WIDTH, formatCell, isAlertRow } from '../utils/grid';

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 44;
const SORT_ICONS = { asc: ' ▲', desc: ' ▼' };

export default memo(function VirtualGrid({ rows, sortKeys, onSort, flashSetRef, paused, queueSize, onRowClick, selectedUid }) {
  const containerRef  = useRef(null);
  const rowWindowRef  = useRef(null);
  const rowRefsArr    = useRef([]);
  const startIdxRef   = useRef(0);
  const rafIdRef      = useRef(null);
  const rowsRef       = useRef(rows);
  const [visibleCount, setVisibleCount] = useState(30);

  useEffect(() => { rowsRef.current = rows; }, [rows]);

  // Resize observer — recalculates row count on container resize
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      const h = entry.contentRect.height;
      setVisibleCount(Math.ceil((h - HEADER_HEIGHT) / ROW_HEIGHT) + 2);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Reset scroll position when sort changes
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [sortKeys]);

  const paint = useCallback(() => {
    const startIdx = startIdxRef.current;
    const data = rowsRef.current;
    const rowEls = rowRefsArr.current;

    for (let i = 0; i < rowEls.length; i++) {
      const el = rowEls[i];
      if (!el) continue;

      const row = data[startIdx + i];

      if (!row) {
        el.style.visibility = 'hidden';
        el.dataset.rowIndex = '';   // stale clicks on hidden rows resolve to nothing
        continue;
      }

      el.style.visibility = 'visible';
      // Map this recycled node back to its data index so a click (while paused)
      // can resolve the exact record even after scrolling.
      el.dataset.rowIndex = startIdx + i;
      el.dataset.selected = (selectedUid && row.internal_uid === selectedUid) ? '1' : '';

      const cells = el.children;
      for (let j = 0; j < COLUMNS.length && j < cells.length; j++) {
        const col = COLUMNS[j];
        const cell = cells[j];
        cell.textContent = formatCell(row, col);

        // data-* attrs survive React re-renders — React never owns these
        if (col.field === 'project_status') {
          cell.dataset.status = row.project_status || 'unknown';
        }
        if (col.field === 'roi_percent') {
          cell.dataset.negative = Number(row.roi_percent) < 0 ? '1' : '';
        }
      }

      // Persistent alert background via data attr — className="grid-row" stays
      // static so React's reconciler never wipes it.
      el.dataset.alert = isAlertRow(row) ? '1' : '';

      // Flash incoming rows: 'alert' = warning hue, 'update' = neutral pulse
      const flashType = flashSetRef && flashSetRef.current.get(row.internal_uid);
      if (flashType) {
        el.dataset.flash = '';
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (!el) return;
          el.dataset.flash = flashType;
          el.addEventListener('animationend', () => { el.dataset.flash = ''; }, { once: true });
        }));
        flashSetRef.current.delete(row.internal_uid);
      }
    }
  }, [flashSetRef, selectedUid]);

  // Delegated row click — opens the inspector, but only while paused (the data
  // is frozen then, so the snapshot under the cursor is stable).
  const handleRowWindowClick = useCallback((e) => {
    if (!paused || !onRowClick) return;
    const rowEl = e.target.closest('.grid-row');
    if (!rowEl) return;
    const idx = Number(rowEl.dataset.rowIndex);
    if (!Number.isInteger(idx)) return;
    const record = rowsRef.current[idx];
    if (record) onRowClick(record);
  }, [paused, onRowClick]);

  const handleScroll = useCallback(() => {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      if (!containerRef.current || !rowWindowRef.current) return;
      const scrollTop = containerRef.current.scrollTop;
      startIdxRef.current = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT));
      // translateY moves the row window to the current scroll position.
      // position:absolute avoids the sticky-parent-boundary bug where the last
      // rows become unreachable on large datasets.
      rowWindowRef.current.style.transform = `translateY(${scrollTop}px)`;
      paint();
    });
  }, [paint]);

  // Repaint whenever displayRows changes (stream update or filter/sort change)
  useEffect(() => {
    if (rowWindowRef.current) {
      rowWindowRef.current.style.transform = 'translateY(0px)';
      startIdxRef.current = containerRef.current ? Math.floor(containerRef.current.scrollTop / ROW_HEIGHT) : 0;
      if (rowWindowRef.current) {
        rowWindowRef.current.style.transform = `translateY(${containerRef.current?.scrollTop ?? 0}px)`;
      }
    }
    paint();
  }, [rows, paint]);

  const handleHeaderClick = useCallback((col, e) => {
    if (col.sortable) onSort(col.field, e.shiftKey);
  }, [onSort]);

  const totalHeight = rows.length * ROW_HEIGHT + HEADER_HEIGHT;

  return (
    <div className="grid-viewport">
      <div ref={containerRef} className="virtual-grid" onScroll={handleScroll}>
        {/* Stage: full scroll height — determines scrollbar range */}
        <div
          className="grid-stage"
          style={{ height: totalHeight, width: TOTAL_COL_WIDTH, minWidth: '100%', position: 'relative' }}
        >
        {/* Sticky column header — sticks vertically, scrolls horizontally with content */}
        <div
          className="grid-header"
          style={{ position: 'sticky', top: 0, width: TOTAL_COL_WIDTH, minWidth: '100%', zIndex: 10 }}
        >
          {COLUMNS.map(col => {
            const skIndex = sortKeys.findIndex(k => k.field === col.field);
            const sk = skIndex >= 0 ? sortKeys[skIndex] : null;
            // Show a priority number only for sorted columns when >1 key is active.
            // Use a ternary (not `rank && …`) so a 0 never leaks into the DOM as text.
            const rank = (sk && sortKeys.length > 1) ? skIndex + 1 : null;
            return (
              <div
                key={col.field}
                className={`th${col.sortable ? ' th--sortable' : ''}${sk ? ' th--active' : ''}`}
                style={{ width: col.width, minWidth: col.width }}
                onClick={(e) => handleHeaderClick(col, e)}
                title={col.sortable ? 'Click · Shift+click to multi-sort' : undefined}
              >
                {col.label}
                {sk ? <span className="sort-arrow">{SORT_ICONS[sk.dir]}</span> : null}
                {rank ? <sup className="sort-rank">{rank}</sup> : null}
              </div>
            );
          })}
        </div>

        {/* Row window: absolute + translateY.
            Fixed DOM node count recycled on scroll.
            absolute avoids sticky parent-boundary cutoff on large datasets. */}
        <div
          ref={rowWindowRef}
          className={`row-window${paused ? ' row-window--clickable' : ''}`}
          onClick={handleRowWindowClick}
          style={{
            position: 'absolute',
            top: HEADER_HEIGHT,
            left: 0,
            right: 0,
            willChange: 'transform',
          }}
        >
          {Array.from({ length: visibleCount }, (_, i) => (
            <div
              key={i}
              ref={el => { rowRefsArr.current[i] = el; }}
              className="grid-row"
              style={{ display: 'flex', height: ROW_HEIGHT, alignItems: 'center' }}
            >
              {COLUMNS.map(col => (
                <div
                  key={col.field}
                  className={`td td--${col.type || 'string'}`}
                  style={{ width: col.width, minWidth: col.width }}
                />
              ))}
            </div>
            ))}
          </div>
        </div>
      </div>

      {/* Overlays live in the non-scrolling viewport wrapper so they stay
          fixed in view while the grid body scrolls underneath. */}
      {rows.length === 0 && (
        <div className="grid-empty">
          <div className="empty-inner">
            <span className="empty-dot" />
            <span>Connecting to telemetry pipeline…</span>
          </div>
        </div>
      )}

      {/* Non-blocking banner: signals the frozen/locked state (Feature 5) while
          leaving rows clickable for the inspector. pointer-events:none in CSS. */}
      {paused && (
        <div className="grid-pause-banner">
          <span className="pause-banner-dot" />
          <span className="pause-banner-text">STREAM PAUSED — click any row to inspect</span>
          {queueSize > 0 && (
            <span className="pause-banner-queue">{queueSize.toLocaleString()} buffered</span>
          )}
        </div>
      )}
    </div>
  );
});

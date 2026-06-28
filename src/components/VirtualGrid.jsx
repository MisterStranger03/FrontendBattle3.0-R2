import { useRef, useEffect, useCallback, useState, memo } from 'react';
import { COLUMNS, TOTAL_COL_WIDTH, formatCell, isAlertRow } from '../utils/grid';

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 44;
const OVERSCAN = 6;   // extra rows rendered above/below the viewport (smooth edges)
const SORT_ICONS = { asc: ' ▲', desc: ' ▼' };

export default memo(function VirtualGrid({ rows, sortKeys, onSort, flashSetRef, paused, queueSize, onRowClick, selectedUid, viewSignature }) {
  const containerRef    = useRef(null);
  const rowWindowRef    = useRef(null);
  const rowRefsArr      = useRef([]);
  const renderStartRef  = useRef(-1);   // first data index currently rendered by the pool
  const rafIdRef        = useRef(null);
  const rowsRef         = useRef(rows);
  const [visibleCount, setVisibleCount] = useState(30);

  useEffect(() => { rowsRef.current = rows; }, [rows]);

  // Resize observer — pool size = visible rows + overscan top & bottom
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(([entry]) => {
      const h = entry.contentRect.height;
      setVisibleCount(Math.ceil((h - HEADER_HEIGHT) / ROW_HEIGHT) + 1 + OVERSCAN * 2);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Reset scroll to the top whenever the *view* changes (filter / search / sort),
  // so the user lands at the top of the new result set — and so a deep scroll
  // position can't carry over to a much shorter filtered list.
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
    renderStartRef.current = -1;
  }, [viewSignature]);

  // Paint the pool for the current renderStart. Cheap (~pool×cols textContent
  // writes); only runs when the window crosses a row boundary, not every frame.
  const paint = useCallback(() => {
    const renderStart = renderStartRef.current < 0 ? 0 : renderStartRef.current;
    const data = rowsRef.current;
    const rowEls = rowRefsArr.current;

    for (let i = 0; i < rowEls.length; i++) {
      const el = rowEls[i];
      if (!el) continue;

      const dataIndex = renderStart + i;
      const row = data[dataIndex];

      if (!row) {
        el.style.visibility = 'hidden';
        el.dataset.rowIndex = '';   // stale clicks on hidden rows resolve to nothing
        continue;
      }

      el.style.visibility = 'visible';
      // Map this recycled node back to its data index so a click (while paused)
      // can resolve the exact record even after scrolling.
      el.dataset.rowIndex = dataIndex;
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
    const raw = rowEl.dataset.rowIndex;
    if (raw === '' || raw == null) return;   // empty = hidden/filler row
    const idx = Number(raw);
    if (!Number.isInteger(idx)) return;
    const record = rowsRef.current[idx];
    if (record) onRowClick(record);
  }, [paused, onRowClick]);

  // Recompute the rendered window from the current scrollTop. The pool is
  // translated to its snapped row offset; native (compositor) scroll provides
  // the smooth pixel movement between boundaries. Returns true if it changed.
  const syncWindow = useCallback((force) => {
    const container = containerRef.current;
    const win = rowWindowRef.current;
    if (!container || !win) return false;
    const startIdx = Math.floor(container.scrollTop / ROW_HEIGHT);
    // Clamp so the pool's transform never exceeds the data height. Without this
    // a stale/large scrollTop (e.g. just before the browser clamps it after the
    // row count shrinks) would translate the pool far down — and since CSS
    // transforms extend an overflow:auto ancestor's scroll region, that would
    // inflate scrollHeight and leave the grid scrolled into empty space.
    const maxStart = Math.max(0, rowsRef.current.length - visibleCount);
    const renderStart = Math.min(Math.max(0, startIdx - OVERSCAN), maxStart);
    if (!force && renderStart === renderStartRef.current) return false; // glide via native scroll
    renderStartRef.current = renderStart;
    win.style.transform = `translate3d(0, ${HEADER_HEIGHT + renderStart * ROW_HEIGHT}px, 0)`;
    return true;
  }, [visibleCount]);

  const handleScroll = useCallback(() => {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = requestAnimationFrame(() => {
      if (syncWindow(false)) paint();   // only repaint when the window moved a row
    });
  }, [syncWindow, paint]);

  // Repaint whenever displayRows changes (stream update or filter/sort change).
  // Force a window resync so the transform/content stay correct after the data
  // array changes underneath us.
  useEffect(() => {
    syncWindow(true);
    paint();
  }, [rows, visibleCount, syncWindow, paint]);

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

        {/* Row pool: a fixed count of DOM nodes translated to the snapped row
            offset of the current window. Native scroll glides between rows;
            content is recycled (and the pool re-translated) only when the window
            crosses a row boundary. translate3d keeps it on the compositor. */}
        <div
          ref={rowWindowRef}
          className={`row-window${paused ? ' row-window--clickable' : ''}`}
          onClick={handleRowWindowClick}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            transform: `translate3d(0, ${HEADER_HEIGHT}px, 0)`,
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

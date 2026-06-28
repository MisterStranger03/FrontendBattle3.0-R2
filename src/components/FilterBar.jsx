import { memo, useState, useRef, useEffect, useCallback } from 'react';

const MultiSelect = memo(function MultiSelect({ label, field, selected, options, onToggle, onClear }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const count = selected.length;

  return (
    <div className="filter-group" ref={rootRef}>
      <button
        className={`filter-trigger${count ? ' filter-trigger--active' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <span className="filter-trigger-label">{label}</span>
        {count > 0
          ? <span className="filter-count">{count}</span>
          : <span className="filter-trigger-all">All</span>}
        <span className="filter-caret">▾</span>
      </button>

      {open && (
        <div className="filter-dropdown">
          <div className="filter-dropdown-head">
            <span>{count} selected</span>
            {count > 0 && (
              <button className="filter-clear-btn" onClick={() => onClear(field)}>Clear</button>
            )}
          </div>
          <div className="filter-dropdown-list">
            {options.map(opt => (
              <label key={opt} className="filter-check">
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => onToggle(field, opt)}
                />
                <span className="filter-check-text">{opt}</span>
              </label>
            ))}
            {options.length === 0 && <div className="filter-empty">No options yet</div>}
          </div>
        </div>
      )}
    </div>
  );
});

export default memo(function FilterBar({ filters, options, onToggle, onClear }) {
  const handleToggle = useCallback((field, value) => onToggle(field, value), [onToggle]);
  const handleClear = useCallback((field) => onClear(field), [onClear]);

  return (
    <div className="filter-bar">
      <MultiSelect label="Type"       field="automation_type" selected={filters.automation_type} options={options.automation_type} onToggle={handleToggle} onClear={handleClear} />
      <MultiSelect label="Department" field="department"      selected={filters.department}      options={options.department}      onToggle={handleToggle} onClear={handleClear} />
      <MultiSelect label="Industry"   field="industry"        selected={filters.industry}        options={options.industry}        onToggle={handleToggle} onClear={handleClear} />
    </div>
  );
});

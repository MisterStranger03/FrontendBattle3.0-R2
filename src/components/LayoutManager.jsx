import { memo, useCallback, useState } from 'react';

const PANEL_LABELS = {
  grid: 'Grid Window',
  controls: 'Controls Panel',
  analytics: 'Analytics Strip',
};

export default memo(function LayoutManager({ panels, onChange }) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback((key) => {
    onChange(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('rpa_panels', JSON.stringify(next));
      return next;
    });
  }, [onChange]);

  return (
    <div className="layout-manager">
      <button className="btn btn--layout" onClick={() => setOpen(o => !o)}>
        ⊞ Panels
      </button>
      {open && (
        <div className="layout-dropdown">
          {Object.entries(PANEL_LABELS).map(([key, label]) => (
            <label key={key} className="layout-option">
              <input
                type="checkbox"
                checked={!!panels[key]}
                onChange={() => toggle(key)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
});

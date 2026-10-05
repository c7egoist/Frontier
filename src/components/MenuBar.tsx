import React, { useEffect, useState } from 'react';

export interface MenuItemDef {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  action?: () => void;
}

export interface MenuDef {
  label: string;
  items: Array<MenuItemDef | 'sep'>;
}

interface MenuBarProps {
  menus: MenuDef[];
  docName: string;
  saved: boolean;
  onRename: (name: string) => void;
}

export function MenuBar({ menus, docName, saved, onRename }: MenuBarProps) {
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open ]);

  return (
    <header className="fw-menubar">
      <span className="fw-brand">RoadWorks <span>editor</span></span>
      {menus.map((m, i) => (
        <div
          key={m.label}
          className={`fw-menu ${open === i ? 'open' : ''}`}
          onMouseEnter={() => { if (open !== null) setOpen(i); }}
        >
          <button onClick={() => setOpen(open === i ? null : i)}>{m.label}</button>
          {open === i && (
            <div className="fw-dropdown">
              {m.items.map((it, k) => it === 'sep' ? (
                <div key={k} className="fw-msep" />
              ) : (
                <button
                  key={k}
                  className="fw-item"
                  disabled={it.disabled}
                  onClick={() => { setOpen(null); it.action?.(); }}
                >
                  {it.label}
                  {it.shortcut && <span className="key">{it.shortcut}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      {open !== null && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 55 }}
          onClick={() => setOpen(null)}
          onContextMenu={() => setOpen(null)}
        />
      )}
      <span className="spacer" />
      <input
        className="fw-docname"
        value={docName}
        onChange={(e) => onRename(e.target.value)}
        spellCheck={false}
        title="Project name"
      />
      <span className={`fw-dirty ${saved ? 'clean' : ''}`} title={saved ? 'Saved' : 'Unsaved changes'}>
        <span className="dot" />{saved ? 'saved' : 'unsaved'}
      </span>
    </header>
  );
}

/**
 * Shared lead UI helpers
 *
 * Small pieces used by both the table view (LeadsGrid) and the Kanban view
 * (LeadsKanban): colour helpers and the Responsible/Stage pickers. Extracted so
 * both views render assignees and stages identically.
 */
import React, { useState, useEffect, useRef } from 'react';

// ── Colour helpers ──────────────────────────────────────────────────────────

export const COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0284c7'];

/** Stable colour for a responsible/admin name, seeded on its first two letters. */
export const twoLetterColor = (name) => {
    if (!name) return COLORS[0];
    const seed = (name.charCodeAt(0) || 0) + (name.charCodeAt(1) || 0);
    return COLORS[seed % COLORS.length];
};

export const adminDisplayName = (a) => (a?.firstName || [a?.firstName, a?.lastName].filter(Boolean).join(' ') || 'Unknown');

/** Opaque light tint of a hex colour (mixed with white). */
export const tint = (hex, ratio = 0.16) => {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const mix = (c) => Math.round(c * ratio + 255 * (1 - ratio));
    return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
};

// ── Responsible (assignee) picker ───────────────────────────────────────────

/**
 * Responsible (assignee) picker — a custom dropdown so we can show each admin's
 * avatar + first name. The first option is "None" (unassigned). The selected
 * value is the admin's userId (empty string when unassigned).
 */
export const ResponsibleSelect = ({ admins, value, onChange, disabled }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    const selected = admins.find(a => a.userId === value) || null;

    const renderAvatar = (a, size = 'w-5 h-5') => {
        const name = adminDisplayName(a);
        return a.profileImage
            ? <img src={a.profileImage} alt="" className={`${size} rounded-full object-cover border border-gray-200`} onError={e => { e.target.style.display = 'none'; }} />
            : <span className={`${size} rounded-full flex items-center justify-center text-white font-bold text-[9px] select-none`} style={{ backgroundColor: twoLetterColor(name) }}>{name.charAt(0).toUpperCase()}</span>;
    };

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(o => !o)}
                className="ds-input ds-input--sm w-full flex items-center justify-between gap-2 text-left disabled:opacity-50"
            >
                <span className="flex items-center gap-1.5 min-w-0">
                    {selected ? (<>{renderAvatar(selected)}<span className="truncate">{adminDisplayName(selected)}</span></>) : <span className="text-gray-400">None</span>}
                </span>
                <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {open && (
                <div className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl py-1">
                    <button type="button" onClick={() => { onChange(''); setOpen(false); }} className={`w-full px-3 py-1.5 flex items-center gap-2 text-left text-xs hover:bg-gray-50 ${!value ? 'bg-indigo-50' : ''}`}>
                        <span className="w-5 h-5 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-[10px]">∅</span>
                        <span className="text-gray-500">None</span>
                    </button>
                    {admins.map(a => (
                        <button key={a.userId} type="button" onClick={() => { onChange(a.userId); setOpen(false); }} className={`w-full px-3 py-1.5 flex items-center gap-2 text-left text-xs hover:bg-gray-50 ${value === a.userId ? 'bg-indigo-50' : ''}`}>
                            {renderAvatar(a)}
                            <span className="truncate text-gray-700">{adminDisplayName(a)}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── Stage picker ────────────────────────────────────────────────────────────

/** Stage picker — mirrors ResponsibleSelect but uses the admin-chosen stage
 *  colours. `stages` is [{ id, name, color }]. */
export const StageSelect = ({ stages, value, onChange, disabled }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    const selected = stages.find(s => String(s.id) === String(value)) || null;
    const swatch = (color) => <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />;

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(o => !o)}
                className="ds-input ds-input--sm w-full flex items-center justify-between gap-2 text-left disabled:opacity-50"
            >
                <span className="flex items-center gap-1.5 min-w-0">
                    {selected ? (<>{swatch(selected.color)}<span className="truncate">{selected.name}</span></>) : <span className="text-gray-400">None</span>}
                </span>
                <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {open && (
                <div className="absolute z-30 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl py-1">
                    {stages.map(s => (
                        <button key={s.id} type="button" onClick={() => { onChange(s.id); setOpen(false); }} className={`w-full px-3 py-1.5 flex items-center gap-2 text-left text-xs hover:bg-gray-50 ${String(value) === String(s.id) ? 'bg-indigo-50' : ''}`}>
                            {swatch(s.color)}
                            <span className="truncate text-gray-700">{s.name}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

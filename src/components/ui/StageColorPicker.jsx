import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const COLORS = [
    '#4f46e5', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#d97706',
    '#65a30d', '#059669', '#0891b2', '#0284c7', '#2563eb', '#475569',
];
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const hexToHsv = (hex) => {
    const number = Number.parseInt(hex.slice(1), 16);
    const r = ((number >> 16) & 255) / 255;
    const g = ((number >> 8) & 255) / 255;
    const b = (number & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    if (delta) {
        if (max === r) h = 60 * (((g - b) / delta) % 6);
        else if (max === g) h = 60 * ((b - r) / delta + 2);
        else h = 60 * ((r - g) / delta + 4);
    }
    return { h: h < 0 ? h + 360 : h, s: max ? delta / max : 0, v: max };
};

const hsvToHex = ({ h, s, v }) => {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180
        ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return `#${[r, g, b].map(channel => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
};

const StageColorPicker = ({ value, onChange, disabled = false, label = 'Choose stage color', align = 'left' }) => {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(value.toUpperCase());
    const [hsv, setHsv] = useState(() => hexToHsv(value));
    const [panelStyle, setPanelStyle] = useState(null);
    const rootRef = useRef(null);
    const panelRef = useRef(null);
    const canvasRef = useRef(null);
    const draftRef = useRef(draft);

    const setLocalColor = (color, nextHsv = hexToHsv(color)) => {
        draftRef.current = color.toUpperCase();
        setDraft(draftRef.current);
        setHsv(nextHsv);
    };

    useEffect(() => setLocalColor(value), [value]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!open) return undefined;
        const close = (event) => {
            if (!rootRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        const position = () => {
            const trigger = rootRef.current?.getBoundingClientRect();
            if (!trigger) return;
            const width = 208;
            const height = panelRef.current?.offsetHeight || 285;
            const gap = 4;
            const margin = 8;
            const left = align === 'right' ? trigger.right - width : trigger.left;
            const top = trigger.bottom + gap + height <= window.innerHeight - margin
                ? trigger.bottom + gap
                : Math.max(margin, trigger.top - height - gap);
            setPanelStyle({
                position: 'fixed',
                top,
                left: Math.max(margin, Math.min(left, window.innerWidth - width - margin)),
                width,
            });
        };
        position();
        window.addEventListener('resize', position);
        window.addEventListener('scroll', position, true);
        return () => {
            window.removeEventListener('resize', position);
            window.removeEventListener('scroll', position, true);
        };
    }, [open, align]);

    const commit = (color) => {
        const normalized = color.toUpperCase();
        if (!HEX_COLOR.test(normalized)) {
            setDraft(value.toUpperCase());
            return;
        }
        setLocalColor(normalized);
        if (normalized.toLowerCase() !== value.toLowerCase()) onChange(normalized.toLowerCase());
    };

    const colorFromPoint = (clientX, clientY) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const next = {
            h: hsv.h,
            s: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
            v: 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
        };
        setLocalColor(hsvToHex(next), next);
        return hsvToHex(next);
    };

    const startColorDrag = (event) => {
        event.preventDefault();
        colorFromPoint(event.clientX, event.clientY);
        const move = (moveEvent) => colorFromPoint(moveEvent.clientX, moveEvent.clientY);
        const stop = (upEvent) => {
            commit(colorFromPoint(upEvent.clientX, upEvent.clientY));
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', stop);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', stop);
    };

    return (
        <div ref={rootRef} className="relative shrink-0">
            <button type="button" disabled={disabled} onClick={() => setOpen(current => !current)}
                className="block w-7 h-7 rounded-md border border-gray-200 shadow-sm disabled:opacity-50"
                style={{ backgroundColor: value }} title={`${label} (${value.toUpperCase()})`}
                aria-label={`${label} (${value.toUpperCase()})`} aria-expanded={open} />
            {open && createPortal(
                <div ref={panelRef} style={panelStyle || { position: 'fixed', visibility: 'hidden' }}
                    className="z-[var(--z-dropdown)] rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">HEX</label>
                    <div className="flex items-center gap-2 mb-3">
                        <span className="h-8 w-8 shrink-0 rounded-md border border-gray-200" style={{ backgroundColor: HEX_COLOR.test(draft) ? draft : value }} />
                        <input autoFocus type="text" value={draft} maxLength={7} spellCheck={false}
                            onChange={(event) => { const next = event.target.value.toUpperCase(); if (/^#[0-9A-F]{0,6}$/.test(next)) { draftRef.current = next; setDraft(next); } }}
                            onBlur={() => commit(draft)}
                            onKeyDown={(event) => { if (event.key === 'Enter') commit(draft); if (event.key === 'Escape') setOpen(false); }}
                            className="ds-input ds-input--sm min-w-0 flex-1 font-mono uppercase" aria-label="Hex color code" />
                    </div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Picker</p>
                    <div ref={canvasRef} onPointerDown={startColorDrag}
                        className="relative mb-2 h-24 w-full cursor-crosshair overflow-hidden rounded-md"
                        style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)`, backgroundImage: 'linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)' }}>
                        <span className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
                            style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
                    </div>
                    <input type="range" min="0" max="359" value={Math.round(hsv.h)} aria-label="Color hue"
                        onChange={(event) => {
                            const next = { ...hsv, h: Number(event.target.value) };
                            setLocalColor(hsvToHex(next), next);
                        }}
                        onPointerUp={() => commit(draftRef.current)} onKeyUp={() => commit(draftRef.current)}
                        className="mb-3 block h-3 w-full cursor-pointer appearance-none rounded-full"
                        style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }} />
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">Colors</p>
                    <div className="grid grid-cols-6 gap-1.5">
                        {COLORS.map(color => (
                            <button key={color} type="button" onClick={() => commit(color)}
                                className={`h-6 w-6 rounded-md border-2 ${value.toLowerCase() === color ? 'border-gray-900' : 'border-white ring-1 ring-gray-200'}`}
                                style={{ backgroundColor: color }} title={color.toUpperCase()} aria-label={`Select ${color.toUpperCase()}`} />
                        ))}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default StageColorPicker;

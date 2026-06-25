import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function parseYMD(str) {
    if (!str) return null;
    const parts = str.split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    return { year: parts[0], month: parts[1] - 1, day: parts[2] };
}

function toYMD(year, month, day) {
    const p = n => String(n).padStart(2, '0');
    return `${year}-${p(month + 1)}-${p(day)}`;
}

export default function DatePicker({ value, onChange, min, placeholder = 'Select date' }) {
    const today = new Date();
    const parsed = parseYMD(value);
    const minParsed = parseYMD(min);

    const [open, setOpen] = useState(false);
    const [viewYear, setViewYear] = useState(parsed?.year ?? today.getFullYear());
    const [viewMonth, setViewMonth] = useState(parsed?.month ?? today.getMonth());
    const [popupStyle, setPopupStyle] = useState({});

    const triggerRef = useRef(null);
    const popupRef = useRef(null);

    useEffect(() => {
        if (parsed) { setViewYear(parsed.year); setViewMonth(parsed.month); }
    }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!open) return;
        const onDown = (e) => {
            if (
                popupRef.current && !popupRef.current.contains(e.target) &&
                triggerRef.current && !triggerRef.current.contains(e.target)
            ) setOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);

    // Clamp popup so it never overflows the right edge of the viewport
    useEffect(() => {
        if (!open || !popupRef.current) return;
        const rect = popupRef.current.getBoundingClientRect();
        const overflow = rect.right - (window.innerWidth - 8);
        if (overflow > 0) {
            setPopupStyle(prev => ({ ...prev, left: Math.max(8, (prev.left ?? 0) - overflow) }));
        }
    }, [open]);

    const openPopup = () => {
        if (triggerRef.current) {
            const r = triggerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - r.bottom;
            setPopupStyle({
                position: 'fixed',
                left: r.left,
                zIndex: 9999,
                minWidth: Math.max(r.width, 264),
                ...(spaceBelow >= 300 ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }),
            });
        }
        setOpen(v => !v);
    };

    const prevMonth = () => viewMonth === 0 ? (setViewMonth(11), setViewYear(y => y - 1)) : setViewMonth(m => m - 1);
    const nextMonth = () => viewMonth === 11 ? (setViewMonth(0), setViewYear(y => y + 1)) : setViewMonth(m => m + 1);

    const isBeforeMin = (y, mo, d) => {
        if (!minParsed) return false;
        if (y !== minParsed.year) return y < minParsed.year;
        if (mo !== minParsed.month) return mo < minParsed.month;
        return d < minParsed.day;
    };

    const selectDay = (day) => { onChange(toYMD(viewYear, viewMonth, day)); setOpen(false); };

    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const tY = today.getFullYear(), tM = today.getMonth(), tD = today.getDate();

    const popup = open && createPortal(
        <div ref={popupRef} className="dp-popup" style={popupStyle}>
            <div className="dp-header">
                <button type="button" className="dp-nav-btn" onClick={prevMonth} aria-label="Previous month">
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <span className="dp-month-label">{MONTHS[viewMonth]} {viewYear}</span>
                <button type="button" className="dp-nav-btn" onClick={nextMonth} aria-label="Next month">
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>

            <div className="dp-weekdays">
                {WEEKDAYS.map(d => <div key={d} className="dp-weekday">{d}</div>)}
            </div>

            <div className="dp-days">
                {Array.from({ length: firstWeekday }).map((_, i) => <div key={`p${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const isToday    = viewYear === tY && viewMonth === tM && day === tD;
                    const isSelected = parsed && viewYear === parsed.year && viewMonth === parsed.month && day === parsed.day;
                    const disabled   = isBeforeMin(viewYear, viewMonth, day);
                    return (
                        <button
                            key={day}
                            type="button"
                            disabled={disabled}
                            onClick={() => selectDay(day)}
                            className={[
                                'dp-day',
                                isSelected              ? 'dp-day--selected' : '',
                                isToday && !isSelected  ? 'dp-day--today'    : '',
                                disabled                ? 'dp-day--disabled' : '',
                            ].filter(Boolean).join(' ')}
                        >
                            {day}
                        </button>
                    );
                })}
            </div>
        </div>,
        document.body
    );

    return (
        <div className="dtp-wrap">
            <div
                ref={triggerRef}
                role="button"
                tabIndex={0}
                onClick={openPopup}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && openPopup()}
                className={`add-reminder-form__input dtp-trigger ${open ? 'dtp-trigger--open' : ''}`}
            >
                <svg className="dtp-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {value
                    ? <span>{value}</span>
                    : <span className="dtp-placeholder">{placeholder}</span>
                }
            </div>
            {popup}
        </div>
    );
}

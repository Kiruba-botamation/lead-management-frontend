import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

function parse12h(value) {
    if (!value) return { h12: '10', minute: '00', period: 'AM' };
    const [hStr = '10', mStr = '00'] = value.split(':');
    const h = parseInt(hStr, 10);
    return {
        h12:    String(h % 12 || 12).padStart(2, '0'),
        minute: mStr.padStart(2, '0'),
        period: h < 12 ? 'AM' : 'PM',
    };
}

function to24h(h12str, minuteStr, period) {
    const h12 = parseInt(h12str, 10) || 12;
    const h24 = period === 'AM' ? (h12 === 12 ? 0 : h12) : (h12 === 12 ? 12 : h12 + 12);
    return `${String(h24).padStart(2, '0')}:${minuteStr.padStart(2, '0')}`;
}

function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

// Select-all deferred past the browser's mouseup cursor positioning
function selectAll(e) { const t = e.target; setTimeout(() => t.select(), 0); }

export default function TimePicker({ value, onChange, placeholder = 'Select time', minTime }) {
    const parsed = parse12h(value);

    const [open, setOpen]           = useState(false);
    const [popupStyle, setPopupStyle] = useState({});
    const [inputHour, setInputHour] = useState(parsed.h12);
    const [inputMin, setInputMin]   = useState(parsed.minute);
    const [period, setPeriod]       = useState(parsed.period);
    const [error, setError]         = useState('');

    const triggerRef = useRef(null);
    const popupRef   = useRef(null);
    const hourRef    = useRef(null);

    // Sync local state when popup opens
    useEffect(() => {
        if (!open) return;
        const p = parse12h(value);
        setInputHour(p.h12);
        setInputMin(p.minute);
        setPeriod(p.period);
        setError('');
        setTimeout(() => { hourRef.current?.focus(); hourRef.current?.select(); }, 30);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // Clamp popup left so it doesn't overflow viewport
    useEffect(() => {
        if (!open || !popupRef.current) return;
        const rect = popupRef.current.getBoundingClientRect();
        const overflow = rect.right - (window.innerWidth - 8);
        if (overflow > 0) {
            setPopupStyle(prev => ({ ...prev, left: Math.max(8, (prev.left ?? 0) - overflow) }));
        }
    }, [open]);

    // Close on outside click / Escape
    useEffect(() => {
        if (!open) return;
        const onDown = (e) => {
            if (
                popupRef.current  && !popupRef.current.contains(e.target) &&
                triggerRef.current && !triggerRef.current.contains(e.target)
            ) setOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    const openPopup = () => {
        if (triggerRef.current) {
            const r = triggerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - r.bottom;
            setPopupStyle({
                position: 'fixed',
                left: r.left,
                zIndex: 9999,
                ...(spaceBelow >= 120 ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }),
            });
        }
        setOpen(v => !v);
    };

    const clearError = () => { if (error) setError(''); };

    // Strip non-digits, keep last 2 typed (handles overtype without maxLength blocking)
    const handleHourChange = (e) => {
        let digits = e.target.value.replace(/\D/g, '');
        if (digits.length > 2) digits = digits.slice(-2);
        if (digits.length === 2) {
            const n = parseInt(digits, 10);
            if (n > 12) digits = '12';
            else if (n < 1) digits = '01';
        }
        setInputHour(digits);
        clearError();
    };

    const handleHourBlur = () => {
        const n = clamp(parseInt(inputHour, 10) || 12, 1, 12);
        setInputHour(String(n).padStart(2, '0'));
    };

    const handleMinChange = (e) => {
        let digits = e.target.value.replace(/\D/g, '');
        if (digits.length > 2) digits = digits.slice(-2);
        if (digits.length === 2) {
            const n = parseInt(digits, 10);
            if (n > 59) digits = '59';
        }
        setInputMin(digits);
        clearError();
    };

    const handleMinBlur = () => {
        const n = clamp(parseInt(inputMin, 10) || 0, 0, 59);
        setInputMin(String(n).padStart(2, '0'));
    };

    const confirm = () => {
        const h = String(clamp(parseInt(inputHour, 10) || 12, 1, 12));
        const m = String(clamp(parseInt(inputMin, 10) || 0, 0, 59)).padStart(2, '0');
        const time24 = to24h(h, m, period);
        if (minTime && time24 < minTime) {
            setError('Time is in the past');
            return;
        }
        setError('');
        onChange(time24);
        setOpen(false);
    };

    const handleKeyDown = (e) => { if (e.key === 'Enter') confirm(); };

    const { h12, minute, period: disPeriod } = parse12h(value);
    const displayText = value ? `${h12}:${minute} ${disPeriod}` : null;

    const popup = open && createPortal(
        <div ref={popupRef} className="tp-popup" style={popupStyle}>
            <div className="tp-inputs-row">
                <input
                    ref={hourRef}
                    type="text"
                    inputMode="numeric"
                    className="tp-time-input"
                    value={inputHour}
                    onChange={handleHourChange}
                    onFocus={selectAll}
                    onBlur={handleHourBlur}
                    onKeyDown={handleKeyDown}
                    placeholder="hh"
                    aria-label="Hour"
                />
                <span className="tp-colon">:</span>
                <input
                    type="text"
                    inputMode="numeric"
                    className="tp-time-input"
                    value={inputMin}
                    onChange={handleMinChange}
                    onFocus={selectAll}
                    onBlur={handleMinBlur}
                    onKeyDown={handleKeyDown}
                    placeholder="mm"
                    aria-label="Minute"
                />
                <div className="tp-period-group">
                    {['AM', 'PM'].map(p => (
                        <button
                            key={p}
                            type="button"
                            className={`tp-period-btn${period === p ? ' tp-period-btn--active' : ''}`}
                            onClick={() => { setPeriod(p); clearError(); }}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            </div>

            {error && <p className="tp-error">{error}</p>}

            <div className="tp-footer">
                <button type="button" className="tp-ok-btn" onClick={confirm}>
                    OK
                </button>
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
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {displayText
                    ? <span>{displayText}</span>
                    : <span className="dtp-placeholder">{placeholder}</span>
                }
            </div>
            {popup}
        </div>
    );
}

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const HOURS_12 = ['12', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11'];
const MINUTES  = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

function snapMinute(mStr) {
    const n = parseInt(mStr, 10);
    const snapped = String(Math.round(n / 5) * 5 % 60).padStart(2, '0');
    return MINUTES.includes(snapped) ? snapped : '00';
}

function parse12h(value) {
    if (!value) return { h12: '10', minute: '00', period: 'AM' };
    const [hStr = '10', mStr = '00'] = value.split(':');
    const h = parseInt(hStr, 10);
    return {
        h12:    String(h % 12 || 12).padStart(2, '0'),
        minute: snapMinute(mStr),
        period: h < 12 ? 'AM' : 'PM',
    };
}

function to24h(h12str, minuteStr, period) {
    const h12 = parseInt(h12str, 10);
    let h24 = period === 'AM' ? (h12 === 12 ? 0 : h12) : (h12 === 12 ? 12 : h12 + 12);
    return `${String(h24).padStart(2, '0')}:${minuteStr}`;
}

export default function TimePicker({ value, onChange, placeholder = 'Select time' }) {
    const { h12, minute, period } = parse12h(value);

    const [open, setOpen]           = useState(false);
    const [popupStyle, setPopupStyle] = useState({});

    const triggerRef = useRef(null);
    const popupRef   = useRef(null);
    const hourColRef = useRef(null);
    const minColRef  = useRef(null);

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
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);

    // Scroll selected option into centre of its column when popup opens,
    // and clamp popup left so it never overflows the right edge of the viewport
    useEffect(() => {
        if (!open) return;

        // Clamp horizontal position after the popup has rendered and has a width
        if (popupRef.current) {
            const rect = popupRef.current.getBoundingClientRect();
            const overflow = rect.right - (window.innerWidth - 8);
            if (overflow > 0) {
                setPopupStyle(prev => ({ ...prev, left: Math.max(8, (prev.left ?? 0) - overflow) }));
            }
        }

        [hourColRef, minColRef].forEach(ref => {
            if (!ref.current) return;
            const sel = ref.current.querySelector('.tp-option--selected');
            if (sel) sel.scrollIntoView({ block: 'center', behavior: 'instant' });
        });
    }, [open]);

    const openPopup = () => {
        if (triggerRef.current) {
            const r = triggerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - r.bottom;
            setPopupStyle({
                position: 'fixed',
                left: r.left,
                zIndex: 9999,
                ...(spaceBelow >= 240 ? { top: r.bottom + 4 } : { bottom: window.innerHeight - r.top + 4 }),
            });
        }
        setOpen(v => !v);
    };

    const pickHour   = (h) => { onChange(to24h(h, minute, period)); };
    const pickMinute = (m) => { onChange(to24h(h12, m, period)); };
    const pickPeriod = (p) => { onChange(to24h(h12, minute, p)); };

    const displayText = value
        ? `${h12}:${minute} ${period}`
        : null;

    const popup = open && createPortal(
        <div ref={popupRef} className="tp-popup" style={popupStyle}>
            <div className="tp-cols">

                {/* Hours */}
                <div className="tp-col-wrap">
                    <div className="tp-col-label">Hour</div>
                    <div className="tp-col" ref={hourColRef}>
                        {HOURS_12.map(h => (
                            <button
                                key={h}
                                type="button"
                                className={`tp-option${h12 === h ? ' tp-option--selected' : ''}`}
                                onClick={() => pickHour(h)}
                            >
                                {h}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="tp-colon">:</div>

                {/* Minutes */}
                <div className="tp-col-wrap">
                    <div className="tp-col-label">Min</div>
                    <div className="tp-col" ref={minColRef}>
                        {MINUTES.map(m => (
                            <button
                                key={m}
                                type="button"
                                className={`tp-option${minute === m ? ' tp-option--selected' : ''}`}
                                onClick={() => pickMinute(m)}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                </div>

                {/* AM / PM */}
                <div className="tp-col-wrap">
                    <div className="tp-col-label">Period</div>
                    <div className="tp-col tp-col--period">
                        {['AM', 'PM'].map(p => (
                            <button
                                key={p}
                                type="button"
                                className={`tp-option${period === p ? ' tp-option--selected' : ''}`}
                                onClick={() => pickPeriod(p)}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>

            </div>

            {/* OK button */}
            <div className="tp-footer">
                <button
                    type="button"
                    className="tp-ok-btn"
                    onClick={() => setOpen(false)}
                >
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

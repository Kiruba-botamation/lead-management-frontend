/**
 * ReminderCalendar
 *
 * A calendar of the current user's reminders, opened from a calendar icon placed
 * before the notification bell in the navbar. Supports Day / Week / Month / Year
 * views with date navigation. The icon changes colour when there are reminders
 * scheduled for today so admins notice pending/upcoming reminders at a glance.
 *
 * Each list item shows the lead's Name, Phone, Email and the reminder note —
 * mirroring the notification bell items.
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccount } from '../context/AccountContext';
import { remindersApi } from '../api/remindersApi';

// ── Date helpers (local time, no external lib) ──────────────────────────────────
const startOfDay  = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays     = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths   = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const startOfWeek = (d) => addDays(startOfDay(d), -startOfDay(d).getDay()); // Sunday-start
const startOfMonth = (d) => { const x = startOfDay(d); x.setDate(1); return x; };
const startOfYear  = (d) => { const x = startOfDay(d); x.setMonth(0, 1); return x; };
const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sameDay = (a, b) => dateKey(a) === dateKey(b);

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS   = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const fmtTime = (d) => new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

// Compute the [start, end) fetch range for a view anchored on `anchor`.
function rangeFor(view, anchor) {
    switch (view) {
        case 'day':   return [startOfDay(anchor), addDays(startOfDay(anchor), 1)];
        case 'week':  return [startOfWeek(anchor), addDays(startOfWeek(anchor), 7)];
        case 'month': return [startOfMonth(anchor), addMonths(startOfMonth(anchor), 1)];
        case 'year':  return [startOfYear(anchor), addMonths(startOfYear(anchor), 12)];
        default:      return [startOfDay(anchor), addDays(startOfDay(anchor), 1)];
    }
}

const VIEWS = [
    { id: 'day', label: 'Day' },
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'year', label: 'Year' },
];

// ── Single reminder row (Name / Phone / Email / note) ───────────────────────────
function ReminderRow({ rem, onOpen }) {
    const isPast = rem.mainSent || new Date(rem.scheduledAt) <= new Date();
    return (
        <div
            onClick={() => onOpen(rem)}
            style={{
                padding: '8px 10px', borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)',
                background: isPast ? 'var(--color-bg-subtle)' : 'rgba(109,40,217,0.04)',
                cursor: 'pointer', marginBottom: '6px',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-subtle)'}
            onMouseLeave={e => e.currentTarget.style.background = isPast ? 'var(--color-bg-subtle)' : 'rgba(109,40,217,0.04)'}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                <span style={{
                    fontSize: '9px', fontWeight: 700, color: '#fff',
                    background: isPast ? '#94a3b8' : '#7c3aed',
                    borderRadius: '4px', padding: '1px 6px', flexShrink: 0,
                }}>
                    {fmtTime(rem.scheduledAt)}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {rem.name || 'Unknown lead'}
                </span>
                {rem.collectionName && (
                    <span style={{
                        marginLeft: 'auto', flexShrink: 0,
                        fontSize: '9px', fontWeight: 700, color: '#0369a1',
                        background: '#e0f2fe', border: '1px solid #bae6fd',
                        borderRadius: '9999px', padding: '1px 7px',
                        maxWidth: '40%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={`Collection: ${rem.collectionName}`}>
                        {rem.collectionName}
                    </span>
                )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginBottom: '3px' }}>
                {rem.phone && <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-text-subtle)' }}>📞 {rem.phone}</span>}
                {rem.email && <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-text-subtle)' }}>✉️ {rem.email}</span>}
            </div>
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-gray-700)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {rem.description}
            </p>
        </div>
    );
}

// Separator shown between the upcoming and past groups
function GroupDivider({ label }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '10px 0 6px' }}>
            <span style={{ height: '1px', flex: 1, background: 'var(--color-border)' }} />
            <span style={{
                fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                color: 'var(--color-text-muted)',
            }}>{label}</span>
            <span style={{ height: '1px', flex: 1, background: 'var(--color-border)' }} />
        </div>
    );
}

function DaySection({ date, items, onOpen }) {
    const isToday = sameDay(date, new Date());

    // Upcoming first (nearest reminder first), then past (most recent first), split by a separator.
    const { upcoming, past } = useMemo(() => {
        const now = new Date();
        const up = [], pa = [];
        for (const r of items) {
            const isPast = r.mainSent || new Date(r.scheduledAt) <= now;
            (isPast ? pa : up).push(r);
        }
        up.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)); // nearest upcoming first
        pa.sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt)); // most recent past first
        return { upcoming: up, past: pa };
    }, [items]);

    return (
        <div style={{ marginBottom: '14px' }}>
            <div style={{
                fontSize: 'var(--text-2xs)', fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.05em', color: isToday ? '#6d28d9' : 'var(--color-text-muted)',
                marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px',
            }}>
                {date.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}
                {isToday && <span style={{ fontSize: '8px', background: '#ede9fe', color: '#6d28d9', borderRadius: '9999px', padding: '1px 6px' }}>TODAY</span>}
                <span style={{ marginLeft: 'auto', color: 'var(--color-text-muted)', fontWeight: 600 }}>{items.length || ''}</span>
            </div>
            {items.length === 0
                ? <p style={{ margin: 0, fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No reminders</p>
                : (
                    <>
                        {upcoming.map(r => <ReminderRow key={r._id} rem={r} onOpen={onOpen} />)}
                        {upcoming.length > 0 && past.length > 0 && <GroupDivider label="Past" />}
                        {past.map(r => <ReminderRow key={r._id} rem={r} onOpen={onOpen} />)}
                    </>
                )}
        </div>
    );
}

export default function ReminderCalendar() {
    const navigate = useNavigate();
    const { acctId } = useAccount();

    const [open, setOpen]     = useState(false);
    const [view, setView]     = useState('day');
    const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
    const [items, setItems]   = useState([]);
    const [loading, setLoading] = useState(false);
    const [hasToday, setHasToday] = useState(false);
    const popRef = useRef(null);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (popRef.current && !popRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // Today indicator for the icon colour — refreshed on mount, account change, and on close
    const refreshToday = useCallback(async () => {
        if (!acctId) return;
        const [s, e] = rangeFor('day', new Date());
        try {
            const res = await remindersApi.calendar(acctId, s.toISOString(), e.toISOString());
            setHasToday((res.data?.data || []).length > 0);
        } catch { /* non-fatal */ }
    }, [acctId]);

    useEffect(() => { refreshToday(); }, [refreshToday]);

    // Fetch reminders for the visible range whenever the dialog/view/anchor changes
    const fetchRange = useCallback(async () => {
        if (!acctId) return;
        const [s, e] = rangeFor(view, anchor);
        setLoading(true);
        try {
            const res = await remindersApi.calendar(acctId, s.toISOString(), e.toISOString());
            setItems(res.data?.data || []);
        } catch { setItems([]); }
        finally { setLoading(false); }
    }, [acctId, view, anchor]);

    useEffect(() => { if (open) fetchRange(); }, [open, fetchRange]);

    const handleToggle = () => {
        setOpen(o => {
            const next = !o;
            if (!next) refreshToday();        // refresh icon state when closing
            else { setView('day'); setAnchor(startOfDay(new Date())); }
            return next;
        });
    };

    // Group fetched items by local date key for fast lookup
    const byDay = useMemo(() => {
        const map = {};
        for (const r of items) {
            const k = dateKey(new Date(r.scheduledAt));
            (map[k] ||= []).push(r);
        }
        return map;
    }, [items]);

    const openLead = (rem) => { setOpen(false); navigate(`/leads?openLead=${rem.leadId}&tab=reminders`); };

    // Navigation step depends on the active view
    const step = (dir) => {
        setAnchor(a => {
            if (view === 'day')   return addDays(a, dir);
            if (view === 'week')  return addDays(a, dir * 7);
            if (view === 'month') return addMonths(a, dir);
            return addMonths(a, dir * 12); // year
        });
    };
    const goToday = () => setAnchor(startOfDay(new Date()));

    const periodLabel = useMemo(() => {
        if (view === 'day')  return anchor.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
        if (view === 'week') {
            const s = startOfWeek(anchor), e = addDays(s, 6);
            return `${s.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${e.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
        }
        if (view === 'month') return `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
        return `${anchor.getFullYear()}`;
    }, [view, anchor]);

    return (
        <div style={{ position: 'relative' }} ref={popRef}>
            {/* Calendar icon button — colour signals whether reminders exist today */}
            <button
                onClick={handleToggle}
                title={hasToday ? 'Reminders scheduled today' : 'Reminder calendar'}
                style={{
                    position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '2rem', height: '2rem', borderRadius: 'var(--radius-lg)',
                    background: hasToday
                        ? (open ? 'rgba(124,58,237,0.55)' : 'rgba(124,58,237,0.30)')
                        : (open ? 'rgba(100,116,139,0.55)' : 'rgba(100,116,139,0.30)'),
                    border: `1px solid ${hasToday ? 'rgba(167,139,250,0.65)' : 'rgba(100,116,139,0.45)'}`,
                    cursor: 'pointer', flexShrink: 0,
                    color: hasToday ? '#ddd6fe' : 'rgba(255,255,255,0.85)',
                    transition: 'background var(--transition-fast), color var(--transition-fast)',
                }}
            >
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {hasToday && (
                    <span style={{
                        position: 'absolute', top: '-3px', right: '-3px',
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: '#7c3aed', boxShadow: '0 0 0 2px rgba(30,41,59,0.7)',
                    }} />
                )}
            </button>

            {/* Dialog */}
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                    width: '40rem', maxWidth: 'calc(100vw - 1rem)',
                    height: '34rem', maxHeight: 'calc(100vh - 5rem)',
                    display: 'flex', flexDirection: 'column',
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-2xl)',
                    zIndex: 9000, overflow: 'hidden',
                }}>
                    {/* Header: title + view switcher */}
                    <div style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)', color: 'var(--color-text)' }}>
                                Reminder Calendar
                            </span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                {VIEWS.map(v => (
                                    <button
                                        key={v.id}
                                        onClick={() => setView(v.id)}
                                        style={{
                                            fontSize: '11px', fontWeight: 600, padding: '3px 10px',
                                            borderRadius: '8px', cursor: 'pointer',
                                            border: `1px solid ${view === v.id ? '#7c3aed' : 'var(--color-border)'}`,
                                            background: view === v.id ? '#ede9fe' : 'var(--color-surface)',
                                            color: view === v.id ? '#6d28d9' : 'var(--color-text)',
                                        }}
                                    >
                                        {v.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {/* Navigation */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button onClick={() => step(-1)} style={navBtn} title="Previous">‹</button>
                            <button onClick={goToday} style={{ ...navBtn, width: 'auto', padding: '0 10px', fontSize: '11px', fontWeight: 600 }}>Today</button>
                            <button onClick={() => step(1)} style={navBtn} title="Next">›</button>
                            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text)', marginLeft: '4px' }}>
                                {periodLabel}
                            </span>
                            {loading && <span className="animate-spin" style={{ marginLeft: 'auto', width: '14px', height: '14px', border: '2px solid #c4b5fd', borderTopColor: 'transparent', borderRadius: '50%' }} />}
                        </div>
                    </div>

                    {/* Body */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-3)' }}>
                        {view === 'day' && (
                            <DaySection date={anchor} items={byDay[dateKey(anchor)] || []} onOpen={openLead} />
                        )}

                        {view === 'week' && (
                            Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i)).map(d => (
                                <DaySection key={dateKey(d)} date={d} items={byDay[dateKey(d)] || []} onOpen={openLead} />
                            ))
                        )}

                        {view === 'month' && (
                            <MonthGrid anchor={anchor} byDay={byDay} onPickDay={(d) => { setAnchor(startOfDay(d)); setView('day'); }} />
                        )}

                        {view === 'year' && (
                            <YearGrid anchor={anchor} items={items} onPickMonth={(d) => { setAnchor(startOfMonth(d)); setView('month'); }} />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

const navBtn = {
    width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: '7px', border: '1px solid var(--color-border)', background: 'var(--color-surface)',
    cursor: 'pointer', fontSize: '16px', lineHeight: 1, color: 'var(--color-text)', padding: 0,
};

// ── Month grid (counts per day; click a day → day view) ─────────────────────────
function MonthGrid({ anchor, byDay, onPickDay }) {
    const first = startOfMonth(anchor);
    const gridStart = startOfWeek(first);
    const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
    const today = new Date();
    return (
        <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
                {WEEKDAYS.map(w => (
                    <div key={w} style={{ textAlign: 'center', fontSize: '9px', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{w}</div>
                ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                {cells.map(d => {
                    const inMonth = d.getMonth() === anchor.getMonth();
                    const count = (byDay[dateKey(d)] || []).length;
                    const isToday = sameDay(d, today);
                    return (
                        <button
                            key={dateKey(d)}
                            onClick={() => onPickDay(d)}
                            style={{
                                minHeight: '54px', borderRadius: '8px', cursor: 'pointer', padding: '4px',
                                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '3px',
                                border: `1px solid ${isToday ? '#7c3aed' : 'var(--color-border)'}`,
                                background: count ? 'rgba(124,58,237,0.07)' : 'var(--color-surface)',
                                opacity: inMonth ? 1 : 0.4,
                            }}
                        >
                            <span style={{ fontSize: '11px', fontWeight: isToday ? 800 : 600, color: isToday ? '#6d28d9' : 'var(--color-text)' }}>
                                {d.getDate()}
                            </span>
                            {count > 0 && (
                                <span style={{ fontSize: '9px', fontWeight: 700, color: '#fff', background: '#7c3aed', borderRadius: '9999px', padding: '0 5px' }}>
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ── Year grid (12 mini months with totals; click → month view) ──────────────────
function YearGrid({ anchor, items, onPickMonth }) {
    const counts = useMemo(() => {
        const c = Array(12).fill(0);
        for (const r of items) c[new Date(r.scheduledAt).getMonth()] += 1;
        return c;
    }, [items]);
    const year = anchor.getFullYear();
    const thisMonth = new Date();
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {MONTHS.map((m, i) => {
                const isCurrent = thisMonth.getFullYear() === year && thisMonth.getMonth() === i;
                return (
                    <button
                        key={m}
                        onClick={() => onPickMonth(new Date(year, i, 1))}
                        style={{
                            padding: '12px', borderRadius: '10px', cursor: 'pointer',
                            border: `1px solid ${isCurrent ? '#7c3aed' : 'var(--color-border)'}`,
                            background: counts[i] ? 'rgba(124,58,237,0.07)' : 'var(--color-surface)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                        }}
                    >
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: isCurrent ? '#6d28d9' : 'var(--color-text)' }}>{m}</span>
                        <span style={{
                            fontSize: '11px', fontWeight: 700,
                            color: counts[i] ? '#6d28d9' : 'var(--color-text-muted)',
                        }}>
                            {counts[i] ? `${counts[i]} reminder${counts[i] > 1 ? 's' : ''}` : '—'}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

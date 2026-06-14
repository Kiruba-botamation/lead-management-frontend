/**
 * AddReminderForm
 *
 * Create or edit a reminder for a lead.
 *
 * Fields:
 *   - description (required)
 *   - date + time — two separate styled inputs
 *   - preReminderEnabled — toggle; reveals value + unit selectors
 *   - channels — pill toggles: inApp, push, email, whatsapp (requires phone)
 *
 * Push channel: when selected, checks browser push permission.
 * Shows an inline banner to prompt the user to enable it if needed.
 */
import React, { useState, useEffect } from 'react';
import { remindersApi } from '../api/remindersApi';
import { pushApi }      from '../api/pushApi';
import { Dropdown, DropdownItem } from './ui/Dropdown';

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNELS = [
    { id: 'inApp',    label: 'In-App',   requiresPhone: false },
    { id: 'push',     label: 'Push',     requiresPhone: false },
    { id: 'email',    label: 'Email',    requiresPhone: false },
    { id: 'whatsapp', label: 'WhatsApp', requiresPhone: true  },
];

const PRE_UNITS = [
    { value: 'minutes', label: 'Minutes' },
    { value: 'hours',   label: 'Hours'   },
    { value: 'days',    label: 'Days'    },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Split an ISO/Date string into { date: 'YYYY-MM-DD', time: 'HH:MM' } */
function splitDatetime(isoStr) {
    if (!isoStr) return { date: '', time: '' };
    try {
        const d   = new Date(isoStr);
        const pad = n => String(n).padStart(2, '0');
        return {
            date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
            time: pad(d.getHours()) + ':' + pad(d.getMinutes()),
        };
    } catch { return { date: '', time: '' }; }
}

/** Today's date in YYYY-MM-DD for the min attribute on the date input */
function todayStr() {
    const d   = new Date();
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

// ── Small SVG helpers ─────────────────────────────────────────────────────────

const ChevronDown = () => (
    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
);

// ── Push permission banner ────────────────────────────────────────────────────

function PushBanner({ state, onEnable }) {
    if (!state) return null;

    if (state === 'requesting') {
        return (
            <div style={{
                marginTop:    '0.5rem',
                padding:      'var(--space-2) var(--space-2-5)',
                background:   'var(--color-primary-50)',
                border:       '1px solid var(--color-primary-200)',
                borderRadius: 'var(--radius-md)',
                fontSize:     'var(--text-xs)',
                color:        'var(--color-primary-700)',
            }}>
                Requesting permission…
            </div>
        );
    }

    if (state === 'denied') {
        return (
            <div style={{
                marginTop:    '0.5rem',
                padding:      'var(--space-2) var(--space-2-5)',
                background:   'var(--color-warning-50)',
                border:       '1px solid var(--color-warning-200)',
                borderRadius: 'var(--radius-md)',
                fontSize:     'var(--text-xs)',
                color:        'var(--color-warning-700)',
            }}>
                Push notifications are blocked for this site. To receive push reminders, enable notifications in your browser settings for this page.
            </div>
        );
    }

    // state === 'prompt'
    return (
        <div style={{
            marginTop:    '0.5rem',
            padding:      'var(--space-2) var(--space-2-5)',
            background:   'var(--color-primary-50)',
            border:       '1px solid var(--color-primary-200)',
            borderRadius: 'var(--radius-md)',
            display:      'flex',
            alignItems:   'flex-start',
            gap:          'var(--space-2)',
        }}>
            {/* Bell icon */}
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                style={{ flexShrink: 0, color: 'var(--color-primary-600)', marginTop: '1px' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <div style={{ flex: 1 }}>
                <p style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-primary-700)', margin: '0 0 3px' }}>
                    Enable push notifications
                </p>
                <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-primary-600)', margin: '0 0 6px' }}>
                    Get reminders even when this tab is in the background.
                </p>
                <button
                    type="button"
                    onClick={onEnable}
                    style={{
                        fontSize:     'var(--text-2xs)',
                        fontWeight:   'var(--font-semibold)',
                        color:        'var(--color-white)',
                        background:   'var(--color-primary-600)',
                        border:       'none',
                        borderRadius: 'var(--radius-md)',
                        padding:      '3px 10px',
                        cursor:       'pointer',
                    }}
                >
                    Enable notifications
                </button>
            </div>
        </div>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * @param {string}        leadId         - The lead this reminder belongs to
 * @param {string}        acctId         - The account ID (forwarded as query param)
 * @param {object|null}   reminder       - Existing reminder to edit (null = create)
 * @param {boolean}       adminHasPhone  - Whether the current admin has a phone number
 * @param {function}      onSaved(rem)   - Called with the saved reminder object
 * @param {function}      onCancel       - Called when the user dismisses the form
 * @param {function}      onError(msg)   - Called with an error message string
 */
export default function AddReminderForm({ leadId, acctId, reminder, adminHasPhone, onSaved, onCancel, onError }) {
    const isEdit    = Boolean(reminder);
    const initSplit = splitDatetime(reminder?.scheduledAt);

    const [description,    setDescription]    = useState(reminder?.description || '');
    const [schedDate,      setSchedDate]      = useState(initSplit.date);
    const [schedTime,      setSchedTime]      = useState(initSplit.time);
    const [preEnabled,     setPreEnabled]     = useState(reminder?.preReminderEnabled || false);
    const [preValue,       setPreValue]       = useState(reminder?.preReminderValue || 30);
    const [preUnit,        setPreUnit]        = useState(reminder?.preReminderUnit || 'minutes');
    const [activeChannels, setActiveChannels] = useState(reminder?.channels || ['inApp', 'push']);
    const [saving,         setSaving]         = useState(false);
    const [fieldError,     setFieldError]     = useState('');

    /** null | 'prompt' | 'denied' | 'requesting' */
    const [pushState, setPushState] = useState(null);

    // ── On mount: if push is in the default channels, silently check permission ─
    // This shows the inline banner immediately when the form opens, so the user
    // doesn't have to toggle push off then on to see the prompt.
    useEffect(() => {
        if (!activeChannels.includes('push')) return;
        pushApi.ensureSubscribed().then(result => {
            if (result.ok)                    setPushState(null);
            else if (result.reason === 'prompt')  setPushState('prompt');
            else if (result.reason === 'denied')  setPushState('denied');
            else if (result.reason === 'unsupported') {
                setActiveChannels(prev => prev.filter(c => c !== 'push'));
            }
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Channel toggle ────────────────────────────────────────────────────────
    const toggleChannel = async (id) => {
        const wasActive = activeChannels.includes(id);
        setActiveChannels(prev => wasActive ? prev.filter(c => c !== id) : [...prev, id]);

        // When enabling the Push channel, verify push permission / subscription
        if (id === 'push' && !wasActive) {
            const result = await pushApi.ensureSubscribed();
            if (result.ok) {
                setPushState(null);
            } else if (result.reason === 'prompt') {
                setPushState('prompt');
            } else if (result.reason === 'denied') {
                setPushState('denied');
            } else if (result.reason === 'unsupported') {
                // Browser doesn't support push — silently remove the channel
                setActiveChannels(prev => prev.filter(c => c !== 'push'));
            }
            // 'error' — leave selected but don't show banner (transient failure)
        }

        // Clear push banner when disabling push
        if (id === 'push' && wasActive) {
            setPushState(null);
        }
    };

    // ── Enable push flow (banner button click) ────────────────────────────────
    const handleEnablePush = async () => {
        if (!('Notification' in window)) {
            setPushState('denied');
            return;
        }
        setPushState('requesting');
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
            setPushState('denied');
            return;
        }
        const result = await pushApi.ensureSubscribed();
        setPushState(result.ok ? null : 'denied');
    };

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = async () => {
        const trimDesc = description.trim();
        if (!trimDesc)                { setFieldError('Description is required.'); return; }
        if (!schedDate || !schedTime) { setFieldError('Date and time are required.'); return; }

        const scheduled = new Date(schedDate + 'T' + schedTime);
        if (isNaN(scheduled.getTime())) { setFieldError('Invalid date or time.'); return; }
        if (scheduled <= new Date())    { setFieldError('Scheduled time must be in the future.'); return; }

        setSaving(true);
        setFieldError('');
        try {
            const data = {
                description:        trimDesc,
                scheduledAt:        scheduled.toISOString(),
                preReminderEnabled: preEnabled,
                preReminderValue:   preEnabled ? Number(preValue) : undefined,
                preReminderUnit:    preEnabled ? preUnit : undefined,
                channels:           activeChannels,
            };
            const res = isEdit
                ? await remindersApi.update(leadId, reminder._id, data, acctId)
                : await remindersApi.create(leadId, data, acctId);
            onSaved(res.data?.data);
        } catch (err) {
            const msg = err.response?.data?.message || 'Failed to save reminder.';
            setFieldError(msg);
            onError?.(msg);
        } finally {
            setSaving(false);
        }
    };

    const preUnitLabel  = PRE_UNITS.find(u => u.value === preUnit)?.label || 'Minutes';
    const subLabelStyle = { display: 'block', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', marginBottom: '3px' };

    return (
        <div className="add-reminder-form">

            {/* ── Header ── */}
            <div className="add-reminder-form__header">
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {isEdit ? 'Edit Reminder' : 'New Reminder'}
            </div>

            {/* ── Body ── */}
            <div className="add-reminder-form__body">

                {/* Description */}
                <div>
                    <label className="add-reminder-form__label">
                        Description <span style={{ color: 'var(--color-danger-500)' }}>*</span>
                    </label>
                    <textarea
                        className="add-reminder-form__textarea"
                        placeholder="What needs to be done…"
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                    />
                </div>

                {/* Remind at — date + time as two separate styled inputs */}
                <div>
                    <label className="add-reminder-form__label">
                        Remind at <span style={{ color: 'var(--color-danger-500)' }}>*</span>
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {/* Date picker */}
                        <div style={{ flex: 1 }}>
                            <label style={subLabelStyle}>Date</label>
                            <div className="add-reminder-form__datetime-wrap">
                                <svg className="add-reminder-form__datetime-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <input
                                    type="date"
                                    className="add-reminder-form__input add-reminder-form__datetime-input"
                                    value={schedDate}
                                    min={todayStr()}
                                    onChange={e => setSchedDate(e.target.value)}
                                />
                            </div>
                        </div>
                        {/* Time picker */}
                        <div style={{ width: '110px', flexShrink: 0 }}>
                            <label style={subLabelStyle}>Time</label>
                            <div className="add-reminder-form__datetime-wrap">
                                <svg className="add-reminder-form__datetime-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <input
                                    type="time"
                                    className="add-reminder-form__input add-reminder-form__datetime-input"
                                    value={schedTime}
                                    onChange={e => setSchedTime(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Pre-reminder toggle */}
                <div>
                    <label className="add-reminder-form__label">Pre-Reminder</label>
                    <div
                        className="add-reminder-form__toggle-row"
                        onClick={() => setPreEnabled(v => !v)}
                    >
                        <div className={'add-reminder-form__toggle' + (preEnabled ? ' add-reminder-form__toggle--on' : '')} />
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>
                            {preEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>

                    {preEnabled && (
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'flex-end' }}>

                            {/* Amount */}
                            <div style={{ width: '72px', flexShrink: 0 }}>
                                <label style={subLabelStyle}>Amount</label>
                                <input
                                    type="number"
                                    className="add-reminder-form__input"
                                    min={1}
                                    max={9999}
                                    value={preValue}
                                    style={{ textAlign: 'center' }}
                                    onChange={e => setPreValue(Math.max(1, parseInt(e.target.value, 10) || 1))}
                                />
                            </div>

                            {/* Unit — app Dropdown for consistent indigo theme */}
                            <div style={{ flex: 1 }}>
                                <label style={subLabelStyle}>Unit</label>
                                <Dropdown
                                    portal
                                    align="left"
                                    trigger={
                                        <button
                                            type="button"
                                            className="add-reminder-form__input"
                                            style={{
                                                display:        'flex',
                                                alignItems:     'center',
                                                justifyContent: 'space-between',
                                                cursor:         'pointer',
                                                width:          '100%',
                                            }}
                                        >
                                            <span>{preUnitLabel}</span>
                                            <ChevronDown />
                                        </button>
                                    }
                                >
                                    {PRE_UNITS.map(u => (
                                        <DropdownItem
                                            key={u.value}
                                            active={preUnit === u.value}
                                            onClick={() => setPreUnit(u.value)}
                                        >
                                            {u.label}
                                        </DropdownItem>
                                    ))}
                                </Dropdown>
                            </div>

                            <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', paddingBottom: '6px' }}>
                                before
                            </span>
                        </div>
                    )}
                </div>

                {/* Notify via channels */}
                <div>
                    <label className="add-reminder-form__label">Notify via</label>
                    <div className="add-reminder-form__channels">
                        {CHANNELS.map(ch => {
                            const disabled = ch.requiresPhone && !adminHasPhone;
                            const active   = activeChannels.includes(ch.id);
                            return (
                                <div
                                    key={ch.id}
                                    className={[
                                        'add-reminder-form__channel-option',
                                        active   ? 'add-reminder-form__channel-option--active'   : '',
                                        disabled ? 'add-reminder-form__channel-option--disabled' : '',
                                    ].filter(Boolean).join(' ')}
                                    onClick={() => !disabled && toggleChannel(ch.id)}
                                    title={disabled ? 'No phone number on your profile' : undefined}
                                >
                                    {active && (
                                        <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                    {ch.label}
                                </div>
                            );
                        })}
                    </div>

                    {/* Push permission banner — shown when push is selected but permission is missing */}
                    <PushBanner state={pushState} onEnable={handleEnablePush} />
                </div>

                {/* Validation error */}
                {fieldError && (
                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-danger-500)', margin: 0 }}>
                        {fieldError}
                    </p>
                )}
            </div>

            {/* ── Footer ── */}
            <div className="add-reminder-form__footer">
                <button
                    onClick={onCancel}
                    disabled={saving}
                    className="btn btn--secondary btn--sm"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={saving || !description.trim() || !schedDate || !schedTime}
                    className="btn btn--primary btn--sm"
                >
                    {saving ? 'Saving…' : isEdit ? 'Update' : 'Set Reminder'}
                </button>
            </div>
        </div>
    );
}

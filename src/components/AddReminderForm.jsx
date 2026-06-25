/**
 * AddReminderForm
 *
 * Create or edit a reminder for a lead.
 *
 * Fields:
 *   - description (required)
 *   - date + time — prefilled to next day 10 AM
 *   - preReminderEnabled — toggle; reveals value + unit selectors
 *   - channels — pill toggles: inApp, push, email, whatsapp (requires phone)
 *   - clientReminderEnabled — toggle; reveals client-specific message, date/time, and channels
 */
import React, { useState, useEffect } from 'react';
import { remindersApi } from '../api/remindersApi';
import { pushApi }      from '../api/pushApi';
import { Dropdown, DropdownItem } from './ui/Dropdown';
import DatePicker from './ui/DatePicker';
import TimePicker from './ui/TimePicker';

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNELS = [
    { id: 'inApp',    label: 'In-App',   requiresPhone: false },
    { id: 'push',     label: 'Push',     requiresPhone: false },
    { id: 'email',    label: 'Email',    requiresPhone: false },
    { id: 'whatsapp', label: 'WhatsApp', requiresPhone: true  },
];

const CLIENT_CHANNELS = [
    { id: 'email',    label: 'Email',    requiresEmail: true,  requiresPhone: false },
    { id: 'whatsapp', label: 'WhatsApp', requiresEmail: false, requiresPhone: true  },
    { id: 'sms',      label: 'SMS',      requiresEmail: false, requiresPhone: true  },
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

/** Returns { date, time } for tomorrow at 10:00 AM */
function nextDayAt10AM() {
    const d   = new Date();
    d.setDate(d.getDate() + 1);
    const pad = n => String(n).padStart(2, '0');
    return {
        date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()),
        time: '10:00',
    };
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
 * @param {string}        leadName       - Lead's name (for client reminder preview)
 * @param {string}        leadPhone      - Lead's phone (for client reminder preview)
 * @param {string}        leadEmail      - Lead's email (for client reminder preview)
 * @param {function}      onSaved(rem)   - Called with the saved reminder object
 * @param {function}      onCancel       - Called when the user dismisses the form
 * @param {function}      onError(msg)   - Called with an error message string
 */
export default function AddReminderForm({
    leadId, acctId, adminId, reminder, adminHasPhone,
    leadName = '', leadPhone = '', leadEmail = '',
    onSaved, onCancel, onError
}) {
    const isEdit    = Boolean(reminder);
    const initSplit = splitDatetime(reminder?.scheduledAt);
    const defaults  = nextDayAt10AM();

    // ── Admin reminder state ──────────────────────────────────────────────────
    const [description,    setDescription]    = useState(reminder?.description || '');
    const [schedDate,      setSchedDate]      = useState(isEdit ? initSplit.date : defaults.date);
    const [schedTime,      setSchedTime]      = useState(isEdit ? initSplit.time : defaults.time);
    const [preEnabled,     setPreEnabled]     = useState(reminder?.preReminderEnabled || false);
    const [preValue,       setPreValue]       = useState(reminder?.preReminderValue || 30);
    const [preUnit,        setPreUnit]        = useState(reminder?.preReminderUnit || 'minutes');
    const [activeChannels, setActiveChannels] = useState(reminder?.channels || ['inApp', 'push']);
    const [saving,         setSaving]         = useState(false);
    const [fieldError,     setFieldError]     = useState('');

    /** null | 'prompt' | 'denied' | 'requesting' */
    const [pushState, setPushState] = useState(null);

    // ── Client reminder state ─────────────────────────────────────────────────
    const clientInitSplit = splitDatetime(reminder?.clientScheduledAt);
    const [clientEnabled,   setClientEnabled]   = useState(reminder?.clientReminderEnabled || false);
    const [clientMessage,   setClientMessage]   = useState(reminder?.clientMessage || '');
    const [clientDate,      setClientDate]      = useState(
        (isEdit && reminder?.clientScheduledAt) ? clientInitSplit.date : defaults.date
    );
    const [clientTime,      setClientTime]      = useState(
        (isEdit && reminder?.clientScheduledAt) ? clientInitSplit.time : defaults.time
    );
    const [clientChannels,  setClientChannels]  = useState(reminder?.clientChannels || []);

    // ── On mount: check push permission silently ──────────────────────────────
    useEffect(() => {
        if (!activeChannels.includes('push')) return;
        pushApi.ensureSubscribed().then(result => {
            if (result.ok)                            setPushState(null);
            else if (result.reason === 'prompt')      setPushState('prompt');
            else if (result.reason === 'denied')      setPushState('denied');
            else if (result.reason === 'unsupported') {
                setActiveChannels(prev => prev.filter(c => c !== 'push'));
            }
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Channel toggle (admin) ────────────────────────────────────────────────
    const toggleChannel = async (id) => {
        const wasActive = activeChannels.includes(id);
        setActiveChannels(prev => wasActive ? prev.filter(c => c !== id) : [...prev, id]);

        if (id === 'push' && !wasActive) {
            const result = await pushApi.ensureSubscribed();
            if (result.ok) {
                setPushState(null);
            } else if (result.reason === 'prompt') {
                setPushState('prompt');
            } else if (result.reason === 'denied') {
                setPushState('denied');
            } else if (result.reason === 'unsupported') {
                setActiveChannels(prev => prev.filter(c => c !== 'push'));
            }
        }

        if (id === 'push' && wasActive) setPushState(null);
    };

    const handleEnablePush = async () => {
        if (!('Notification' in window)) { setPushState('denied'); return; }
        setPushState('requesting');
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') { setPushState('denied'); return; }
        const result = await pushApi.ensureSubscribed();
        setPushState(result.ok ? null : 'denied');
    };

    // ── Client channel toggle ─────────────────────────────────────────────────
    const toggleClientChannel = (id) => {
        setClientChannels(prev =>
            prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
        );
    };

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = async () => {
        const trimDesc = description.trim();
        if (!trimDesc)                { setFieldError('Description is required.'); return; }
        if (!schedDate || !schedTime) { setFieldError('Date and time are required.'); return; }

        const scheduled = new Date(schedDate + 'T' + schedTime);
        if (isNaN(scheduled.getTime())) { setFieldError('Invalid date or time.'); return; }
        if (scheduled <= new Date())    { setFieldError('Scheduled time must be in the future.'); return; }

        // Validate client reminder
        if (clientEnabled) {
            if (!clientMessage.trim()) {
                setFieldError('Client message is required.');
                return;
            }
            if (!clientDate || !clientTime) {
                setFieldError('Client reminder date and time are required.');
                return;
            }
            const clientScheduled = new Date(clientDate + 'T' + clientTime);
            if (isNaN(clientScheduled.getTime())) {
                setFieldError('Invalid client reminder date or time.');
                return;
            }
            if (clientScheduled <= new Date()) {
                setFieldError('Client reminder time must be in the future.');
                return;
            }
            if (clientChannels.length === 0) {
                setFieldError('Select at least one channel for the client reminder.');
                return;
            }
        }

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
                adminId:            reminder?.adminId || adminId,
                // Client reminder
                clientReminderEnabled: clientEnabled,
                ...(clientEnabled && {
                    clientMessage:     clientMessage.trim(),
                    clientScheduledAt: new Date(clientDate + 'T' + clientTime).toISOString(),
                    clientChannels,
                }),
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

                {/* Remind at — date + time */}
                <div>
                    <label className="add-reminder-form__label">
                        Remind at <span style={{ color: 'var(--color-danger-500)' }}>*</span>
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <div style={{ flex: 1 }}>
                            <label style={subLabelStyle}>Date</label>
                            <DatePicker
                                value={schedDate}
                                onChange={setSchedDate}
                                min={todayStr()}
                            />
                        </div>
                        <div style={{ width: '110px', flexShrink: 0 }}>
                            <label style={subLabelStyle}>Time</label>
                            <TimePicker
                                value={schedTime}
                                onChange={setSchedTime}
                            />
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

                            <div style={{ width: '108px', flexShrink: 0 }}>
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

                {/* Notify via channels (admin) */}
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
                    <PushBanner state={pushState} onEnable={handleEnablePush} />
                </div>

                {/* ── Divider ── */}
                <div style={{ borderTop: '1px dashed var(--color-border)' }} />

                {/* Client Reminder toggle */}
                <div>
                    <label className="add-reminder-form__label">Client Reminder</label>
                    <div
                        className="add-reminder-form__toggle-row"
                        onClick={() => setClientEnabled(v => !v)}
                    >
                        <div className={'add-reminder-form__toggle' + (clientEnabled ? ' add-reminder-form__toggle--on' : '')} />
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-subtle)' }}>
                            {clientEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>

                    {clientEnabled && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginTop: '0.75rem' }}>

                            {/* Contact info preview */}
                            {(leadName || leadPhone || leadEmail) && (
                                <div className="add-reminder-form__client-info">
                                    {leadName  && <span>&#128100; {leadName}</span>}
                                    {leadPhone && <span>&#128222; {leadPhone}</span>}
                                    <span style={{ color: leadEmail ? 'inherit' : 'var(--color-text-muted)' }}>
                                        &#9993; {leadEmail || 'No email on file'}
                                    </span>
                                </div>
                            )}

                            {/* Message */}
                            <div>
                                <label style={subLabelStyle}>
                                    Message <span style={{ color: 'var(--color-danger-500)' }}>*</span>
                                </label>
                                <textarea
                                    className="add-reminder-form__textarea"
                                    placeholder="Your message to the client…"
                                    value={clientMessage}
                                    onChange={e => setClientMessage(e.target.value)}
                                />
                            </div>

                            {/* Send at — date + time */}
                            <div>
                                <label style={subLabelStyle}>
                                    Send at <span style={{ color: 'var(--color-danger-500)' }}>*</span>
                                </label>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <DatePicker
                                            value={clientDate}
                                            onChange={setClientDate}
                                            min={todayStr()}
                                        />
                                    </div>
                                    <div style={{ width: '110px', flexShrink: 0 }}>
                                        <TimePicker
                                            value={clientTime}
                                            onChange={setClientTime}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Notify client via */}
                            <div>
                                <label style={subLabelStyle}>Notify via</label>
                                <div className="add-reminder-form__channels">
                                    {CLIENT_CHANNELS.map(ch => {
                                        const disabled = (ch.requiresEmail && !leadEmail) || (ch.requiresPhone && !leadPhone);
                                        const active   = !disabled && clientChannels.includes(ch.id);
                                        const title    = ch.requiresEmail && !leadEmail ? 'No email on file for this lead'
                                                       : ch.requiresPhone && !leadPhone ? 'No phone on file for this lead'
                                                       : undefined;
                                        return (
                                            <div
                                                key={ch.id}
                                                className={[
                                                    'add-reminder-form__channel-option',
                                                    active   ? 'add-reminder-form__channel-option--active'   : '',
                                                    disabled ? 'add-reminder-form__channel-option--disabled' : '',
                                                ].filter(Boolean).join(' ')}
                                                onClick={() => !disabled && toggleClientChannel(ch.id)}
                                                title={title}
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
                            </div>
                        </div>
                    )}
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
                    disabled={
                        saving ||
                        !description.trim() ||
                        !schedDate ||
                        !schedTime ||
                        (clientEnabled && (
                            !clientMessage.trim() ||
                            !clientDate ||
                            !clientTime ||
                            clientChannels.length === 0
                        ))
                    }
                    className="btn btn--primary btn--sm"
                >
                    {saving ? 'Saving…' : isEdit ? 'Update' : 'Set Reminder'}
                </button>
            </div>
        </div>
    );
}

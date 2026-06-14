/**
 * ReminderCard
 *
 * Displays a single reminder. Shows scheduled time, title, description,
 * pre-reminder badge, and channel badges. Sent reminders are dimmed.
 * Creator can edit or delete unsent reminders.
 */
import React from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNEL_META = {
    inApp:    { label: 'In-App' },
    push:     { label: 'Push' },
    email:    { label: 'Email' },
    whatsapp: { label: 'WhatsApp' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatScheduledAt(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('en-IN', {
        day:    '2-digit',
        month:  'short',
        year:   'numeric',
        hour:   '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

function preReminderLabel(value, unit) {
    if (!value || !unit) return '';
    return `${value} ${unit} before`;
}

// ── SVG icons ─────────────────────────────────────────────────────────────────

const ClockIcon = () => (
    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const CheckIcon = () => (
    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
);

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * @param {object}   reminder         - Reminder document from the API
 * @param {string}   currentAdminId   - Logged-in admin's userId (ownership check)
 * @param {function} onEdit(reminder) - Open edit form for this reminder
 * @param {function} onDelete(id)     - Delete this reminder
 */
export default function ReminderCard({ reminder, currentAdminId, onEdit, onDelete }) {
    const isSent  = reminder.mainSent;
    const isOwner = reminder.adminId === currentAdminId;

    return (
        <div className={`reminder-card${isSent ? ' reminder-card--sent' : ''}`}>
            {/* Header — scheduled time */}
            <div className="reminder-card__header">
                <span className={`reminder-card__time-badge${isSent ? ' reminder-card__time-badge--sent' : ''}`}>
                    {isSent ? <CheckIcon /> : <ClockIcon />}
                    {formatScheduledAt(reminder.scheduledAt)}
                    {isSent && <span style={{ marginLeft: '4px', fontSize: '10px', fontWeight: 500 }}>(Sent)</span>}
                </span>
            </div>

            {/* Body */}
            <div className="reminder-card__body">
                <p className="reminder-card__description">{reminder.description}</p>

                {/* Meta: pre-reminder + channels */}
                <div className="reminder-card__meta">
                    {reminder.preReminderEnabled && (
                        <span className="reminder-card__pre-badge">
                            ⏱ {preReminderLabel(reminder.preReminderValue, reminder.preReminderUnit)}
                        </span>
                    )}
                    {(reminder.channels || []).map(ch => (
                        <span key={ch} className="reminder-card__channel-badge">
                            {CHANNEL_META[ch]?.label || ch}
                        </span>
                    ))}
                </div>
            </div>

            {/* Footer — owner actions (unsent only) */}
            {isOwner && !isSent && (
                <div className="reminder-card__footer">
                    <button
                        className="note-card__action-btn note-card__action-btn--edit"
                        onClick={() => onEdit(reminder)}
                        title="Edit reminder"
                    >
                        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </button>
                    <button
                        className="note-card__action-btn note-card__action-btn--delete"
                        onClick={() => onDelete(reminder._id)}
                        title="Delete reminder"
                    >
                        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
}

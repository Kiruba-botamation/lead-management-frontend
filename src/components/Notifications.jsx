import React, { Fragment, useState, useEffect, useRef, useSyncExternalStore } from 'react';
import ReactDOM from 'react-dom';
import { Transition } from '@headlessui/react';

// ── Per-type theme (sourced from design tokens in styles/tokens.css) ───────────

const THEME = {
    success:  { accent: 'var(--color-success-600)',   tint: 'var(--color-success-50)',    label: 'Success' },
    warning:  { accent: 'var(--color-warning-500)',   tint: 'var(--color-warning-50)',    label: 'Warning' },
    error:    { accent: 'var(--color-danger-600)',    tint: 'var(--color-danger-50)',     label: 'Error' },
    reminder: { accent: 'var(--color-secondary-600)', tint: 'var(--color-secondary-100)', label: 'Notification' },
};

// Auto-close durations (ms). Only success auto-closes; the rest stay open.
const AUTO_CLOSE_MS = {
    success: 2500,
};

// ── Icon helpers ──────────────────────────────────────────────────────────────

function getIcon(type) {
    const color = (THEME[type] || {}).accent || 'var(--color-gray-400)';
    switch (type) {
        case 'success':
            return (
                <svg aria-hidden="true" className="size-5" style={{ color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            );
        case 'error':
            return (
                <svg aria-hidden="true" className="size-5" style={{ color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            );
        case 'warning':
            return (
                <svg aria-hidden="true" className="size-5" style={{ color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            );
        case 'reminder':
            return (
                <svg aria-hidden="true" className="size-6" style={{ color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
            );
        default:
            return null;
    }
}

// ── Notify component ──────────────────────────────────────────────────────────

/**
 * @param {object|string} message  - String for success/error/warning.
 *                                   Object { leadName, leadPhone, description, title, isPre }
 *                                   for reminder type.
 * @param {string}  type           - 'success' | 'error' | 'warning' | 'reminder'
 * @param {any}     key            - React key — change to reset timer
 * @param {function} onClose       - Called when dismissed
 * @param {function} [onClick]     - Called when the toast body is clicked (reminder type)
 */
export default function Notify({ id, message, type, onClose, onClick }) {
    const [show,     setShow]     = useState(true);
    const [progress, setProgress] = useState(100);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    const duration = AUTO_CLOSE_MS[type];  // undefined → no auto-close
    const theme    = THEME[type] || { accent: 'var(--color-gray-400)', tint: 'var(--color-gray-50)', label: '' };

    useEffect(() => {
        setShow(true);
        setProgress(100);

        if (!duration) return undefined;

        const interval  = 30;
        const steps     = duration / interval;
        const decrement = 100 / steps;

        const progressTimer = setInterval(() => {
            setProgress(prev => {
                const next = prev - decrement;
                return next > 0 ? next : 0;
            });
        }, interval);

        const closeTimer = setTimeout(() => {
            setShow(false);
            setTimeout(() => onCloseRef.current(), 200);
        }, duration);

        return () => { clearInterval(progressTimer); clearTimeout(closeTimer); };
    }, [id, type, duration]);

    const handleClose = (e) => {
        e.stopPropagation();
        setShow(false);
        onCloseRef.current();
    };

    const handleBodyClick = () => {
        if (onClick) {
            onClick();
            setShow(false);
            onCloseRef.current();
        }
    };

    // ── Reminder / Notification body (rich) ─────────────────────────────────────
    const reminderBody = type === 'reminder' ? (
        <div className="ml-3 w-0 flex-1">
            <div className="flex justify-between items-center mb-1">
                <span style={{
                    fontSize:        'var(--text-2xs)',
                    fontWeight:      'var(--font-bold)',
                    letterSpacing:   'var(--tracking-wider)',
                    textTransform:   'uppercase',
                    color:           'var(--color-secondary-600)',
                    background:      'var(--color-secondary-100)',
                    borderRadius:    'var(--radius-sm)',
                    padding:         '1px 6px',
                }}>
                    {message.isPre ? 'Pre-Reminder' : 'Reminder'}
                </span>
                <button type="button" onClick={handleClose}
                    className="inline-flex rounded-md text-gray-400 hover:text-gray-500 focus:outline-none">
                    <svg className="size-4" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            {message.leadName && (
                <p className="text-sm font-semibold text-gray-900 mb-0.5">{message.leadName}</p>
            )}
            {message.leadPhone && (
                <p className="text-xs text-gray-500 mb-0.5">{message.leadPhone}</p>
            )}
            <p className="text-sm text-gray-700 line-clamp-2">{message.description}</p>
            {onClick && (
                <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-secondary-600)', marginTop: '4px', fontWeight: 'var(--font-medium)' }}>
                    Click to open lead
                </p>
            )}
        </div>
    ) : null;

    // ── Standard body — single line: Type + message ─────────────────────────────
    const standardText = typeof message === 'object' ? message.description : message;
    const standardBody = type !== 'reminder' ? (
        <div className="ml-3 w-0 flex-1 flex items-start justify-between gap-2">
            <p className="text-sm text-gray-800 line-clamp-2">
                <span className="font-bold" style={{ color: theme.accent }}>{theme.label}</span>
                <span className="text-gray-400">{' — '}</span>
                <span className="text-gray-800">{standardText}</span>
            </p>
            <button type="button" onClick={handleClose}
                className="shrink-0 inline-flex rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1">
                <svg className="size-5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    ) : null;

    return (
        <div
            className="pointer-events-none shrink-0"
            style={{ width: 'min(50vw, 640px)', maxWidth: '92vw' }}
        >
            <Transition
                as={Fragment}
                show={show}
                enter="transform transition duration-300 ease-[cubic-bezier(0.34,1.2,0.64,1)]"
                enterFrom="-translate-y-[150%] opacity-0"
                enterTo="translate-y-0 opacity-100"
                leave="transform transition duration-200 ease-in"
                leaveFrom="translate-y-0 opacity-100"
                leaveTo="-translate-y-[150%] opacity-0"
            >
                <div
                    aria-live="assertive"
                    className={`pointer-events-auto w-full overflow-hidden ${onClick ? 'cursor-pointer' : ''}`}
                    style={{
                        background:    'var(--color-surface)',
                        borderRadius:  'var(--radius-lg)',
                        boxShadow:     'var(--shadow-lg)',
                        borderLeft:    `4px solid ${theme.accent}`,
                    }}
                    onClick={handleBodyClick}
                >
                    <div className="px-4 py-2.5" style={{ background: theme.tint }}>
                        <div className="flex items-start">
                            <div className="shrink-0">{getIcon(type)}</div>
                            {reminderBody}
                            {standardBody}
                        </div>
                    </div>

                    {/* Progress bar — only for auto-closing (success) */}
                    {duration && (
                        <div className="h-1" style={{ background: 'var(--color-gray-200)' }}>
                            <div
                                className="h-full transition-all duration-75 ease-linear"
                                style={{ width: `${progress}%`, background: theme.accent }}
                            />
                        </div>
                    )}
                </div>
            </Transition>
        </div>
    );
}

// ── Shared notification store ─────────────────────────────────────────────────

const MAX_NOTIFICATION_HISTORY = 20;
let nextNotificationId = 1;
let notifications = [];
const listeners = new Set();

const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
const getSnapshot = () => notifications;

const addNotification = (message, type, onClick = null) => {
    notifications = [
        ...notifications,
        { id: nextNotificationId++, message, type, onClick },
    ].slice(-MAX_NOTIFICATION_HISTORY);
    emit();
};

const clearNotification = (id) => {
    notifications = id == null ? [] : notifications.filter(item => item.id !== id);
    emit();
};

const notificationActions = Object.freeze({
    showSuccess: (message) => addNotification({ title: 'Success', description: message }, 'success'),
    showError: (message) => addNotification({ title: 'Error', description: message }, 'error'),
    showWarning: (message) => addNotification({ title: 'Warning', description: message }, 'warning'),
    showReminder: (payload, onClickCb) => addNotification(payload, 'reminder', onClickCb || null),
    clearNotification: () => clearNotification(),
});

/** The one app-level owner for the notification portal. */
export function NotificationViewport() {
    const currentNotifications = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    if (typeof document === 'undefined') return null;

    return ReactDOM.createPortal(
        <div
            className="pointer-events-none fixed top-0 left-0 w-full flex flex-col items-center gap-2 px-4"
            style={{ paddingTop: 'var(--space-2)', zIndex: 'var(--z-toast)' }}
        >
            {currentNotifications.map(notification => (
                <Notify
                    key={notification.id}
                    id={notification.id}
                    message={notification.message}
                    type={notification.type}
                    onClick={notification.onClick}
                    onClose={() => clearNotification(notification.id)}
                />
            ))}
        </div>,
        document.body
    );
}

/**
 * Stable compatibility component for existing callers. Rendering is centralized
 * in NotificationViewport, so legacy per-hook owners intentionally render nothing.
 */
export function NotificationComponent() { return null; }

const notificationsApi = Object.freeze({ ...notificationActions, NotificationComponent });

export const useNotifications = () => notificationsApi;

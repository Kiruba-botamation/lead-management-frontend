import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Transition } from '@headlessui/react';

// ── Color maps ────────────────────────────────────────────────────────────────

const BORDER_COLOR = {
    success:  'border-green-500',
    error:    'border-red-500',
    warning:  'border-yellow-500',
    reminder: 'border-violet-500',
};

const PROGRESS_COLOR = {
    success:  'bg-green-500',
    error:    'bg-red-500',
    reminder: 'bg-violet-500',
};

// Auto-close durations (ms). warning/error stay open (no auto-close).
const AUTO_CLOSE_MS = {
    success:  2500,
    reminder: 5000,
};

// ── Icon helpers ──────────────────────────────────────────────────────────────

function getIcon(type) {
    switch (type) {
        case 'success':
            return (
                <svg aria-hidden="true" className="size-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            );
        case 'error':
            return (
                <svg aria-hidden="true" className="size-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            );
        case 'warning':
            return (
                <svg aria-hidden="true" className="size-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            );
        case 'reminder':
            return (
                <svg aria-hidden="true" className="size-6 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
export default function Notify({ message, type, key, onClose, onClick }) {
    const [show,     setShow]     = useState(true);
    const [progress, setProgress] = useState(100);

    const duration = AUTO_CLOSE_MS[type];  // undefined → no auto-close

    useEffect(() => {
        setShow(true);
        setProgress(100);

        const interval  = 30;
        const steps     = (duration || 2500) / interval;
        const decrement = 100 / steps;

        const progressTimer = setInterval(() => {
            setProgress(prev => {
                const next = prev - decrement;
                return next > 0 ? next : 0;
            });
        }, interval);

        if (duration) {
            const closeTimer = setTimeout(() => {
                setShow(false);
                setTimeout(onClose, 300);
            }, duration);
            return () => { clearInterval(progressTimer); clearTimeout(closeTimer); };
        }

        return () => clearInterval(progressTimer);
    }, [key, type, onClose, message]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleClose = (e) => {
        e.stopPropagation();
        setShow(false);
        onClose();
    };

    const handleBodyClick = () => {
        if (onClick) {
            onClick();
            setShow(false);
            onClose();
        }
    };

    const borderClass = BORDER_COLOR[type] || 'border-gray-400';

    // ── Reminder body ─────────────────────────────────────────────────────────
    const reminderBody = type === 'reminder' ? (
        <div className="ml-3 w-0 flex-1">
            <div className="flex justify-between items-center mb-1">
                <span style={{
                    fontSize:        '10px',
                    fontWeight:      700,
                    letterSpacing:   '0.05em',
                    textTransform:   'uppercase',
                    color:           '#7c3aed',
                    background:      '#ede9fe',
                    borderRadius:    '4px',
                    padding:         '1px 6px',
                }}>
                    {message.isPre ? 'Pre-Reminder' : 'Reminder'}
                </span>
                <button type="button" onClick={handleClose}
                    className="inline-flex rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none">
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
                <p style={{ fontSize: '10px', color: '#7c3aed', marginTop: '4px', fontWeight: 500 }}>
                    Click to open lead
                </p>
            )}
        </div>
    ) : null;

    // ── Standard body ─────────────────────────────────────────────────────────
    const standardBody = type !== 'reminder' ? (
        <div className="ml-3 w-0 flex-1">
            <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-bold text-gray-900">
                    {typeof message === 'object' ? message.title : (
                        type === 'success' ? 'Success' : type === 'error' ? 'Error' : 'Warning'
                    )}
                </p>
                <button type="button" onClick={handleClose}
                    className="inline-flex rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2">
                    <svg className="size-5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
            <div className="text-left">
                <p className="text-sm text-gray-800">
                    {typeof message === 'object' ? message.description : message}
                </p>
            </div>
        </div>
    ) : null;

    return (
        <div aria-live="assertive" className="pointer-events-none flex w-full flex-col items-end space-y-4">
            <Transition
                show={show}
                enter="transform transition duration-300"
                enterFrom="translate-y-full opacity-0"
                enterTo="translate-y-0 opacity-100"
                leave="transform transition duration-200"
                leaveFrom="translate-y-0 opacity-100"
                leaveTo="translate-y-full opacity-0"
            >
                <div
                    className={`pointer-events-auto w-96 max-w-full overflow-hidden rounded-lg bg-white shadow-xl ring-1 ring-black/5 border-l-4 ${borderClass} ${onClick ? 'cursor-pointer' : ''}`}
                    onClick={handleBodyClick}
                >
                    <div className="p-4">
                        <div className="flex items-start">
                            <div className="shrink-0">{getIcon(type)}</div>
                            {reminderBody}
                            {standardBody}
                        </div>
                    </div>

                    {/* Progress bar — shown for types that auto-close */}
                    {PROGRESS_COLOR[type] && (
                        <div className="h-1 bg-gray-200">
                            <div
                                className={`h-full transition-all duration-75 ease-linear ${PROGRESS_COLOR[type]}`}
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    )}
                </div>
            </Transition>
        </div>
    );
}

// ── useNotifications hook ─────────────────────────────────────────────────────

export const useNotifications = () => {
    const [notification,    setNotification]    = useState(null);
    const [notificationKey, setNotificationKey] = useState(0);

    const bump = () => setNotificationKey(k => k + 1);

    const showSuccess = useCallback((message) => {
        setNotification({ message: { title: 'Success', description: message }, type: 'success' });
        bump();
    }, []);

    const showError = useCallback((message) => {
        setNotification({ message: { title: 'Error', description: message }, type: 'error' });
        bump();
    }, []);

    const showWarning = useCallback((message) => {
        setNotification({ message: { title: 'Warning', description: message }, type: 'warning' });
        bump();
    }, []);

    /**
     * Show a violet reminder toast.
     * @param {{ leadId, leadName, leadPhone, description, isPre }} payload
     * @param {function} [onClickCb] — called when user clicks the toast body
     */
    const showReminder = useCallback((payload, onClickCb) => {
        setNotification({ message: payload, type: 'reminder', onClick: onClickCb || null });
        bump();
    }, []);

    const clearNotification = useCallback(() => setNotification(null), []);

    const NotificationComponent = () => ReactDOM.createPortal(
        <div className="pointer-events-none fixed top-0 right-0 flex items-start px-4 py-6 sm:p-6 z-[9999]">
            {notification && (
                <Notify
                    key={notificationKey}
                    message={notification.message}
                    type={notification.type}
                    onClick={notification.onClick}
                    onClose={clearNotification}
                />
            )}
        </div>,
        document.body
    );

    return { showSuccess, showError, showWarning, showReminder, clearNotification, NotificationComponent };
};

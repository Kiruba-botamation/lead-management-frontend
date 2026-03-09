import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { Transition } from '@headlessui/react';

export default function Notify({ message, type, key, onClose }) {
    const [show, setShow] = useState(true);
    const [progress, setProgress] = useState(100);

    useEffect(() => {
        setShow(true);
        setProgress(100);

        const duration = 2500; // 2.5 seconds
        const interval = 30; // Update every 30ms for smooth animation
        const steps = duration / interval;
        const decrement = 100 / steps;

        // Progress bar countdown for both success and error
        const progressTimer = setInterval(() => {
            setProgress((prev) => {
                const newProgress = prev - decrement;
                return newProgress > 0 ? newProgress : 0;
            });
        }, interval);

        // Only auto-close for success notifications
        if (type === 'success') {
            const closeTimer = setTimeout(() => {
                setShow(false);
                setTimeout(() => {
                    onClose(); // Call onClose callback after animation completes
                }, 300);
            }, duration);

            return () => {
                clearInterval(progressTimer);
                clearTimeout(closeTimer);
            };
        }

        // For error and warning: just clear the progress timer, don't auto-close
        return () => {
            clearInterval(progressTimer);
        };
    }, [key, type, onClose, message]);

    const getIcon = () => {
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
            default:
                return null;
        }
    };

    const borderColorClass = type === 'success'
        ? 'border-green-500'
        : type === 'warning'
            ? 'border-yellow-500'
            : 'border-red-500';

    const handleClose = () => {
        setShow(false);
        onClose(); // Call onClose callback when the close button is clicked
    };

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
                    className={`pointer-events-auto w-96 max-w-full overflow-hidden rounded-lg bg-white shadow-xl ring-1 ring-black/5 border-l-4 ${borderColorClass}`}
                    onClick={handleClose}
                >
                    <div className="p-4">
                        <div className="flex items-start">
                            <div className="shrink-0">
                                {getIcon()}
                            </div>

                            <div className="ml-3 w-0 flex-1">
                                <div className="flex justify-between items-center mb-2">
                                    <p className="text-sm font-bold text-gray-900">{message.title}</p>
                                    <button
                                        type="button"
                                        onClick={handleClose}
                                        className="inline-flex rounded-md bg-white text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
                                    >
                                        {/* X mark icon */}
                                        <svg className="size-5" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                                <div className="text-left">
                                    <p className="text-sm text-gray-800">{message.description}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Progress bar for success and error notifications */}
                    {(type === 'success' || type === 'error') && (
                        <div className="h-1 bg-gray-200">
                            <div
                                className={`h-full transition-all duration-75 ease-linear ${type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}
                                style={{ width: `${progress}%` }}
                            />
                        </div>
                    )}
                </div>
            </Transition>
        </div>
    );
}

export const useNotifications = () => {
    const [notification, setNotification] = useState(null);
    const [notificationKey, setNotificationKey] = useState(0);

    const showSuccess = useCallback((message) => {
        setNotification({
            message: {
                title: 'Success',
                description: message,
            },
            type: 'success',
        });
        setNotificationKey((prevKey) => prevKey + 1);
    }, []);

    const showError = useCallback((message) => {
        setNotification({
            message: {
                title: 'Error',
                description: message,
            },
            type: 'error',
        });
        setNotificationKey((prevKey) => prevKey + 1);
    }, []);

    const showWarning = useCallback((message) => {
        setNotification({
            message: {
                title: 'Warning',
                description: message,
            },
            type: 'warning',
        });
        setNotificationKey((prevKey) => prevKey + 1);
    }, []);

    const clearNotification = useCallback(() => {
        setNotification(null);
    }, []);

    const NotificationComponent = () => ReactDOM.createPortal(
        <div className="pointer-events-none fixed top-0 right-0 flex items-start px-4 py-6 sm:p-6 z-[9999]">
            {notification && (
                <Notify key={notificationKey} message={notification.message} type={notification.type} onClose={clearNotification} />
            )}
        </div>,
        document.body
    );

    return { showSuccess, showError, showWarning, clearNotification, NotificationComponent };
};

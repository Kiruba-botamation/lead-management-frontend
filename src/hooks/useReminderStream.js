/**
 * useReminderStream
 *
 * Manages two real-time notification channels for reminders:
 *  1. SSE (Server-Sent Events) — real-time in-app toasts when the tab is open
 *  2. Browser Push via Service Worker — notifications even when the tab is closed
 *
 * Usage: call once at the top level of the app (e.g. in LeadsGrid).
 * Returns: { firedCount, setFiredCount }
 *
 * NOTE: Browser push permission is no longer requested on mount.
 * The user is prompted inline in AddReminderForm when they select the Push channel.
 * On mount we only silently subscribe if the user has already granted permission.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pushApi }      from '../api/pushApi';
import { remindersApi } from '../api/remindersApi';

/**
 * @param {function} showReminder  - from useNotifications() — shows violet reminder toast
 * @param {function} onNewFired    - called when a new reminder fires (increments bell badge)
 */
export const useReminderStream = ({ showReminder, onNewFired }) => {
    const navigate        = useNavigate();
    const eventSourceRef  = useRef(null);
    const reconnectTimer  = useRef(null);
    const [firedCount, setFiredCount] = useState(0);

    // ── Fetch initial unread count (bell badge on mount) ─────────────────────
    const fetchFiredCount = useCallback(async () => {
        try {
            const res = await remindersApi.getFired();
            setFiredCount(res.data?.count ?? 0);
        } catch {
            // Non-fatal — badge just won't show a count
        }
    }, []);

    // ── SSE connection ────────────────────────────────────────────────────────
    const connectSSE = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        const es = new EventSource('/api/ui/push/stream', { withCredentials: true });

        es.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);

                // Ignore heartbeat / ping events
                if (payload.type === 'connected' || payload.type === 'ping') return;

                // Show violet reminder toast with lead context
                showReminder?.(
                    {
                        leadId:      payload.leadId,
                        leadName:    payload.leadName    || '',
                        leadPhone:   payload.leadPhone   || '',
                        description: payload.description || '',
                        isPre:       payload.type === 'pre',
                    },
                    () => navigate(`/leads?openLead=${payload.leadId}&tab=reminders`)
                );

                // Increment bell badge
                setFiredCount(prev => prev + 1);
                onNewFired?.();
            } catch {
                // Malformed event — ignore
            }
        };

        es.onerror = () => {
            es.close();
            eventSourceRef.current = null;
            // Reconnect after 5 seconds
            reconnectTimer.current = setTimeout(connectSSE, 5000);
        };

        eventSourceRef.current = es;
    }, [showReminder, onNewFired, navigate]);

    // ── Browser push — silent subscribe if permission already granted ─────────
    const setupBrowserPush = useCallback(async () => {
        // Only subscribe silently when permission is already granted.
        // Requesting permission is handled in AddReminderForm (inline banner).
        if (
            !('serviceWorker' in navigator) ||
            !('PushManager'   in window)    ||
            Notification.permission !== 'granted'
        ) return;

        try {
            await pushApi.ensureSubscribed();
        } catch {
            // Non-fatal — in-app SSE still works
        }
    }, []);

    useEffect(() => {
        fetchFiredCount();
        connectSSE();
        setupBrowserPush();

        return () => {
            eventSourceRef.current?.close();
            clearTimeout(reconnectTimer.current);
        };
    }, [fetchFiredCount, connectSSE, setupBrowserPush]);

    return { firedCount, setFiredCount };
};

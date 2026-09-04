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
import { playNotificationSound } from '../utils/notificationSound';

/**
 * @param {function} showReminder  - from useNotifications() — shows violet reminder toast
 * @param {function} onNewFired    - called when a new reminder fires (increments bell badge)
 * @param {string}   acctId        - current account ID (required for middleware identity resolution)
 * @param {string}   userId        - the logged-in user's lead-app userId (notification routing key)
 */
export const useReminderStream = ({ showReminder, onNewFired, acctId, userId }) => {
    const navigate        = useNavigate();
    const eventSourceRef  = useRef(null);
    const reconnectTimer  = useRef(null);
    const [firedCount, setFiredCount] = useState(0);

    // ── Fetch initial unread count (bell badge on mount) ─────────────────────
    const fetchFiredCount = useCallback(async () => {
        if (!acctId || !userId) return;
        try {
            const res = await remindersApi.getFired(acctId, 1, 1, true);
            setFiredCount(res.data?.count ?? 0);
        } catch {
            // Non-fatal — badge just won't show a count
        }
    }, [acctId, userId]);

    // ── SSE connection ────────────────────────────────────────────────────────
    const connectSSE = useCallback(() => {
        // Both acctId and userId are required — defer until they are resolved
        if (!acctId || !userId) return;

        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        const params = new URLSearchParams({ acctId });
        const es = new EventSource(`/api/ui/push/stream?${params}`, { withCredentials: true });

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

                // Pre-reminders show a toast but do not enter the main reminder inbox.
                if (payload.type === 'main') setFiredCount(prev => prev + 1);
                // Mild audio cue (respects the user's mute / mood preference)
                playNotificationSound();
                if (payload.type === 'main') onNewFired?.();
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
    }, [showReminder, onNewFired, navigate, acctId, userId]);

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
            eventSourceRef.current = null;
            clearTimeout(reconnectTimer.current);
        };
    }, [fetchFiredCount, connectSSE, setupBrowserPush]);

    return { firedCount, setFiredCount };
};

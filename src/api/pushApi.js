import api from './axiosConfig';

/** Convert a VAPID base64url key to the Uint8Array the browser PushManager expects */
const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
};

export const pushApi = {
    /** Get the VAPID public key from the server */
    getVapidKey: () => api.get('/api/ui/push/vapid-public-key'),

    /** Save a browser push subscription */
    subscribe:   (subscription) => api.post('/api/ui/push/subscribe', subscription),

    /** Remove a push subscription */
    unsubscribe: (endpoint)     => api.delete('/api/ui/push/unsubscribe', { data: { endpoint } }),

    /**
     * Ensure the browser is subscribed to push notifications.
     *
     * Returns:
     *   { ok: true }                            — already subscribed / just subscribed
     *   { ok: false, reason: 'unsupported' }    — browser doesn't support push
     *   { ok: false, reason: 'denied' }         — user has blocked notifications
     *   { ok: false, reason: 'prompt' }         — permission not yet requested
     *   { ok: false, reason: 'error', error }   — subscription attempt failed
     */
    async ensureSubscribed() {
        if (
            !('serviceWorker' in navigator) ||
            !('PushManager'   in window)    ||
            !('Notification'  in window)
        ) {
            return { ok: false, reason: 'unsupported' };
        }

        const perm = Notification.permission;
        if (perm === 'denied')  return { ok: false, reason: 'denied' };
        if (perm === 'default') return { ok: false, reason: 'prompt' };

        // Permission is 'granted' — register SW and ensure a live subscription exists
        try {
            const reg = await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;

            let sub = await reg.pushManager.getSubscription();
            if (!sub) {
                const vapidRes = await pushApi.getVapidKey();
                const vapidKey = vapidRes.data?.key;
                if (!vapidKey) return { ok: false, reason: 'error', error: 'No VAPID key from server' };

                sub = await reg.pushManager.subscribe({
                    userVisibleOnly:      true,
                    applicationServerKey: urlBase64ToUint8Array(vapidKey),
                });

                const s = sub.toJSON();
                await pushApi.subscribe({
                    endpoint: s.endpoint,
                    keys:     { p256dh: s.keys.p256dh, auth: s.keys.auth },
                    adminId:  localStorage.getItem('adminId') || undefined,
                });
            }

            return { ok: true };
        } catch (err) {
            return { ok: false, reason: 'error', error: err.message };
        }
    },
};

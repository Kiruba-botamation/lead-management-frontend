/**
 * Service Worker — Browser Push Notifications
 *
 * Handles incoming Web Push notifications when the CRM tab is closed
 * or the browser is in the background.
 *
 * Registered by useReminderStream.js on mount.
 */

self.addEventListener('push', (event) => {
    if (!event.data) return;

    let data;
    try {
        data = event.data.json();
    } catch {
        data = { title: 'CRM Reminder', body: event.data.text() };
    }

    event.waitUntil(
        self.registration.showNotification(data.title || 'CRM Reminder', {
            body:  data.body  || '',
            icon:  data.icon  || '/favicon.ico',
            badge: '/favicon.ico',
            tag:   data.data?.reminderId || 'crm-reminder',
            data:  data.data  || {},
            requireInteraction: true // stays visible until dismissed
        })
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const targetUrl = event.notification.data?.url || '/leads';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // Navigate an existing app tab to the specific deep-link URL
            for (const client of windowClients) {
                if (client.url.startsWith(self.location.origin)) {
                    return client.navigate(targetUrl).then(c => c && c.focus());
                }
            }
            // No existing tab — open a new one at the target URL
            if (clients.openWindow) return clients.openWindow(targetUrl);
        })
    );
});

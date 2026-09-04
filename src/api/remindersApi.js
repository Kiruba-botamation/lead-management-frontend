import api from './axiosConfig';

const BASE = (leadId) => `/api/ui/leads/${leadId}/reminders`;

export const remindersApi = {
    /** Fetch reminders for a lead. */
    getAll:   (leadId, acctId, { cursor, limit = 25, signal } = {}) => api.get(BASE(leadId), {
        params: { acctId, limit, ...(cursor != null && { cursor }) },
        signal,
    }),

    /** Create and schedule a new reminder */
    create:   (leadId, data, acctId)             => api.post(BASE(leadId), data,                  { params: { acctId } }),

    /** Update and reschedule a reminder (data must include adminId) */
    update:   (leadId, reminderId, data, acctId) => api.put(`${BASE(leadId)}/${reminderId}`, data, { params: { acctId } }),

    /** Delete a reminder and cancel its jobs */
    remove:   (leadId, reminderId, acctId, adminId) => api.delete(`${BASE(leadId)}/${reminderId}`, { data: { adminId }, params: { acctId } }),

    /** Get fired reminders for the bell inbox (paginated) */
    getFired:     (acctId, page = 1, limit = 10, includeCounts = false, config = {}) => api.get('/api/ui/reminders/fired', {
        params: { acctId, page, limit, includeCounts },
        ...config,
    }),

    /** Calendar view — all reminders for the current user within [start, end) (ISO strings) */
    calendar:     (acctId, start, end)             => api.get('/api/ui/reminders/calendar', { params: { acctId, start, end } }),

    /** Mark fired reminders as read (pass ids array or omit to mark all) */
    markRead:     (reminderIds, acctId)            => api.post('/api/ui/reminders/mark-read', { reminderIds }, { params: { acctId } }),

    /** Permanently delete a single fired reminder from the bell inbox */
    dismissFired: (reminderId, acctId)             => api.delete(`/api/ui/reminders/fired/${reminderId}`, { params: { acctId } }),

    /** Get pending reminder counts for multiple leads (for grid badge highlights) */
    batchCounts:  (leadIds, acctId, config = {}) => api.post('/api/ui/activity/reminders/batch-counts', { leadIds }, { params: { acctId }, ...config }),
};

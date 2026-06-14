import api from './axiosConfig';

const BASE = (leadId) => `/api/ui/leads/${leadId}/reminders`;

export const remindersApi = {
    /** Fetch all reminders for a lead (creator-only) */
    getAll:   (leadId, acctId)                   => api.get(BASE(leadId),                         { params: { acctId } }),

    /** Create and schedule a new reminder */
    create:   (leadId, data, acctId)             => api.post(BASE(leadId), data,                  { params: { acctId } }),

    /** Update and reschedule a reminder (data must include adminId) */
    update:   (leadId, reminderId, data, acctId) => api.put(`${BASE(leadId)}/${reminderId}`, data, { params: { acctId } }),

    /** Delete a reminder and cancel its jobs */
    remove:   (leadId, reminderId, acctId, adminId) => api.delete(`${BASE(leadId)}/${reminderId}`, { data: { adminId }, params: { acctId } }),

    /** Get fired reminders for the bell inbox (paginated) */
    getFired:     (page = 1, limit = 10, adminId) => api.get('/api/ui/reminders/fired', { params: { page, limit, adminId } }),

    /** Mark fired reminders as read (pass ids array or omit to mark all) */
    markRead:     (reminderIds, adminId)           => api.post('/api/ui/reminders/mark-read', { reminderIds, adminId }),

    /** Permanently delete a single fired reminder from the bell inbox */
    dismissFired: (reminderId, adminId)            => api.delete(`/api/ui/reminders/fired/${reminderId}`, { params: { adminId } }),

    /** Get pending reminder counts for multiple leads (for grid badge highlights) */
    batchCounts:  (leadIds, acctId)              => api.post('/api/ui/activity/reminders/batch-counts', { leadIds }, { params: { acctId } }),
};

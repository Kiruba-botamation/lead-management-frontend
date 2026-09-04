import api from './axiosConfig';

const BASE = (leadId) => `/api/ui/leads/${leadId}/notes`;

export const notesApi = {
    /** Fetch notes for a lead, latest-first. Supports cursor or page pagination. */
    getAll:  (leadId, acctId, { cursor, page, limit = 25, signal } = {}) => api.get(BASE(leadId), {
        params: { acctId, limit, ...(cursor != null && { cursor }), ...(page != null && { page }) },
        signal,
    }),

    /** Create a new note */
    create:  (leadId, description, acctId, adminId) => api.post(BASE(leadId), { description, adminId },     { params: { acctId } }),

    /** Update a note (creator only) */
    update:  (leadId, noteId, description, acctId, adminId) => api.put(`${BASE(leadId)}/${noteId}`, { description, adminId }, { params: { acctId } }),

    /** Delete a note (creator only) */
    remove:  (leadId, noteId, acctId, adminId)              => api.delete(`${BASE(leadId)}/${noteId}`, { data: { adminId }, params: { acctId } }),

    /** Get note counts for multiple leads (for grid badge highlights) */
    batchCounts: (leadIds, acctId, config = {})      => api.post('/api/ui/activity/notes/batch-counts', { leadIds }, { params: { acctId }, ...config }),
};

/** Combined notes + reminders batch counts — 1 call instead of 2 */
export const activityApi = {
    batchCounts: (leadIds, acctId, config = {}) => api.post('/api/ui/activity/batch-counts', { leadIds }, { params: { acctId }, ...config }),
};

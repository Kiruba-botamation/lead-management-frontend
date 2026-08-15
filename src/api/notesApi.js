import api from './axiosConfig';

const BASE = (leadId) => `/api/ui/leads/${leadId}/notes`;

export const notesApi = {
    /** Fetch all notes for a lead, latest-first with admin info */
    getAll:  (leadId, acctId)                      => api.get(BASE(leadId),                                { params: { acctId } }),

    /** Create a new note */
    create:  (leadId, description, acctId, adminId) => api.post(BASE(leadId), { description, adminId },     { params: { acctId } }),

    /** Update a note (creator only) */
    update:  (leadId, noteId, description, acctId, adminId) => api.put(`${BASE(leadId)}/${noteId}`, { description, adminId }, { params: { acctId } }),

    /** Delete a note (creator only) */
    remove:  (leadId, noteId, acctId, adminId)              => api.delete(`${BASE(leadId)}/${noteId}`, { data: { adminId }, params: { acctId } }),

    /** Get note counts for multiple leads (for grid badge highlights) */
    batchCounts: (leadIds, acctId)                  => api.post('/api/ui/activity/notes/batch-counts', { leadIds }, { params: { acctId } }),
};

/** Combined notes + reminders batch counts — 1 call instead of 2 */
export const activityApi = {
    batchCounts: (leadIds, acctId) => api.post('/api/ui/activity/batch-counts', { leadIds }, { params: { acctId } }),
};

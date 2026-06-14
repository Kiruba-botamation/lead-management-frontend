import api from './axiosConfig';

const BASE = (leadId) => `/api/ui/leads/${leadId}/notes`;

export const notesApi = {
    /** Fetch all notes for a lead, latest-first with admin info */
    getAll:  (leadId, acctId)                      => api.get(BASE(leadId),                                { params: { acctId } }),

    /** Create a new note */
    create:  (leadId, description, acctId)          => api.post(BASE(leadId), { description },              { params: { acctId } }),

    /** Update a note (creator only) */
    update:  (leadId, noteId, description, acctId)  => api.put(`${BASE(leadId)}/${noteId}`, { description }, { params: { acctId } }),

    /** Delete a note (creator only) */
    remove:  (leadId, noteId, acctId)               => api.delete(`${BASE(leadId)}/${noteId}`,              { params: { acctId } }),

    /** Get note counts for multiple leads (for grid badge highlights) */
    batchCounts: (leadIds, acctId)                  => api.post('/api/ui/activity/notes/batch-counts', { leadIds }, { params: { acctId } }),
};

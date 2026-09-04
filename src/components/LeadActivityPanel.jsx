/**
 * LeadActivityPanel
 *
 * Right-side tabbed panel showing Notes and Reminders for a single lead.
 * Occupies the same 33% slot as LeadFormPanel — they are mutually exclusive.
 *
 * Tabs: Notes | Reminders
 * Each tab badge shows the count of items.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { notesApi }     from '../api/notesApi';
import { remindersApi } from '../api/remindersApi';
import NoteCard         from './NoteCard';
import AddNoteForm      from './AddNoteForm';
import ReminderCard     from './ReminderCard';
import AddReminderForm  from './AddReminderForm';

const EMPTY_PAGE = { nextCursor: null, hasNext: false, total: null };

const sortReminders = (rems) => {
    const now = new Date();
    const upcoming = rems
        .filter(r => !r.mainSent && new Date(r.scheduledAt) > now)
        .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    const past = rems
        .filter(r => r.mainSent || new Date(r.scheduledAt) <= now)
        .sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
    return [...upcoming, ...past];
};

const appendUnique = (current, incoming) => {
    const seen = new Set(current.map(item => item._id));
    return [...current, ...incoming.filter(item => !seen.has(item._id))];
};

// ── SVG icons ─────────────────────────────────────────────────────────────────

const CloseIcon = () => (
    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const PlusIcon = () => (
    <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
    </svg>
);

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ tab }) {
    return (
        <div className="activity-empty">
            {tab === 'notes' ? (
                <>
                    <svg className="activity-empty__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="activity-empty__text">No notes yet</p>
                    <p className="activity-empty__subtext">Click "Add Note" to write one</p>
                </>
            ) : (
                <>
                    <svg className="activity-empty__icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <p className="activity-empty__text">No reminders yet</p>
                    <p className="activity-empty__subtext">Set a reminder using the button above</p>
                </>
            )}
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * @param {object}   lead             - The lead whose activity is being shown
 * @param {string}   leadName         - Display name for the panel header (computed by parent from columnDefs)
 * @param {string}   initialTab       - 'notes' | 'reminders' (default: 'notes')
 * @param {string}   currentAdminId   - The logged-in admin's userId
 * @param {boolean}  adminHasPhone    - Whether the admin has a phone (enables WhatsApp channel)
 * @param {function} onClose          - Called when the × button is clicked
 * @param {function} [onError(msg)]   - Bubble errors up (e.g. for toast)
 */
export default function LeadActivityPanel({
    lead,
    leadName,
    leadPhone     = '',
    initialTab    = 'notes',
    currentAdminId,
    isSuperAdmin  = false, // superadmins may edit/delete any note/reminder on the lead
    currentUser,          // { name, profileImageUrl } from AuthContext.userDetails
    adminHasPhone = false,
    onClose,
    onError,
}) {
    const [activeTab,    setActiveTab]    = useState(initialTab);

    useEffect(() => { setActiveTab(initialTab); }, [initialTab]);
    const [notes,        setNotes]        = useState([]);
    const [reminders,    setReminders]    = useState([]);
    const [loadingNotes, setLoadingNotes] = useState(false);
    const [loadingRems,  setLoadingRems]  = useState(false);
    const [notesPage,    setNotesPage]    = useState(EMPTY_PAGE);
    const [remindersPage, setRemindersPage] = useState(EMPTY_PAGE);
    const [showAddForm,  setShowAddForm]  = useState(false); // for reminders

    const bodyRef = useRef(null);  // ref to .activity-panel__body — used to scroll footer into view
    const requestsRef = useRef({ notes: null, reminders: null });
    const generationsRef = useRef({ notes: 0, reminders: 0 });
    const onErrorRef = useRef(onError);
    useEffect(() => { onErrorRef.current = onError; }, [onError]);

    const leadId = lead?._id;
    const acctId = lead?.acctId; // passed as query param to every API call

    // ── Fetch helpers ─────────────────────────────────────────────────────────

    const fetchTab = useCallback(async (tab, pageToken = null, append = false) => {
        if (!leadId) return;
        requestsRef.current[tab]?.abort();
        const controller = new AbortController();
        requestsRef.current[tab] = controller;
        const generation = ++generationsRef.current[tab];
        const setLoading = tab === 'notes' ? setLoadingNotes : setLoadingRems;
        setLoading(true);
        try {
            const options = {
                limit: 25,
                signal: controller.signal,
                ...(pageToken?.cursor != null && { cursor: pageToken.cursor }),
            };
            const res = tab === 'notes'
                ? await notesApi.getAll(leadId, acctId, options)
                : await remindersApi.getAll(leadId, acctId, options);
            if (generation !== generationsRef.current[tab]) return;
            const normalized = {
                items: res.data.data,
                nextCursor: res.data.pageInfo.nextCursor,
                hasNext: res.data.pageInfo.hasNextPage,
                total: res.data.total,
            };
            const pageState = {
                nextCursor: normalized.nextCursor,
                hasNext: normalized.hasNext,
                total: normalized.total,
            };
            if (tab === 'notes') {
                setNotes(prev => append ? appendUnique(prev, normalized.items) : normalized.items);
                setNotesPage(pageState);
            } else {
                setReminders(prev => sortReminders(append ? appendUnique(prev, normalized.items) : normalized.items));
                setRemindersPage(pageState);
            }
        } catch (err) {
            if (err.code !== 'ERR_CANCELED' && err.name !== 'CanceledError') {
                onErrorRef.current?.(err.response?.data?.message || `Failed to load ${tab}.`);
            }
        } finally {
            if (generation === generationsRef.current[tab]) setLoading(false);
        }
    }, [leadId, acctId]);

    // Only the visible tab is fetched. Switching leads invalidates both tab caches.
    useEffect(() => {
        requestsRef.current.notes?.abort();
        requestsRef.current.reminders?.abort();
        generationsRef.current.notes += 1;
        generationsRef.current.reminders += 1;
        setNotes([]);
        setReminders([]);
        setNotesPage(EMPTY_PAGE);
        setRemindersPage(EMPTY_PAGE);
    }, [leadId]);

    useEffect(() => {
        fetchTab(activeTab);
        return () => requestsRef.current[activeTab]?.abort();
    }, [activeTab, fetchTab]);

    // Re-fetch when tab switches (keep data fresh)
    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setShowAddForm(false);
    };

    const loadMore = () => {
        const pageState = activeTab === 'notes' ? notesPage : remindersPage;
        if (!pageState.hasNext) return;
        fetchTab(activeTab, {
            cursor: pageState.nextCursor,
        }, true);
    };

    // ── Scroll to bottom when reminder form opens so footer is visible ─────────
    useEffect(() => {
        if (!showAddForm || activeTab !== 'reminders') return;
        const id = setTimeout(() => {
            if (bodyRef.current) {
                bodyRef.current.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
            }
        }, 60); // small delay so DOM finishes painting the form first
        return () => clearTimeout(id);
    }, [showAddForm, activeTab]);

    // ── Note handlers ─────────────────────────────────────────────────────────

    const handleNoteAdded = (note) => {
        if (!note) return;
        // The create API returns the raw DB document with no adminName/adminProfileImage.
        // Patch it immediately from the current user's local profile so the card shows
        // the correct name and avatar without needing a page refresh.
        const patched = {
            ...note,
            adminName:         note.adminName         || currentUser?.name         || '',
            adminProfileImage: note.adminProfileImage || currentUser?.profileImageUrl || null,
        };
        setNotes(prev => [patched, ...prev]);
        setNotesPage(prev => ({ ...prev, total: prev.total == null ? null : prev.total + 1 }));
    };

    const handleNoteEdit = async (noteId, description, adminId) => {
        try {
            const res = await notesApi.update(leadId, noteId, description, acctId, adminId);
            const updated = res.data?.data;
            setNotes(prev => prev.map(n => n._id === noteId ? { ...n, description: updated?.description || description } : n));
        } catch (err) {
            onError?.(err.response?.data?.message || 'Failed to update note.');
        }
    };

    const handleNoteDelete = async (noteId, adminId) => {
        try {
            await notesApi.remove(leadId, noteId, acctId, adminId);
            setNotes(prev => prev.filter(n => n._id !== noteId));
            setNotesPage(prev => ({ ...prev, total: prev.total == null ? null : Math.max(0, prev.total - 1) }));
        } catch (err) {
            onError?.(err.response?.data?.message || 'Failed to delete note.');
        }
    };

    // ── Reminder handlers ─────────────────────────────────────────────────────

    const [editReminder, setEditReminder] = useState(null);

    const handleReminderSaved = (rem) => {
        if (!rem) return;
        if (editReminder) {
            setReminders(prev => sortReminders(prev.map(r => r._id === rem._id ? rem : r)));
        } else {
            setReminders(prev => sortReminders([rem, ...prev]));
            setRemindersPage(prev => ({ ...prev, total: prev.total == null ? null : prev.total + 1 }));
        }
        setShowAddForm(false);
        setEditReminder(null);
    };

    const handleReminderEdit = (reminder) => {
        setEditReminder(reminder);
        setShowAddForm(true);
    };

    const handleReminderDelete = async (reminderId, adminId) => {
        try {
            await remindersApi.remove(leadId, reminderId, acctId, adminId);
            setReminders(prev => prev.filter(r => r._id !== reminderId));
            setRemindersPage(prev => ({ ...prev, total: prev.total == null ? null : Math.max(0, prev.total - 1) }));
        } catch (err) {
            onError?.(err.response?.data?.message || 'Failed to delete reminder.');
        }
    };

    const handleCancelReminderForm = () => {
        setShowAddForm(false);
        setEditReminder(null);
    };

    // ── Render ────────────────────────────────────────────────────────────────

    const panelTitle = leadName || lead?._id?.slice(0, 8) || 'Lead';

    return (
        <div className="activity-panel">
            {/* Panel header */}
            <div className="activity-panel__header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                    <p className="activity-panel__title">{panelTitle}</p>
                    {leadPhone && (
                        <p className="activity-panel__lead-phone">{leadPhone}</p>
                    )}
                    <p className="activity-panel__subtitle">Notes &amp; Reminders</p>
                </div>
                <button className="activity-panel__close-btn" onClick={onClose} title="Close panel">
                    <CloseIcon />
                </button>
            </div>

            {/* Tabs */}
            <div className="activity-panel__tabs">
                <button
                    className={`activity-panel__tab${activeTab === 'notes' ? ' activity-panel__tab--active' : ''}`}
                    onClick={() => handleTabChange('notes')}
                >
                    Notes
                    {(notesPage.total ?? notes.length) > 0 && (
                        <span className="activity-panel__tab-badge">{notesPage.total ?? notes.length}</span>
                    )}
                </button>
                <button
                    className={`activity-panel__tab${activeTab === 'reminders' ? ' activity-panel__tab--active' : ''}`}
                    onClick={() => handleTabChange('reminders')}
                >
                    Reminders
                    {(remindersPage.total ?? reminders.length) > 0 && (
                        <span className="activity-panel__tab-badge">{remindersPage.total ?? reminders.length}</span>
                    )}
                </button>
            </div>

            {/* Body */}
            <div className="activity-panel__body" ref={bodyRef}>

                {/* ── NOTES TAB ────────────────────────────────────────── */}
                {activeTab === 'notes' && (
                    <>
                        <AddNoteForm
                            leadId={leadId}
                            acctId={acctId}
                            adminId={currentAdminId}
                            onNoteAdded={handleNoteAdded}
                            onError={onError}
                        />

                        {loadingNotes ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
                                <div className="animate-spin rounded-full h-5 w-5 border-2 border-indigo-500 border-t-transparent" />
                            </div>
                        ) : notes.length === 0 ? (
                            <EmptyState tab="notes" />
                        ) : (
                            notes.map(note => (
                                <NoteCard
                                    key={note._id}
                                    note={note}
                                    currentAdminId={currentAdminId}
                                    isSuperAdmin={isSuperAdmin}
                                    onEdit={handleNoteEdit}
                                    onDelete={handleNoteDelete}
                                />
                            ))
                        )}
                        {!loadingNotes && notesPage.hasNext && (
                            <button className="btn btn--secondary btn--sm btn--block" onClick={loadMore}>Load more notes</button>
                        )}
                    </>
                )}

                {/* ── REMINDERS TAB ─────────────────────────────────────── */}
                {activeTab === 'reminders' && (
                    <>
                        {showAddForm ? (
                            <AddReminderForm
                                leadId={leadId}
                                acctId={acctId}
                                adminId={currentAdminId}
                                reminder={editReminder}
                                adminHasPhone={adminHasPhone}
                                leadName={lead?.name   || ''}
                                leadPhone={lead?.phone  || ''}
                                leadEmail={lead?.email  || ''}
                                onSaved={handleReminderSaved}
                                onCancel={handleCancelReminderForm}
                                onError={onError}
                            />
                        ) : (
                            <button
                                className="btn btn--primary btn--sm btn--block"
                                onClick={() => { setEditReminder(null); setShowAddForm(true); }}
                            >
                                <PlusIcon /> New Reminder
                            </button>
                        )}

                        {/* Hide reminder cards while form is open so the form
                            gets the full scroll area and footer stays reachable */}
                        {!showAddForm && (loadingRems ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
                                <div className="animate-spin rounded-full h-5 w-5 border-2 border-indigo-500 border-t-transparent" />
                            </div>
                        ) : reminders.length === 0 ? (
                            <EmptyState tab="reminders" />
                        ) : (
                            reminders.map(rem => (
                                <ReminderCard
                                    key={rem._id}
                                    reminder={rem}
                                    // Current assignee (or creator when the lead is unassigned) may manage it
                                    canManage={currentAdminId === (lead?.responsible || rem.userId)}
                                    isSuperAdmin={isSuperAdmin}
                                    onEdit={handleReminderEdit}
                                    onDelete={handleReminderDelete}
                                />
                            ))
                        ))}
                        {!showAddForm && !loadingRems && remindersPage.hasNext && (
                            <button className="btn btn--secondary btn--sm btn--block" onClick={loadMore}>Load more reminders</button>
                        )}
                    </>
                )}

            </div>
        </div>
    );
}

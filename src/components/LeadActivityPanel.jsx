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
    initialTab    = 'notes',
    currentAdminId,
    currentUser,          // { name, profileImageUrl } from AuthContext.userDetails
    adminHasPhone = false,
    onClose,
    onError,
}) {
    const [activeTab,    setActiveTab]    = useState(initialTab);
    const [notes,        setNotes]        = useState([]);
    const [reminders,    setReminders]    = useState([]);
    const [loadingNotes, setLoadingNotes] = useState(false);
    const [loadingRems,  setLoadingRems]  = useState(false);
    const [showAddForm,  setShowAddForm]  = useState(false); // for reminders

    const bodyRef = useRef(null);  // ref to .activity-panel__body — used to scroll footer into view

    const leadId = lead?._id;
    const acctId = lead?.acctId; // passed as query param to every API call

    // ── Fetch helpers ─────────────────────────────────────────────────────────

    const fetchNotes = useCallback(async () => {
        if (!leadId) return;
        setLoadingNotes(true);
        try {
            const res = await notesApi.getAll(leadId, acctId);
            setNotes(res.data?.data || []);
        } catch (err) {
            onError?.(err.response?.data?.message || 'Failed to load notes.');
        } finally {
            setLoadingNotes(false);
        }
    }, [leadId, acctId, onError]);

    const fetchReminders = useCallback(async () => {
        if (!leadId) return;
        setLoadingRems(true);
        try {
            const res = await remindersApi.getAll(leadId, acctId);
            setReminders(res.data?.data || []);
        } catch (err) {
            onError?.(err.response?.data?.message || 'Failed to load reminders.');
        } finally {
            setLoadingRems(false);
        }
    }, [leadId, acctId, onError]);

    // Fetch on mount and when lead changes
    useEffect(() => { fetchNotes(); },    [fetchNotes]);
    useEffect(() => { fetchReminders(); }, [fetchReminders]);

    // Re-fetch when tab switches (keep data fresh)
    const handleTabChange = (tab) => {
        setActiveTab(tab);
        setShowAddForm(false);
        if (tab === 'notes')     fetchNotes();
        if (tab === 'reminders') fetchReminders();
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
    };

    const handleNoteEdit = async (noteId, description) => {
        try {
            const res = await notesApi.update(leadId, noteId, description, acctId);
            const updated = res.data?.data;
            setNotes(prev => prev.map(n => n._id === noteId ? { ...n, description: updated?.description || description } : n));
        } catch (err) {
            onError?.(err.response?.data?.message || 'Failed to update note.');
        }
    };

    const handleNoteDelete = async (noteId) => {
        try {
            await notesApi.remove(leadId, noteId, acctId);
            setNotes(prev => prev.filter(n => n._id !== noteId));
        } catch (err) {
            onError?.(err.response?.data?.message || 'Failed to delete note.');
        }
    };

    // ── Reminder handlers ─────────────────────────────────────────────────────

    const [editReminder, setEditReminder] = useState(null);

    const handleReminderSaved = (rem) => {
        if (!rem) return;
        if (editReminder) {
            setReminders(prev => prev.map(r => r._id === rem._id ? rem : r));
        } else {
            setReminders(prev => [rem, ...prev]);
        }
        setShowAddForm(false);
        setEditReminder(null);
    };

    const handleReminderEdit = (reminder) => {
        setEditReminder(reminder);
        setShowAddForm(true);
    };

    const handleReminderDelete = async (reminderId) => {
        try {
            await remindersApi.remove(leadId, reminderId, acctId);
            setReminders(prev => prev.filter(r => r._id !== reminderId));
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
                    {notes.length > 0 && (
                        <span className="activity-panel__tab-badge">{notes.length}</span>
                    )}
                </button>
                <button
                    className={`activity-panel__tab${activeTab === 'reminders' ? ' activity-panel__tab--active' : ''}`}
                    onClick={() => handleTabChange('reminders')}
                >
                    Reminders
                    {reminders.length > 0 && (
                        <span className="activity-panel__tab-badge">{reminders.length}</span>
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
                                    onEdit={handleNoteEdit}
                                    onDelete={handleNoteDelete}
                                />
                            ))
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
                                reminder={editReminder}
                                adminHasPhone={adminHasPhone}
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
                                    currentAdminId={currentAdminId}
                                    onEdit={handleReminderEdit}
                                    onDelete={handleReminderDelete}
                                />
                            ))
                        ))}
                    </>
                )}

            </div>
        </div>
    );
}

/**
 * NoteCard
 *
 * Displays a single internal note. The creator can inline-edit or delete.
 * All admins can read any note for the lead.
 */
import React, { useState } from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr) {
    if (!dateStr) return '';
    const d    = new Date(dateStr);
    const now  = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60)     return 'just now';
    if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getInitials(name) {
    if (!name) return 'U';
    return name
        .split(' ')
        .filter(Boolean)
        .map(w => w[0].toUpperCase())
        .slice(0, 2)
        .join('');
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * @param {object}   note             - Note document (with adminName + adminProfileImage injected by backend)
 * @param {string}   currentAdminId   - The logged-in admin's userId (for ownership check)
 * @param {function} onEdit(id, desc) - Called after a successful inline edit
 * @param {function} onDelete(id)     - Called when delete is confirmed
 */
export default function NoteCard({ note, currentAdminId, onEdit, onDelete }) {
    const [editing,   setEditing]   = useState(false);
    const [editValue, setEditValue] = useState(note.description);
    const [saving,    setSaving]    = useState(false);

    const isOwner  = note.userId === currentAdminId;
    const initials = getInitials(note.adminName);

    const handleSaveEdit = async () => {
        const trimmed = editValue.trim();
        if (!trimmed) return;
        if (trimmed === note.description) { setEditing(false); return; }
        setSaving(true);
        try {
            await onEdit(note._id, trimmed, note.userId);
            setEditing(false);
        } finally {
            setSaving(false);
        }
    };

    const handleCancelEdit = () => {
        setEditValue(note.description);
        setEditing(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSaveEdit();
        if (e.key === 'Escape') handleCancelEdit();
    };

    return (
        <div className="note-card">
            {/* Admin row */}
            <div className="note-card__admin-row">
                {note.adminProfileImage
                    ? <img src={note.adminProfileImage} alt={note.adminName} className="note-card__avatar" />
                    : <div className="note-card__avatar-fallback">{initials}</div>
                }
                <span className="note-card__admin-name">{note.adminName || 'Unknown'}</span>
                <span className="note-card__time">{formatRelativeTime(note.createdAt)}</span>
            </div>

            {/* Body — view or edit */}
            {editing ? (
                <div className="note-card__edit-area">
                    <textarea
                        className="add-note-form__textarea"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        autoFocus
                        style={{ marginBottom: '0.5rem' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <button
                            onClick={handleCancelEdit}
                            disabled={saving}
                            className="btn btn--secondary btn--sm"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSaveEdit}
                            disabled={saving || !editValue.trim()}
                            className="btn btn--primary btn--sm"
                        >
                            {saving ? 'Saving…' : 'Save'}
                        </button>
                    </div>
                </div>
            ) : (
                <p className="note-card__description">{note.description}</p>
            )}

            {/* Owner actions */}
            {isOwner && !editing && (
                <div className="note-card__actions">
                    <button
                        className="note-card__action-btn note-card__action-btn--edit"
                        onClick={() => { setEditValue(note.description); setEditing(true); }}
                        title="Edit note"
                    >
                        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </button>
                    <button
                        className="note-card__action-btn note-card__action-btn--delete"
                        onClick={() => onDelete(note._id, note.userId)}
                        title="Delete note"
                    >
                        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
}

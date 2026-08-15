/**
 * AddNoteForm
 *
 * Collapsed by default — shows an "Add Note" button.
 * Clicking expands the form (textarea auto-focuses).
 * Cancel collapses back. Submit saves and collapses.
 */
import React, { useState, useRef, useEffect } from 'react';
import { notesApi } from '../api/notesApi';

export default function AddNoteForm({ leadId, acctId, adminId, onNoteAdded, onError }) {
    const [open,        setOpen]        = useState(false);
    const [description, setDescription] = useState('');
    const [saving,      setSaving]      = useState(false);
    const textareaRef = useRef(null);

    // Auto-focus textarea when form opens
    useEffect(() => {
        if (open) {
            setTimeout(() => textareaRef.current?.focus(), 30);
        }
    }, [open]);

    const handleOpen   = () => setOpen(true);
    const handleCancel = () => { setOpen(false); setDescription(''); };

    const handleSubmit = async () => {
        const trimmed = description.trim();
        if (!trimmed) return;
        setSaving(true);
        try {
            const res = await notesApi.create(leadId, trimmed, acctId, adminId);
            onNoteAdded(res.data?.data);
            setDescription('');
            setOpen(false);
        } catch (err) {
            onError?.(err.response?.data?.message || 'Failed to add note.');
        } finally {
            setSaving(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSubmit();
        if (e.key === 'Escape') handleCancel();
    };

    if (!open) {
        return (
            <button
                className="btn btn--primary btn--sm btn--block"
                onClick={handleOpen}
            >
                <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Add Note
            </button>
        );
    }

    return (
        <div className="add-note-form">
            <textarea
                ref={textareaRef}
                className="add-note-form__textarea"
                placeholder="Write an internal note… (Ctrl+Enter to save)"
                value={description}
                onChange={e => setDescription(e.target.value)}
                onKeyDown={handleKeyDown}
            />
            <div className="add-note-form__footer">
                <button
                    onClick={handleCancel}
                    disabled={saving}
                    className="btn btn--secondary btn--sm"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={saving || !description.trim()}
                    className="btn btn--primary btn--sm"
                >
                    {saving ? 'Saving…' : 'Add Note'}
                </button>
            </div>
        </div>
    );
}

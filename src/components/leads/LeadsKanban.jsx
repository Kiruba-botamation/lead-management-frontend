/**
 * Leads Kanban (Stage) view
 *
 * An alternate view of the lead grid that groups leads into columns by stage.
 * Mirrors the grid's actions (edit / notes / reminders / delete open the same
 * right-side panels) and reuses the existing backend:
 *   - GET  /api/ui/leads                      → per-stage lazy loading (15/page)
 *   - PUT  /api/ui/leads/:id                  → move stage / reassign admin
 *   - POST/PUT/DELETE .../collections/:id/stages → inline stage management
 *
 * Each stage column paginates independently: the first 15 leads load on mount,
 * the next 15 load when the column is scrolled to the bottom (IntersectionObserver).
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    useDraggable,
    useDroppable,
    closestCorners,
} from '@dnd-kit/core';
import api from '../../api/axiosConfig';
import { activityApi } from '../../api/notesApi';
import Tooltip from '../Tooltip';
import { tint, twoLetterColor, adminDisplayName } from './leadShared';

const PAGE = 15;
const EMPTY_COL = { leads: [], page: 0, total: 0, loading: false, done: false, error: null };

/** Mirror of LeadsGrid.isFilterActive — kept local so the Kanban builds the
 *  exact same `fieldFilters` payload as the grid. */
const isFilterActive = (filterDef) => {
    if (!filterDef) return false;
    const { type, value, min, max, from, to } = filterDef;
    if (type === 'text')    return !!value;
    if (type === 'number')  return filterDef.op === 'between' ? !!(min || max) : !!(value || value === 0);
    if (type === 'date')    return !!(from || to);
    if (type === 'boolean') return value !== '' && value !== undefined && value !== null;
    return false;
};

// ── Small inline icons (match the grid's action buttons) ────────────────────
const IconEdit = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>;
const IconNotes = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
const IconBell = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>;
const IconTrash = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
const IconMove = () => <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m4 6H4m0 0l4 4m-4-4l4-4" /></svg>;
const IconGrip = () => <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M9 5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm0 7a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm0 7a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm9-14a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm0 7a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zm0 7a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" /></svg>;
const IconPhone = () => <svg className="w-3 h-3 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>;
const IconMail = () => <svg className="w-3 h-3 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;

// ── Card avatar (assigned admin) ────────────────────────────────────────────
const CardAvatar = ({ lead, size = 'w-6 h-6' }) => {
    const name = lead.adminName || '';
    if (!lead.responsible || !name) {
        return <span className={`${size} rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-300 text-[10px] shrink-0`}>∅</span>;
    }
    return lead.adminProfileImage
        ? <img src={lead.adminProfileImage} alt="" className={`${size} rounded-full object-cover border border-gray-200 shrink-0`} onError={e => { e.target.style.display = 'none'; }} />
        : <span className={`${size} rounded-full flex items-center justify-center text-white font-bold text-[10px] select-none shrink-0`} style={{ backgroundColor: twoLetterColor(name) }}>{name.charAt(0).toUpperCase()}</span>;
};

// ── Kanban card ─────────────────────────────────────────────────────────────
const KanbanCard = ({
    lead, stageColor, admins, stages, activeLeadId, activityTab,
    noteCount, reminderCount, dragging,
    onEdit, onActivity, onDelete, isSuperAdmin, onReassign, onMoveStage,
}) => {
    const [assignOpen, setAssignOpen] = useState(false);
    const [moveOpen, setMoveOpen]     = useState(false);
    const assignRef = useRef(null);
    const moveRef   = useRef(null);

    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: lead._id,
        data: { lead, fromStage: lead.stage },
    });
    // The moving preview is rendered by the DragOverlay (position:fixed, never
    // clipped). The source card stays put and is hidden while dragging so only
    // one card is in transit.
    const beingDragged = dragging || isDragging;

    const isActive = activeLeadId === lead._id;

    // Close the inline assign/stage pickers on outside click.
    useEffect(() => {
        if (!assignOpen && !moveOpen) return;
        const h = (e) => {
            if (assignOpen && assignRef.current && !assignRef.current.contains(e.target)) setAssignOpen(false);
            if (moveOpen && moveRef.current && !moveRef.current.contains(e.target)) setMoveOpen(false);
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [assignOpen, moveOpen]);

    const renderAdminAvatar = (a) => (
        a.profileImage
            ? <img src={a.profileImage} alt="" className="w-5 h-5 rounded-full object-cover border border-gray-200 shrink-0" onError={e => { e.target.style.display = 'none'; }} />
            : <span className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold text-[9px] select-none shrink-0" style={{ backgroundColor: twoLetterColor(adminDisplayName(a)) }}>{adminDisplayName(a).charAt(0).toUpperCase()}</span>
    );

    return (
        <div
            ref={setNodeRef}
            style={{
                borderLeftColor: stageColor,
                // Active card (being edited / notes / reminders open) is ringed in the
                // stage's own colour rather than a fixed violet.
                ...(isActive ? { boxShadow: `0 0 0 2px ${stageColor}, 0 1px 3px rgba(0,0,0,0.12)` } : {}),
            }}
            className={`group/card bg-white rounded-lg border border-gray-200 border-l-[3px] shadow-sm hover:shadow-md transition-shadow ${beingDragged ? 'opacity-0' : ''}`}
        >
            {/* Header — the whole bar is the drag handle; only the name text is highlighted */}
            <div
                {...attributes}
                {...listeners}
                className="flex items-start gap-1.5 px-2.5 py-2 rounded-t-md cursor-grab active:cursor-grabbing touch-none select-none"
                title="Drag to another stage"
            >
                <span className="mt-0.5 text-gray-400 shrink-0"><IconGrip /></span>
                <h4 className="flex-1 min-w-0 text-[13px] font-bold leading-snug break-words">
                    {lead.name
                        ? <span className="rounded px-1.5 py-0.5 box-decoration-clone text-gray-800" style={{ backgroundColor: tint(stageColor, 0.18) }}>{lead.name}</span>
                        : <span className="text-gray-400 font-normal">Unnamed</span>}
                </h4>
            </div>

            {/* Phone + Email */}
            <div className="px-2.5 pt-2 pb-2 flex flex-col gap-1">
                {lead.phone && (
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-600 min-w-0">
                        <IconPhone /><span className="truncate">{lead.phone}</span>
                    </div>
                )}
                {lead.email && (
                    <div className="flex items-center gap-1.5 text-[11px] text-gray-600 min-w-0">
                        <IconMail /><span className="truncate">{lead.email}</span>
                    </div>
                )}
            </div>

            {/* Assigned admin — click shows the admin list directly */}
            <div className="px-2.5 pb-2 relative" ref={assignRef}>
                <Tooltip content="Reassign" placement="top" disabled={assignOpen}>
                    <button
                        type="button"
                        onClick={() => { setMoveOpen(false); setAssignOpen(o => !o); }}
                        className={`inline-flex items-center gap-1.5 max-w-full rounded-md px-1.5 py-1 border transition-colors text-left ${assignOpen ? 'bg-gray-100 border-gray-300' : 'border-transparent hover:bg-gray-50 hover:border-gray-200'}`}
                    >
                        <CardAvatar lead={lead} />
                        <span className="min-w-0 truncate text-[11px] font-medium text-gray-700">
                            {lead.responsible && lead.adminName ? lead.adminName : <span className="text-gray-400 font-normal">Unassigned</span>}
                        </span>
                    </button>
                </Tooltip>
                {assignOpen && (
                    <div className="absolute left-2.5 right-2.5 z-40 mt-1 max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl py-1">
                        <button type="button" onClick={() => { onReassign(lead, ''); setAssignOpen(false); }} className={`w-full px-3 py-1.5 flex items-center gap-2 text-left text-xs hover:bg-gray-50 ${!lead.responsible ? 'bg-indigo-50' : ''}`}>
                            <span className="w-5 h-5 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-[10px]">∅</span>
                            <span className="text-gray-500">None</span>
                        </button>
                        {admins.map(a => (
                            <button key={a.userId} type="button" onClick={() => { onReassign(lead, a.userId); setAssignOpen(false); }} className={`w-full px-3 py-1.5 flex items-center gap-2 text-left text-xs hover:bg-gray-50 ${lead.responsible === a.userId ? 'bg-indigo-50' : ''}`}>
                                {renderAdminAvatar(a)}
                                <span className="truncate text-gray-700">{adminDisplayName(a)}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Action icons */}
            <div className="px-2.5 pb-2.5 pt-1 border-t border-gray-100 flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                    <Tooltip content="Edit lead" placement="top" disabled={isActive && !activityTab}>
                        <button onClick={() => onEdit(lead)} className={`group relative w-6 h-6 flex items-center justify-center rounded-md border transition-colors ${isActive && !activityTab ? 'bg-blue-100 border-blue-400 text-blue-600' : 'text-gray-400 hover:text-blue-600 border-gray-200 hover:bg-blue-50 hover:border-blue-300'}`}>
                            <IconEdit />
                        </button>
                    </Tooltip>
                    <Tooltip content="Notes" placement="top" disabled={isActive && activityTab === 'notes'}>
                        <button onClick={() => onActivity(lead, 'notes')} className={`group relative w-6 h-6 flex items-center justify-center rounded-md border transition-colors ${isActive && activityTab === 'notes' ? 'bg-indigo-100 border-indigo-400 text-indigo-600' : noteCount > 0 ? 'bg-indigo-50 border-indigo-300 text-indigo-400' : 'text-gray-400 hover:text-indigo-600 border-gray-200 hover:bg-indigo-50 hover:border-indigo-300'}`}>
                            <IconNotes />
                            {noteCount > 0 && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-indigo-600 rounded-full text-white text-[8px] flex items-center justify-center font-bold">{noteCount > 9 ? '9+' : noteCount}</span>}
                        </button>
                    </Tooltip>
                    <Tooltip content="Reminders" placement="top" disabled={isActive && activityTab === 'reminders'}>
                        <button onClick={() => onActivity(lead, 'reminders')} className={`group relative w-6 h-6 flex items-center justify-center rounded-md border transition-colors ${isActive && activityTab === 'reminders' ? 'bg-amber-100 border-amber-400 text-amber-600' : reminderCount > 0 ? 'bg-amber-50 border-amber-300 text-amber-400' : 'text-gray-400 hover:text-amber-500 border-gray-200 hover:bg-amber-50 hover:border-amber-300'}`}>
                            <IconBell />
                            {reminderCount > 0 && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 rounded-full text-white text-[8px] flex items-center justify-center font-bold">{reminderCount > 9 ? '9+' : reminderCount}</span>}
                        </button>
                    </Tooltip>
                </div>
                <div className="flex items-center gap-1 relative" ref={moveRef}>
                    <Tooltip content="Move to stage" placement="top" disabled={moveOpen}>
                        <button onClick={() => { setAssignOpen(false); setMoveOpen(o => !o); }} className={`group relative w-6 h-6 flex items-center justify-center rounded-md border transition-colors ${moveOpen ? 'bg-violet-100 border-violet-400 text-violet-600' : 'text-gray-400 hover:text-violet-600 border-gray-200 hover:bg-violet-50 hover:border-violet-300'}`}>
                            <IconMove />
                        </button>
                    </Tooltip>
                    {isSuperAdmin && (
                        <Tooltip content="Delete lead" placement="top">
                            <button onClick={() => onDelete(lead._id)} className="group relative w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 border border-gray-200 hover:border-red-300 transition-colors">
                                <IconTrash />
                            </button>
                        </Tooltip>
                    )}
                    {moveOpen && (
                        <div className="absolute right-0 bottom-7 z-40 w-44 max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl py-1">
                            {stages.map(s => (
                                <button key={s.id} type="button" onClick={() => { if (Number(s.id) !== Number(lead.stage)) onMoveStage(lead, Number(s.id)); setMoveOpen(false); }} className={`w-full px-3 py-1.5 flex items-center gap-2 text-left text-xs hover:bg-gray-50 ${Number(s.id) === Number(lead.stage) ? 'bg-indigo-50' : ''}`}>
                                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                                    <span className="truncate text-gray-700">{s.name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Full-fidelity, semi-transparent card clone for the drag overlay ─────────
// Mirrors the real card so the whole card is visible during transit (the live
// preview that follows the cursor), rather than a minified placeholder.
const CardGhost = ({ lead, stageColor }) => {
    const name = lead.adminName || '';
    return (
        <div style={{ borderLeftColor: stageColor, opacity: 0.6 }} className="w-[272px] bg-white rounded-lg border border-gray-200 border-l-[3px] shadow-2xl rotate-2 cursor-grabbing">
            {/* Header with highlighted name */}
            <div className="flex items-start gap-1.5 px-2.5 py-2 rounded-t-md">
                <span className="mt-0.5 text-gray-400 shrink-0"><IconGrip /></span>
                <h4 className="flex-1 min-w-0 text-[13px] font-bold leading-snug break-words">
                    {lead.name
                        ? <span className="rounded px-1.5 py-0.5 box-decoration-clone text-gray-800" style={{ backgroundColor: tint(stageColor, 0.18) }}>{lead.name}</span>
                        : <span className="text-gray-400 font-normal">Unnamed</span>}
                </h4>
            </div>
            {/* Phone + Email */}
            <div className="px-2.5 pt-2 pb-2 flex flex-col gap-1">
                {lead.phone && <div className="flex items-center gap-1.5 text-[11px] text-gray-600 min-w-0"><IconPhone /><span className="truncate">{lead.phone}</span></div>}
                {lead.email && <div className="flex items-center gap-1.5 text-[11px] text-gray-600 min-w-0"><IconMail /><span className="truncate">{lead.email}</span></div>}
            </div>
            {/* Assigned admin */}
            <div className="px-2.5 pb-2">
                <div className="inline-flex items-center gap-1.5 max-w-full rounded-md px-1.5 py-1">
                    <CardAvatar lead={lead} />
                    <span className="min-w-0 truncate text-[11px] font-medium text-gray-700">
                        {lead.responsible && name ? name : <span className="text-gray-400 font-normal">Unassigned</span>}
                    </span>
                </div>
            </div>
            {/* Action icons (static) */}
            <div className="px-2.5 pb-2.5 pt-1 border-t border-gray-100 flex items-center justify-between gap-1 text-gray-300">
                <div className="flex items-center gap-1">
                    <span className="w-6 h-6 flex items-center justify-center rounded-md border border-gray-200"><IconEdit /></span>
                    <span className="w-6 h-6 flex items-center justify-center rounded-md border border-gray-200"><IconNotes /></span>
                    <span className="w-6 h-6 flex items-center justify-center rounded-md border border-gray-200"><IconBell /></span>
                </div>
                <div className="flex items-center gap-1">
                    <span className="w-6 h-6 flex items-center justify-center rounded-md border border-gray-200"><IconMove /></span>
                    <span className="w-6 h-6 flex items-center justify-center rounded-md border border-gray-200"><IconTrash /></span>
                </div>
            </div>
        </div>
    );
};

// ── Column ──────────────────────────────────────────────────────────────────
const KanbanColumn = ({
    stage, col, index, stageCount, busy,
    admins, isSuperAdmin, stages, activeLeadId, activityTab, draggingId, noteCounts, reminderCounts,
    onLoadMore, onEdit, onActivity, onDelete, onReassign, onMoveStage,
    onRename, onRecolor, onReorder, onDeleteStage,
}) => {
    const { setNodeRef, isOver } = useDroppable({ id: `stage-${stage.id}`, data: { stageId: stage.id } });
    const scrollRef   = useRef(null);
    const sentinelRef = useRef(null);
    const [menuOpen, setMenuOpen]   = useState(false);
    const [renaming, setRenaming]   = useState(false);
    const [nameDraft, setNameDraft] = useState(stage.name);
    const menuRef = useRef(null);

    const { leads = [], total = 0, loading, done } = col || EMPTY_COL;

    // Lazy-load the next page when the bottom sentinel scrolls into view.
    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;
        const obs = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !loading && !done) onLoadMore(stage.id);
        }, { root: scrollRef.current, rootMargin: '120px', threshold: 0 });
        obs.observe(el);
        return () => obs.disconnect();
    }, [stage.id, loading, done, onLoadMore]);

    // Close the header menu on outside click.
    useEffect(() => {
        if (!menuOpen) return;
        const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [menuOpen]);

    return (
        <div
            className={`kanban-col w-72 shrink-0 flex flex-col min-h-0 rounded-xl border bg-gray-50/60 transition-all duration-150 ${isOver ? 'border-transparent' : 'border-gray-200'}`}
            style={isOver ? { boxShadow: `0 0 0 2px ${stage.color}`, backgroundColor: tint(stage.color, 0.1) } : undefined}
        >
            {/* Header */}
            <div className="shrink-0 rounded-t-xl px-2.5 py-2 border-b" style={{ backgroundColor: tint(stage.color, 0.14), borderColor: tint(stage.color, 0.35) }}>
                <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                    {renaming ? (
                        <input
                            autoFocus
                            value={nameDraft}
                            onChange={(e) => setNameDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { onRename(stage, nameDraft); setRenaming(false); } if (e.key === 'Escape') { setNameDraft(stage.name); setRenaming(false); } }}
                            onBlur={() => { onRename(stage, nameDraft); setRenaming(false); }}
                            disabled={busy}
                            className="ds-input ds-input--sm flex-1 min-w-0 h-6 py-0"
                        />
                    ) : (
                        <h3 className="flex-1 min-w-0 truncate text-[12px] font-bold text-gray-700">{stage.name}</h3>
                    )}
                    <span className="shrink-0 text-[10px] font-bold text-gray-500 bg-white/70 rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">{total}</span>

                    {/* Reorder */}
                    <button disabled={busy || index === 0} onClick={() => onReorder(index, -1)} className="shrink-0 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-25" title="Move left">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <button disabled={busy || index === stageCount - 1} onClick={() => onReorder(index, 1)} className="shrink-0 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-25" title="Move right">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                    </button>

                    {/* Menu */}
                    <div className="relative shrink-0" ref={menuRef}>
                        <button onClick={() => setMenuOpen(o => !o)} className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700" title="Stage options">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4z" /></svg>
                        </button>
                        {menuOpen && (
                            <div className="absolute right-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-50">
                                <button onClick={() => { setRenaming(true); setNameDraft(stage.name); setMenuOpen(false); }} className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50">Rename</button>
                                <label className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50 flex items-center justify-between cursor-pointer">
                                    <span>Colour</span>
                                    <span className="w-4 h-4 rounded border border-gray-200 relative overflow-hidden" style={{ backgroundColor: stage.color }}>
                                        <input type="color" defaultValue={stage.color} disabled={busy} onChange={(e) => { onRecolor(stage, e.target.value); }} onBlur={() => setMenuOpen(false)} className="absolute inset-0 opacity-0 cursor-pointer" />
                                    </span>
                                </label>
                                <button
                                    disabled={busy || stageCount <= 1}
                                    onClick={() => { onDeleteStage(stage); setMenuOpen(false); }}
                                    className="w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-transparent"
                                    title={stageCount <= 1 ? 'At least one stage is required' : 'Delete stage'}
                                >
                                    Delete
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Cards */}
            <div
                ref={(node) => { setNodeRef(node); scrollRef.current = node; }}
                className="flex-1 overflow-y-auto min-h-0 p-2 flex flex-col gap-2"
            >
                {leads.map((lead) => (
                    <KanbanCard
                        key={lead._id}
                        lead={lead}
                        stageColor={stage.color}
                        admins={admins}
                        stages={stages}
                        activeLeadId={activeLeadId}
                        activityTab={activityTab}
                        noteCount={noteCounts[lead._id] || 0}
                        reminderCount={reminderCounts[lead._id] || 0}
                        dragging={draggingId === lead._id}
                        onEdit={onEdit}
                        onActivity={onActivity}
                        onDelete={onDelete}
                        isSuperAdmin={isSuperAdmin}
                        onReassign={onReassign}
                        onMoveStage={onMoveStage}
                    />
                ))}

                {leads.length === 0 && !loading && (
                    <div className="text-center text-[11px] text-gray-400 py-6">No leads</div>
                )}

                {loading && (
                    <div className="flex justify-center py-3">
                        <div className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-indigo-600 animate-spin" />
                    </div>
                )}

                {/* Bottom sentinel for infinite scroll */}
                <div ref={sentinelRef} className="h-px w-full" />
            </div>
        </div>
    );
};

// ── Add-stage column ────────────────────────────────────────────────────────
const AddStageColumn = ({ busy, onAdd }) => {
    const [adding, setAdding] = useState(false);
    const [name, setName]     = useState('');
    const [color, setColor]   = useState('#4f46e5');

    const submit = () => { if (name.trim()) { onAdd(name.trim(), color); setName(''); setColor('#4f46e5'); setAdding(false); } };

    return (
        <div className="w-64 shrink-0 flex flex-col">
            {adding ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-white p-2.5 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <label className="w-7 h-7 rounded-md border border-gray-200 relative overflow-hidden cursor-pointer shrink-0" style={{ backgroundColor: color }}>
                            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
                        </label>
                        <input
                            autoFocus value={name} onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setAdding(false); setName(''); } }}
                            placeholder="Stage name" className="ds-input ds-input--sm flex-1 min-w-0"
                        />
                    </div>
                    <div className="flex gap-1.5">
                        <button onClick={submit} disabled={busy || !name.trim()} className="flex-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md py-1 disabled:opacity-40">Add</button>
                        <button onClick={() => { setAdding(false); setName(''); }} disabled={busy} className="flex-1 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md py-1">Cancel</button>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => setAdding(true)}
                    className="rounded-xl border border-dashed border-gray-300 bg-white/40 hover:bg-white hover:border-indigo-300 text-gray-400 hover:text-indigo-600 transition-colors py-3 flex items-center justify-center gap-1.5 text-xs font-semibold"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                    Add Stage
                </button>
            )}
        </div>
    );
};

// ── Main board ──────────────────────────────────────────────────────────────
const LeadsKanban = ({
    acctId, acctNo, collectionId, stages, setStages, admins, isSuperAdmin, currentUserId,
    appliedFilters, responsibleFilter, sortField, sortOrder,
    onEdit, onActivity, onDelete, activeLeadId, activityTab,
    noteCounts, reminderCounts, setNoteCounts, setReminderCounts,
    refreshKey, isActive, showSuccess, showError,
}) => {
    const [columns, setColumns] = useState({}); // { [stageId]: {leads,page,total,loading,done} }
    const [draggingId, setDraggingId] = useState(null);
    const [dragLead, setDragLead]     = useState(null);
    const [stageBusy, setStageBusy]   = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);

    const columnsRef = useRef(columns);
    useEffect(() => { columnsRef.current = columns; }, [columns]);
    const inflightRef = useRef({});

    const stagesBase = `/api/ui/leads/collections/${collectionId}/stages`;

    // Signature of the inputs that require a full reset/refetch of every column.
    const filterSig = useMemo(
        () => JSON.stringify({ appliedFilters, responsibleFilter, sortField, sortOrder, collectionId, refreshKey }),
        [appliedFilters, responsibleFilter, sortField, sortOrder, collectionId, refreshKey]
    );
    // Add/delete of a stage changes the id-set (rename/recolor/reorder do not).
    const stageIdSig = useMemo(() => stages.map(s => s.id).slice().sort((a, b) => a - b).join(','), [stages]);

    const buildParams = useCallback((stageId, page) => {
        const active = {};
        for (const [k, v] of Object.entries(appliedFilters || {})) {
            if (k !== 'collectionId' && isFilterActive(v)) active[k] = v;
        }
        active.stage = { type: 'number', op: 'eq', value: Number(stageId) };
        return {
            page,
            limit: PAGE,
            acctId,
            ...(collectionId && { collectionId }),
            ...(sortField && { sortBy: sortField, sortOrder }),
            fieldFilters: JSON.stringify(active),
            ...(isSuperAdmin && responsibleFilter && { responsibleFilter }),
        };
    }, [appliedFilters, acctId, collectionId, sortField, sortOrder, isSuperAdmin, responsibleFilter]);

    // 1 combined call per stage-page (instead of 2 separate notes + reminders calls)
    const mergeCounts = useCallback((leadIds) => {
        if (!leadIds.length || !acctId) return;
        activityApi.batchCounts(leadIds, acctId).then(r => {
            const d = r.data?.data || {};
            if (d.notes)     setNoteCounts(prev => ({ ...prev, ...d.notes }));
            if (d.reminders) setReminderCounts(prev => ({ ...prev, ...d.reminders }));
        }).catch(() => {});
    }, [acctId, setNoteCounts, setReminderCounts]);

    const fetchPage = useCallback(async (stageId, page) => {
        if (inflightRef.current[stageId]) return;
        inflightRef.current[stageId] = true;
        setColumns(prev => ({ ...prev, [stageId]: { ...(prev[stageId] || EMPTY_COL), loading: true, error: null } }));
        try {
            const res = await api.get('/api/ui/leads', { params: buildParams(stageId, page) });
            const newLeads = res.data?.data || [];
            const total = res.data?.pagination?.total ?? 0;
            setColumns(prev => {
                const col = prev[stageId] || EMPTY_COL;
                const leads = page === 1 ? newLeads : [...col.leads, ...newLeads];
                return { ...prev, [stageId]: { leads, page, total, loading: false, done: newLeads.length < PAGE || leads.length >= total, error: null } };
            });
            mergeCounts(newLeads.map(l => l._id));
        } catch (err) {
            setColumns(prev => ({ ...prev, [stageId]: { ...(prev[stageId] || EMPTY_COL), loading: false, error: err?.message || 'Failed to load' } }));
        } finally {
            inflightRef.current[stageId] = false;
        }
    }, [buildParams, mergeCounts]);

    // Reset + load page 1 for every stage whenever filters/sort/collection/refresh
    // change, a stage is added/removed, or the kanban becomes the active view.
    // Guard: skip while the grid view is active so switching to grid never triggers
    // wasted kanban fetches (and switching to kanban fetches fresh data).
    useEffect(() => {
        if (!isActive) return;
        inflightRef.current = {};
        setColumns({});
        stages.forEach(s => fetchPage(s.id, 1));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterSig, stageIdSig, isActive]);

    const loadMore = useCallback((stageId) => {
        const col = columnsRef.current[stageId];
        if (!col || col.loading || col.done) return;
        fetchPage(stageId, (col.page || 0) + 1);
    }, [fetchPage]);

    // ── Move a lead to another stage (drag or the card's move icon) ───────────
    const moveLeadToStage = useCallback(async (lead, toStageId) => {
        const fromStageId = lead.stage;
        if (Number(fromStageId) === Number(toStageId)) return;
        // Optimistic: remove from source, prepend to target.
        setColumns(prev => {
            const from = prev[fromStageId] || EMPTY_COL;
            const to   = prev[toStageId]   || EMPTY_COL;
            return {
                ...prev,
                [fromStageId]: { ...from, leads: from.leads.filter(l => l._id !== lead._id), total: Math.max(0, from.total - 1) },
                [toStageId]:   { ...to,   leads: [{ ...lead, stage: toStageId }, ...to.leads], total: to.total + 1 },
            };
        });
        try {
            await api.put(`/api/ui/leads/${lead._id}`, { stage: Number(toStageId) }, { params: { acctId, acctNo } });
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to move lead.');
            // Revert by refetching both affected columns.
            fetchPage(fromStageId, 1);
            fetchPage(toStageId, 1);
        }
    }, [acctId, acctNo, fetchPage, showError]);

    // ── Reassign admin inline ─────────────────────────────────────────────────
    const reassignLead = useCallback(async (lead, userId) => {
        if ((lead.responsible || '') === (userId || '')) return;
        const admin = admins.find(a => a.userId === userId);
        // Non-superadmins only see leads assigned to them — assigning a lead to
        // someone else removes it from their board immediately.
        const removesFromView = !isSuperAdmin && userId !== currentUserId;
        const optimistic = userId
            ? { responsible: userId, adminName: adminDisplayName(admin), adminProfileImage: admin?.profileImage || null }
            : { responsible: '', adminName: '', adminProfileImage: null };
        setColumns(prev => {
            const col = prev[lead.stage]; if (!col) return prev;
            if (removesFromView) {
                return { ...prev, [lead.stage]: { ...col, leads: col.leads.filter(l => l._id !== lead._id), total: Math.max(0, col.total - 1) } };
            }
            return { ...prev, [lead.stage]: { ...col, leads: col.leads.map(l => l._id === lead._id ? { ...l, ...optimistic } : l) } };
        });
        try {
            await api.put(`/api/ui/leads/${lead._id}`, { responsible: userId }, { params: { acctId, acctNo } });
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to reassign lead.');
            fetchPage(lead.stage, 1);
        }
    }, [admins, isSuperAdmin, currentUserId, acctId, acctNo, fetchPage, showError]);

    // ── DnD handlers ──────────────────────────────────────────────────────────
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
    const onDragStart = (e) => { setDraggingId(e.active.id); setDragLead(e.active.data.current?.lead || null); };
    const onDragEnd = (e) => {
        const lead = e.active.data.current?.lead;
        const toStageId = e.over?.data?.current?.stageId;
        setDraggingId(null); setDragLead(null);
        if (lead && toStageId != null) moveLeadToStage(lead, toStageId);
    };
    const onDragCancel = () => { setDraggingId(null); setDragLead(null); };

    // ── Stage management (reuses the same endpoints as Collection settings) ────
    const renameStage = async (stage, name) => {
        const v = (name || '').trim();
        if (!v || v === stage.name) return;
        setStageBusy(true);
        try {
            const res = await api.put(`${stagesBase}/${stage.id}`, { name: v }, { params: { acctId } });
            setStages(res.data?.data || []);
        } catch (err) { showError(err.response?.data?.message || 'Failed to rename stage.'); }
        finally { setStageBusy(false); }
    };
    const recolorStage = async (stage, color) => {
        if (!color || color === stage.color) return;
        setStageBusy(true);
        try {
            const res = await api.put(`${stagesBase}/${stage.id}`, { color }, { params: { acctId } });
            setStages(res.data?.data || []);
        } catch (err) { showError(err.response?.data?.message || 'Failed to update colour.'); }
        finally { setStageBusy(false); }
    };
    const reorderStage = async (index, dir) => {
        const target = index + dir;
        if (target < 0 || target >= stages.length) return;
        const ordered = [...stages];
        const [m] = ordered.splice(index, 1);
        ordered.splice(target, 0, m);
        setStages(ordered.map((s, i) => ({ ...s, order: i }))); // optimistic
        setStageBusy(true);
        try {
            const res = await api.put(`${stagesBase}/reorder`, { orderedIds: ordered.map(s => s.id) }, { params: { acctId } });
            setStages(res.data?.data || []);
        } catch (err) { showError(err.response?.data?.message || 'Failed to reorder stages.'); }
        finally { setStageBusy(false); }
    };
    const addStage = async (name, color) => {
        setStageBusy(true);
        try {
            const res = await api.post(stagesBase, { name, color }, { params: { acctId } });
            setStages(res.data?.data || []);
            showSuccess('Stage added.');
        } catch (err) { showError(err.response?.data?.message || 'Failed to add stage.'); }
        finally { setStageBusy(false); }
    };
    const doDeleteStage = async () => {
        if (!confirmDelete) return;
        setStageBusy(true);
        try {
            const res = await api.delete(`${stagesBase}/${confirmDelete.id}`, { params: { acctId } });
            const data = res.data?.data || {};
            setStages(data.stages || []);
            const moved = data.reassignedCount || 0;
            showSuccess(moved ? `Stage deleted — ${moved} lead(s) reassigned.` : 'Stage deleted.');
            setConfirmDelete(null);
        } catch (err) { showError(err.response?.data?.message || 'Failed to delete stage.'); }
        finally { setStageBusy(false); }
    };

    if (!stages.length) {
        return <div className="flex-1 flex items-center justify-center text-sm text-gray-400">No stages defined for this collection.</div>;
    }

    return (
        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden">
            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
                <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-3">
                    <div className="h-full flex gap-3 items-stretch">
                        {stages.map((stage, index) => (
                            <KanbanColumn
                                key={stage.id}
                                stage={stage}
                                index={index}
                                stageCount={stages.length}
                                col={columns[stage.id]}
                                busy={stageBusy}
                                admins={admins}
                                isSuperAdmin={isSuperAdmin}
                                stages={stages}
                                activeLeadId={activeLeadId}
                                activityTab={activityTab}
                                draggingId={draggingId}
                                noteCounts={noteCounts}
                                reminderCounts={reminderCounts}
                                onLoadMore={loadMore}
                                onEdit={onEdit}
                                onActivity={onActivity}
                                onDelete={onDelete}
                                onReassign={reassignLead}
                                onMoveStage={moveLeadToStage}
                                onRename={renameStage}
                                onRecolor={recolorStage}
                                onReorder={reorderStage}
                                onDeleteStage={(s) => setConfirmDelete(s)}
                            />
                        ))}
                        <AddStageColumn busy={stageBusy} onAdd={addStage} />
                    </div>
                </div>

                {/* Portal to <body> so the fixed-position overlay aligns to the
                    viewport (and the cursor) regardless of any transformed ancestor. */}
                {createPortal(
                    <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
                        {dragLead ? <CardGhost lead={dragLead} stageColor={(stages.find(s => Number(s.id) === Number(dragLead.stage)) || {}).color || '#4f46e5'} /> : null}
                    </DragOverlay>,
                    document.body
                )}
            </DndContext>

            {/* Delete stage confirmation */}
            {confirmDelete && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !stageBusy && setConfirmDelete(null)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm p-6 flex flex-col gap-4">
                        <div className="flex justify-center">
                            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                                <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-2.99L13.74 4a2 2 0 00-3.48 0L3.34 16.01A2 2 0 005.07 19z" /></svg>
                            </div>
                        </div>
                        <h3 className="text-sm font-bold text-gray-900 text-center">Delete stage &ldquo;{confirmDelete.name}&rdquo;?</h3>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800 text-center">
                            Any leads in this stage will be <strong>reassigned to the first stage</strong>.
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setConfirmDelete(null)} disabled={stageBusy} className="text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md px-3 py-1.5">Cancel</button>
                            <button onClick={doDeleteStage} disabled={stageBusy} className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md px-3 py-1.5 disabled:opacity-50">Delete &amp; reassign</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LeadsKanban;

/**
 * Leads Grid
 *
 * Layout: full-screen data table with optional right-side add/edit panel.
 *
 * Data loading strategy (two-call):
 *  1. On mount and collection change → fetch column definitions from
 *     GET /api/ui/leads/collections/:id/fields
 *  2. Fetch lead data from GET /api/ui/leads (pagination, sort, filter
 *     re-use call #2 only — column defs don't change within a collection).
 *
 * Filter encoding: all typed filters are sent as a single `fieldFilters`
 * JSON string parameter so each filter can carry its type, operator, and value(s).
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axiosConfig';
import { useAccount } from '../context/AccountContext';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from './Notifications';
import { useReminderStream } from '../hooks/useReminderStream';
import LoadingMask from './LoadingMask';
import DeleteConfirmation from './DeleteConfirmation';
import Tooltip from './Tooltip';
import AppNavbar from './AppNavbar';
import LeadActivityPanel from './LeadActivityPanel';
import Button from './ui/Button';
import { Dropdown, DropdownItem } from './ui/Dropdown';
import { activityApi } from '../api/notesApi';
import { twoLetterColor, adminDisplayName, tint, ResponsibleSelect, StageSelect } from './leads/leadShared';
import LeadsKanban from './leads/LeadsKanban';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    closestCenter,
} from '@dnd-kit/core';
import {
    SortableContext,
    horizontalListSortingStrategy,
    useSortable,
    arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';


// ── Constants ─────────────────────────────────────────────────────────────────

/** Fields that are framework-internal and never rendered as grid columns */
const EXCLUDE_FROM_GRID = new Set(['__v', '_id', 'acctId', 'collectionId', 'adminName', 'adminProfileImage', 'stage']);

/** Fixed width (px) reserved for the pinned Responsible column so the pinned
 *  Stage column can be offset by exactly this amount. */
const RESP_PIN_W = 150;

/** Fixed width (px) for the pinned Stage column. */
const STAGE_PIN_W = 140;

/** Width (px) of the trailing sticky Actions column (w-20 = 5rem). */
const ACTIONS_COL_W = 80;

/** Trailing columns always appended after collection-defined fields */
const TRAILING_FIELDS = ['createdAt', 'updatedAt'];

/** System column labels */
const SYSTEM_LABELS = { createdAt: 'Created At', updatedAt: 'Updated At' };

/**
 * Optimal default column widths (px) by field type — data-grid best practice.
 * Columns never shrink below these; when the total exceeds the viewport the grid
 * scrolls horizontally instead of squeezing every column into view.
 */
const MIN_COLUMN_WIDTH      = 110;   // hard floor so no column ever gets crushed
const DEFAULT_COLUMN_WIDTH  = 180;   // comfortable default for free-text values
const MAX_AUTO_COLUMN_WIDTH = 280;   // cap so one long header can't dominate
const COLUMN_WIDTH_BY_TYPE  = {
    boolean: 100,
    number:  120,
    date:    150,
    stage:   150,
    text:    180,
};

/** Resolve a sensible default width for a column from its type and header label. */
const defaultColumnWidth = (colDef, field) => {
    const base   = COLUMN_WIDTH_BY_TYPE[colDef?.type] ?? DEFAULT_COLUMN_WIDTH;
    const label  = colDef?.label || SYSTEM_LABELS[field] || field || '';
    // Roughly fit the header text (≈8px/char) plus room for the drag/sort/filter affordances.
    const labelW = Math.min(MAX_AUTO_COLUMN_WIDTH, Math.round(label.length * 8) + 56);
    return Math.max(MIN_COLUMN_WIDTH, base, labelW);
};

/** Number filter operators */
const NUM_OPS = [
    { value: 'eq',      label: '=' },
    { value: 'ne',      label: '≠' },
    { value: 'gt',      label: '>'  },
    { value: 'gte',     label: '>=' },
    { value: 'lt',      label: '<'  },
    { value: 'lte',     label: '<=' },
    { value: 'between', label: 'Between' }
];


// ── localStorage helpers ──────────────────────────────────────────────────────

const readStore = (key) => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch { return {}; }
};

const writeStore = (key, store) => {
    try { localStorage.setItem(key, JSON.stringify(store)); } catch { /* ignore */ }
};

const loadNested = (key, acctId, catId) => {
    const store = readStore(key);
    return store[acctId]?.[catId || ''] ?? null;
};

const saveNested = (key, acctId, catId, value) => {
    const store = readStore(key);
    store[acctId] = store[acctId] || {};
    if (value === null || value === undefined) {
        delete store[acctId][catId || ''];
    } else {
        store[acctId][catId || ''] = value;
    }
    writeStore(key, store);
};

const loadSelectedCollection = (acctId) => {
    const store = readStore('selectedCollection');
    return store[acctId] ?? null;
};

const saveSelectedCollection = (acctId, value) => {
    const store = readStore('selectedCollection');
    if (value) store[acctId] = value; else delete store[acctId];
    writeStore('selectedCollection', store);
};


// ── Helpers ───────────────────────────────────────────────────────────────────

const applyColOrder = (fields, savedOrder) => {
    if (!savedOrder?.length) return fields;
    const ordered   = savedOrder.filter(f => fields.includes(f));
    const remainder = fields.filter(f => !savedOrder.includes(f));
    return [...ordered, ...remainder];
};

const formatDate = (value) => {
    const d = new Date(value);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    let h = d.getHours(), min = String(d.getMinutes()).padStart(2, '0');
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${dd}.${mm}.${yyyy} ${String(h).padStart(2, '0')}:${min} ${ap}`;
};

const formatBoolean = (value) => {
    if (value === true  || value === 'true')  return 'Yes';
    if (value === false || value === 'false') return 'No';
    return '-';
};

const formatValue = (colDef, value) => {
    if (value === null || value === undefined || value === '') return '-';
    if (!colDef) return String(value);
    const type = colDef.type;
    if (type === 'date' || colDef.field === 'createdAt' || colDef.field === 'updatedAt') return formatDate(value);
    if (type === 'boolean') return formatBoolean(value);
    return String(value);
};


// ── Type-aware filter input component ────────────────────────────────────────

const FilterInput = ({ colDef, value, onChange, onApply }) => {
    const type  = colDef?.type || 'text';
    const field = colDef?.field;

    // Trailing timestamp columns always use date filter
    const effectiveType = (field === 'createdAt' || field === 'updatedAt') ? 'date' : type;

    const stopProp = (e) => e.stopPropagation();
    const inputCls = 'w-full px-2 py-1 text-[10px] bg-white/70 focus:bg-white text-slate-700 rounded-[5px] outline-none placeholder-slate-400 transition-all text-center';
    const wrapCls  = 'relative rounded-md bg-slate-200/80 focus-within:bg-gradient-to-r focus-within:from-indigo-500 focus-within:via-violet-400 focus-within:to-indigo-500 p-[1px] transition-all duration-300 shadow-sm focus-within:shadow-[0_0_10px_rgba(99,102,241,0.3)]';

    if (effectiveType === 'text') {
        return (
            <div className={wrapCls}>
                <input
                    type="text"
                    placeholder="Filter..."
                    value={value?.value || ''}
                    onChange={e => onChange({ type: 'text', value: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') onApply(); stopProp(e); }}
                    onClick={stopProp} onPointerDown={stopProp}
                    className={inputCls}
                />
            </div>
        );
    }

    if (effectiveType === 'number') {
        const op  = value?.op || 'eq';
        const val = value?.value ?? '';
        const min = value?.min ?? '';
        const max = value?.max ?? '';

        return (
            <div className="flex flex-col gap-0.5" onClick={stopProp} onPointerDown={stopProp}>
                <Dropdown
                    align="left"
                    direction="bottom"
                    portal
                    trigger={
                        <button
                            type="button"
                            className={`${inputCls} flex items-center justify-between gap-1 cursor-pointer`}
                            style={{ minWidth: '80px' }}
                        >
                            <span>{NUM_OPS.find(o => o.value === op)?.label ?? op}</span>
                            <svg className="w-2.5 h-2.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    }
                >
                    {NUM_OPS.map(o => (
                        <DropdownItem
                            key={o.value}
                            active={op === o.value}
                            onClick={() => onChange({ type: 'number', op: o.value, value: val, min, max })}
                        >
                            {o.label}
                        </DropdownItem>
                    ))}
                </Dropdown>
                {op === 'between' ? (
                    <div className="flex gap-0.5">
                        <div className={`${wrapCls} flex-1`}>
                            <input type="number" placeholder="Min" value={min}
                                onChange={e => onChange({ type: 'number', op, value: val, min: e.target.value, max })}
                                onKeyDown={e => { if (e.key === 'Enter') onApply(); stopProp(e); }}
                                onClick={stopProp} onPointerDown={stopProp}
                                className={inputCls} />
                        </div>
                        <div className={`${wrapCls} flex-1`}>
                            <input type="number" placeholder="Max" value={max}
                                onChange={e => onChange({ type: 'number', op, value: val, min, max: e.target.value })}
                                onKeyDown={e => { if (e.key === 'Enter') onApply(); stopProp(e); }}
                                onClick={stopProp} onPointerDown={stopProp}
                                className={inputCls} />
                        </div>
                    </div>
                ) : (
                    <div className={wrapCls}>
                        <input type="number" placeholder="Value" value={val}
                            onChange={e => onChange({ type: 'number', op, value: e.target.value, min, max })}
                            onKeyDown={e => { if (e.key === 'Enter') onApply(); stopProp(e); }}
                            onClick={stopProp} onPointerDown={stopProp}
                            className={inputCls} />
                    </div>
                )}
            </div>
        );
    }

    if (effectiveType === 'date') {
        return (
            <div className="flex flex-col gap-0.5">
                <div className={wrapCls}>
                    <input type="date" value={value?.from || ''}
                        onChange={e => onChange({ type: 'date', from: e.target.value, to: value?.to || '' })}
                        onKeyDown={e => { if (e.key === 'Enter') onApply(); stopProp(e); }}
                        onClick={stopProp} onPointerDown={stopProp}
                        className={inputCls} title="From date" />
                </div>
                <div className={wrapCls}>
                    <input type="date" value={value?.to || ''}
                        onChange={e => onChange({ type: 'date', from: value?.from || '', to: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') onApply(); stopProp(e); }}
                        onClick={stopProp} onPointerDown={stopProp}
                        className={inputCls} title="To date" />
                </div>
            </div>
        );
    }

    if (effectiveType === 'boolean') {
        return (
            <div className={wrapCls}>
                <select
                    value={value?.value ?? ''}
                    onChange={e => onChange({ type: 'boolean', value: e.target.value })}
                    onClick={stopProp} onPointerDown={stopProp}
                    className={`${inputCls} bg-white/70 border-0`}
                >
                    <option value="">Any</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                </select>
            </div>
        );
    }

    return null;
};

/** Returns true when a filter object has a meaningful value set */
const isFilterActive = (filterDef) => {
    if (!filterDef) return false;
    const { type, value, min, max, from, to } = filterDef;
    if (type === 'text')    return !!(value);
    if (type === 'number')  return filterDef.op === 'between' ? !!(min || max) : !!(value || value === 0);
    if (type === 'date')    return !!(from || to);
    if (type === 'boolean') return value !== '' && value !== undefined && value !== null;
    return false;
};

/** Human-readable summary of a filter value for the active-filters list */
const filterSummary = (filterDef) => {
    if (!filterDef) return '';
    const { type, value, op, min, max, from, to } = filterDef;
    if (type === 'text')    return `"${value}"`;
    if (type === 'boolean') return value === 'true' ? 'Yes' : 'No';
    if (type === 'date') {
        if (from && to)  return `${from} → ${to}`;
        if (from)        return `from ${from}`;
        if (to)          return `to ${to}`;
    }
    if (type === 'number') {
        const opLabel = NUM_OPS.find(o => o.value === op)?.label || op;
        if (op === 'between') return `${min} – ${max}`;
        return `${opLabel} ${value}`;
    }
    return '';
};


// ── Filter Popup ──────────────────────────────────────────────────────────────

const FilterPopup = ({
    fields, columnDefMap,
    filters, onFilterChange,
    onApply, onClearAll, onClose,
}) => {
    const [selectedField, setSelectedField] = React.useState(() => {
        // Default to the first field that already has an active filter, or just the first field
        const activeField = fields.find(f => isFilterActive(filters[f]));
        return activeField || fields[0] || '';
    });
    const [fieldDropdownOpen, setFieldDropdownOpen] = React.useState(false);
    const fieldDropdownRef = React.useRef(null);

    React.useEffect(() => {
        if (!fieldDropdownOpen) return;
        const handler = (e) => {
            if (fieldDropdownRef.current && !fieldDropdownRef.current.contains(e.target))
                setFieldDropdownOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [fieldDropdownOpen]);

    const colDef      = columnDefMap.get(selectedField);
    const activeRows  = fields.filter(f => isFilterActive(filters[f]));

    // onApply and onClearAll already close the popup (handled by parent)
    const handleApplyAndClose = () => { onApply(); };

    const handleClearAllAndClose = () => { onClearAll(); };

    const removeFilter = (field) => {
        onFilterChange(field, null);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

            {/* Panel */}
            <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-lg animate-fade-in flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center">
                            <svg className="w-3.5 h-3.5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-gray-900">Filter Leads</h2>
                            <p className="text-[10px] text-gray-400 leading-none mt-0.5">Select a column and set your filter criteria</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

                    {/* ── Column selector + filter input ── */}
                    <div className="space-y-3">
                        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                            Select Column
                        </label>
                        <div className="relative" ref={fieldDropdownRef}>
                            <button
                                type="button"
                                onClick={() => setFieldDropdownOpen(v => !v)}
                                className="w-full px-3 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg flex items-center justify-between hover:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
                            >
                                <span className="truncate">
                                    {columnDefMap.get(selectedField)?.label || SYSTEM_LABELS[selectedField] || selectedField}
                                </span>
                                <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 ml-2 transition-transform ${fieldDropdownOpen ? 'rotate-180' : ''}`}
                                     fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                            {fieldDropdownOpen && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-52 overflow-y-auto">
                                    {fields.map(f => {
                                        const def = columnDefMap.get(f);
                                        const lbl = def?.label || SYSTEM_LABELS[f] || f;
                                        const hasFilter = isFilterActive(filters[f]);
                                        return (
                                            <button
                                                key={f}
                                                type="button"
                                                onClick={() => { setSelectedField(f); setFieldDropdownOpen(false); }}
                                                className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors ${f === selectedField ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'}`}
                                            >
                                                <span className="truncate">{lbl}</span>
                                                {hasFilter && <span className="text-indigo-500 text-xs ml-2 flex-shrink-0">●</span>}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Type badge */}
                        {colDef && (
                            <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-[10px] font-semibold text-indigo-600 uppercase tracking-wider">
                                    {colDef.type || 'text'}
                                </span>
                                {isFilterActive(filters[selectedField]) && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-[10px] font-semibold text-emerald-600">
                                        Filter active
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Filter input for selected column */}
                        {selectedField && (
                            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                                    {columnDefMap.get(selectedField)?.label || SYSTEM_LABELS[selectedField] || selectedField}
                                </p>
                                <FilterInput
                                    colDef={colDef}
                                    value={filters[selectedField]}
                                    onChange={(v) => onFilterChange(selectedField, v)}
                                    onApply={() => {}}
                                />
                                {isFilterActive(filters[selectedField]) && (
                                    <button
                                        onClick={() => removeFilter(selectedField)}
                                        className="mt-2 text-[10px] text-red-500 hover:text-red-700 font-medium transition-colors"
                                    >
                                        Remove this filter
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Active filters list ── */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                                Active Filters
                                {activeRows.length > 0 && (
                                    <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-bold">
                                        {activeRows.length}
                                    </span>
                                )}
                            </label>
                        </div>

                        {activeRows.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-5 rounded-xl border border-dashed border-gray-200 text-center">
                                <svg className="w-6 h-6 text-gray-300 mb-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                                </svg>
                                <p className="text-[11px] text-gray-400 font-medium">No filters added yet</p>
                                <p className="text-[10px] text-gray-300 mt-0.5">Select a column above and fill in the filter criteria</p>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                {activeRows.map(f => {
                                    const def   = columnDefMap.get(f);
                                    const lbl   = def?.label || SYSTEM_LABELS[f] || f;
                                    const summary = filterSummary(filters[f]);
                                    const isSelected = f === selectedField;
                                    return (
                                        <div
                                            key={f}
                                            onClick={() => setSelectedField(f)}
                                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-all ${isSelected ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'}`}
                                        >
                                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${isSelected ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                                                {def?.type || 'text'}
                                            </span>
                                            <span className="text-[11px] font-semibold text-gray-700 shrink-0">{lbl}</span>
                                            <span className="text-[11px] text-gray-400 truncate flex-1">{summary}</span>
                                            <button
                                                onClick={e => { e.stopPropagation(); removeFilter(f); }}
                                                className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-red-100 text-gray-300 hover:text-red-500 transition-colors shrink-0"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center gap-2 px-5 py-3 border-t border-gray-100 shrink-0 bg-gray-50 rounded-b-2xl">
                    <button
                        onClick={handleClearAllAndClose}
                        disabled={activeRows.length === 0}
                        className="px-3 py-1.5 text-[11px] font-semibold text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Clear All
                    </button>
                    <div className="flex-1" />
                    <button
                        onClick={onClose}
                        className="px-4 py-1.5 text-[11px] font-semibold text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleApplyAndClose}
                        className="px-4 py-1.5 text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
                    >
                        Apply{activeRows.length > 0 ? ` (${activeRows.length})` : ''}
                    </button>
                </div>
            </div>
        </div>
    );
};


// ── Sortable column header ────────────────────────────────────────────────────

const SortableColumnHeader = ({
    field, label,
    renderSortIcon, handleSort,
    isColFilterActive, isDragging,
    width, onResize,
}) => {
    const {
        attributes, listeners, setNodeRef,
        transform, transition,
        isDragging: isSelfDragging,
    } = useSortable({ id: field });

    const thRef = React.useRef(null);
    const combinedRef = React.useCallback((el) => {
        setNodeRef(el);
        thRef.current = el;
    }, [setNodeRef]);

    const startResize = React.useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = thRef.current ? thRef.current.offsetWidth : (width || 120);
        let nextWidth = startW;
        let frame = null;
        const paint = () => {
            frame = null;
            if (!thRef.current) return;
            thRef.current.style.width = `${nextWidth}px`;
            thRef.current.style.minWidth = `${nextWidth}px`;
        };
        const onMove = (me) => {
            nextWidth = Math.max(60, startW + me.clientX - startX);
            if (frame == null) frame = requestAnimationFrame(paint);
        };
        const onUp   = () => {
            if (frame != null) cancelAnimationFrame(frame);
            onResize(field, nextWidth);
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
        };
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    }, [field, width, onResize]);

    const style = {
        transform:  CSS.Transform.toString(transform),
        transition,
        opacity:    isSelfDragging ? 0.4 : 1,
        cursor:     isSelfDragging ? 'grabbing' : 'grab',
        position:   'relative',
        zIndex:     isSelfDragging ? 999 : undefined,
        width:      width || undefined,
        minWidth:   width || undefined,
    };

    return (
        <th
            ref={combinedRef} style={style} {...attributes} {...listeners}
            className={`px-3 py-2.5 relative align-middle select-none text-center ${isSelfDragging ? '' : 'hover:bg-indigo-50/60 transition-colors'}`}
        >
            {/* Resize handle */}
            <div
                onPointerDown={startResize}
                className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize group/resize z-10 select-none"
                style={{ touchAction: 'none' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="absolute right-0 top-1/4 h-1/2 w-px bg-gray-200 group-hover/resize:bg-indigo-400 transition-colors" />
            </div>
            <div
                className="flex items-center justify-center group/sort transition-colors"
                onClick={() => { if (!isDragging) handleSort(field); }}
            >
                <div className="relative inline-flex items-center gap-1">
                    <span className="text-slate-300 group-hover/sort:text-slate-400 text-[9px] leading-none mr-0.5 select-none" aria-hidden="true">⠿</span>
                    <span className={`text-[11px] font-extrabold uppercase tracking-wider group-hover/sort:text-indigo-600 transition-colors ${isColFilterActive ? 'text-indigo-600' : 'text-slate-500'}`}>
                        {label}
                    </span>
                    {renderSortIcon(field)}
                    {isColFilterActive && (
                        <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-indigo-500 flex-shrink-0" title="Filter active" />
                    )}
                </div>
            </div>
        </th>
    );
};

const DragOverlayColumnHeader = ({ field, label }) => (
    <table className="border-separate" style={{ tableLayout: 'auto' }}>
        <thead>
            <tr>
                <th className="px-3 py-2.5 align-bottom bg-white shadow-2xl ring-2 ring-indigo-400 rounded-lg opacity-95 text-center"
                    style={{ cursor: 'grabbing', minWidth: 100 }}>
                    <div className="flex items-center justify-center gap-1 mb-1.5">
                        <span className="text-indigo-300 text-[9px] leading-none mr-0.5 select-none" aria-hidden="true">⠿</span>
                        <span className="text-[11px] font-extrabold text-indigo-600 uppercase tracking-wider">{label}</span>
                    </div>
                </th>
            </tr>
        </thead>
    </table>
);


// ── Add/Edit lead form (right panel) ──────────────────────────────────────────

const LeadFormPanel = React.memo(({ editLead, editFields, columnDefMap, initialForm, onSave, onCancel, isSaving, admins, stages = [] }) => {
    const [draft, setDraft] = useState(initialForm);
    const isEditFormDirty = editLead
        ? Object.keys(draft).some(k => {
            const orig = editLead[k] == null ? '' : String(editLead[k]);
            const curr = draft[k] == null ? '' : String(draft[k]);
            return curr !== orig;
        })
        : Object.values(draft).some(v => v !== '' && v !== null && v !== undefined);

    return (
        <div className="w-full sm:w-[calc(33.333%-0.5rem)] bg-white border border-gray-300 rounded-lg shadow-sm relative flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3 border-b border-gray-200 shrink-0">
                <h3 className="text-xs font-bold text-gray-700">
                    {editLead ? 'Edit Lead' : 'Add New Lead'}
                </h3>
                <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => onSave(draft)} disabled={isSaving || !isEditFormDirty} loading={isSaving}>
                        Save
                    </Button>
                    <Button size="sm" variant="secondary" scheme="primary" onClick={onCancel} disabled={isSaving}>
                        Cancel
                    </Button>
                </div>
            </div>
            {(editFields.includes('responsible') || stages.length > 0) && (
                <div className="px-4 py-3 bg-indigo-50 border-b-2 border-indigo-200 shrink-0 flex gap-3">
                    {editFields.includes('responsible') && (
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-1.5">Assigned To</p>
                            <ResponsibleSelect
                                admins={admins}
                                value={draft.responsible ?? ''}
                                onChange={v => setDraft(prev => ({ ...prev, responsible: v }))}
                                disabled={isSaving}
                            />
                        </div>
                    )}
                    {stages.length > 0 && (
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-1.5">Stage</p>
                            <StageSelect
                                stages={stages}
                                value={draft.stage ?? ''}
                                onChange={v => setDraft(prev => ({ ...prev, stage: v }))}
                                disabled={isSaving}
                            />
                        </div>
                    )}
                </div>
            )}
            <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-1 gap-4">
                    {editFields.filter(fieldKey => fieldKey !== 'responsible' && fieldKey !== 'stage').map(fieldKey => {
                        const colDef = columnDefMap.get(fieldKey);
                        const label  = colDef?.label || SYSTEM_LABELS[fieldKey] || fieldKey;
                        const type   = colDef?.type || 'text';

                        return (
                            <div key={fieldKey}>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    {label}
                                </label>
                                <FormFieldInput
                                    type={type}
                                    value={draft[fieldKey] ?? ''}
                                    onChange={v => setDraft(prev => ({ ...prev, [fieldKey]: v }))}
                                    disabled={isSaving}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
});

const FormFieldInput = ({ type, value, onChange, disabled }) => {
    const cls = 'ds-input ds-input--sm';
    if (type === 'number') {
        return <input type="number" value={value} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} className={cls} disabled={disabled} />;
    }
    if (type === 'date') {
        // Store as ISO date string; display with date input
        const dateVal = value ? new Date(value).toISOString().slice(0, 10) : '';
        return <input type="date" value={dateVal} onChange={e => onChange(e.target.value)} className={cls} disabled={disabled} />;
    }
    if (type === 'boolean') {
        return (
            <select value={String(value)} onChange={e => onChange(e.target.value === 'true')} className={cls} disabled={disabled}>
                <option value="">— Select —</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
            </select>
        );
    }
    // Default: text
    return <input type="text" value={value} onChange={e => onChange(e.target.value)} className={cls} disabled={disabled} />;
};


// ── Responsible filter dropdown (toolbar — superadmin only) ───────────────────

const ResponsibleFilterDropdown = ({ admins, value, onChange }) => {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef(null);

    React.useEffect(() => {
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    const selected = admins.find(a => a.userId === value) || null;

    const renderAvatar = (a) => {
        const name = adminDisplayName(a);
        return a.profileImage
            ? <img src={a.profileImage} alt="" loading="lazy" decoding="async" className="w-4 h-4 rounded-full object-cover border border-gray-200" onError={e => { e.target.style.display = 'none'; }} />
            : <span className="w-4 h-4 rounded-full flex items-center justify-center text-white font-bold text-[8px] select-none shrink-0" style={{ backgroundColor: twoLetterColor(name) }}>{name.charAt(0).toUpperCase()}</span>;
    };

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`h-8 px-2.5 flex items-center gap-1.5 text-xs rounded-lg border transition-all ${value ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold' : 'bg-white border-gray-300 text-gray-600 hover:border-indigo-300 hover:bg-indigo-50'}`}
            >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {value === '__unassigned__' ? (
                    <span className="truncate">Unassigned</span>
                ) : selected ? (
                    <span className="flex items-center gap-1 max-w-[90px]">
                        {renderAvatar(selected)}
                        <span className="truncate">{adminDisplayName(selected)}</span>
                    </span>
                ) : (
                    <span className="text-gray-400">All Admins</span>
                )}
                <svg className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {open && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 min-w-[160px] max-h-60 overflow-y-auto py-1">
                    <button
                        type="button"
                        onClick={() => { onChange(''); setOpen(false); }}
                        className={`w-full px-3 py-1.5 flex items-center gap-2 text-left text-xs hover:bg-gray-50 ${!value ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600'}`}
                    >
                        <span className="w-4 h-4 rounded-full border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-[9px] shrink-0">∅</span>
                        All Admins
                    </button>
                    <button
                        type="button"
                        onClick={() => { onChange('__unassigned__'); setOpen(false); }}
                        className={`w-full px-3 py-1.5 flex items-center gap-2 text-left text-xs hover:bg-gray-50 ${value === '__unassigned__' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600'}`}
                    >
                        <span className="w-4 h-4 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-400 text-[9px] shrink-0">—</span>
                        Unassigned
                    </button>
                    {admins.map(a => (
                        <button
                            key={a.userId}
                            type="button"
                            onClick={() => { onChange(a.userId); setOpen(false); }}
                            className={`w-full px-3 py-1.5 flex items-center gap-2 text-left text-xs hover:bg-gray-50 ${value === a.userId ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700'}`}
                        >
                            {renderAvatar(a)}
                            <span className="truncate">{adminDisplayName(a)}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};


// ── Stage filter dropdown (toolbar — available to all users) ──────────────────

const StageFilterDropdown = ({ stages, value, onChange }) => {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef(null);

    React.useEffect(() => {
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    const selected = stages.find(s => String(s.id) === String(value)) || null;
    const swatch = (color, size = 'w-3 h-3') => <span className={`${size} rounded-full shrink-0`} style={{ backgroundColor: color }} />;

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className={`h-8 px-2.5 flex items-center gap-1.5 text-xs rounded-lg border transition-all ${value ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold' : 'bg-white border-gray-300 text-gray-600 hover:border-indigo-300 hover:bg-indigo-50'}`}
            >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10M7 12h10M7 17h6" />
                </svg>
                {selected ? (
                    <span className="flex items-center gap-1 max-w-[100px]">
                        {swatch(selected.color)}
                        <span className="truncate">{selected.name}</span>
                    </span>
                ) : (
                    <span className="text-gray-400">All Stages</span>
                )}
                <svg className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {open && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 min-w-[160px] max-h-60 overflow-y-auto py-1">
                    <button
                        type="button"
                        onClick={() => { onChange(''); setOpen(false); }}
                        className={`w-full px-3 py-1.5 flex items-center gap-2 text-left text-xs hover:bg-gray-50 ${!value ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-600'}`}
                    >
                        <span className="w-3 h-3 rounded-full border border-dashed border-gray-300 shrink-0" />
                        All Stages
                    </button>
                    {stages.map(s => (
                        <button
                            key={s.id}
                            type="button"
                            onClick={() => { onChange(String(s.id)); setOpen(false); }}
                            className={`w-full px-3 py-1.5 flex items-center gap-2 text-left text-xs hover:bg-gray-50 ${String(value) === String(s.id) ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700'}`}
                        >
                            {swatch(s.color)}
                            <span className="truncate">{s.name}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};


// ── Collection selector dropdown (toolbar) ────────────────────────────────────
// Custom dropdown matching the Responsible/Stage filter styling, with a trailing
// "Create new collection" link that routes to Settings → Collection.

const CollectionSelectDropdown = ({ collections, value, onChange, onCreate, disabled }) => {
    const [open, setOpen] = React.useState(false);
    const ref = React.useRef(null);

    React.useEffect(() => {
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);

    const selected = collections.find(c => c._id === value) || null;
    const folderIcon = (
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        </svg>
    );

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(o => !o)}
                className={`h-8 px-2.5 min-w-[176px] flex items-center justify-between gap-1.5 text-xs rounded-lg border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${value ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold' : 'bg-white border-gray-300 text-gray-600 hover:border-indigo-300 hover:bg-indigo-50'}`}
            >
                <span className="flex items-center gap-1.5 min-w-0">
                    {folderIcon}
                    {selected
                        ? <span className="truncate">{selected.collectionName}</span>
                        : <span className="text-gray-400">Select Collection</span>}
                </span>
                <svg className={`w-3 h-3 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {open && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 min-w-[200px] max-h-60 overflow-y-auto py-1">
                    {collections.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-gray-400">No collections yet</p>
                    ) : collections.map(c => (
                        <button
                            key={c._id}
                            type="button"
                            onClick={() => { onChange(c._id); setOpen(false); }}
                            className={`w-full px-3 py-1.5 flex items-center gap-2 text-left text-xs hover:bg-gray-50 ${value === c._id ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-gray-700'}`}
                        >
                            {folderIcon}
                            <span className="truncate">{c.collectionName}</span>
                            {c.default && (
                                <span className={`ml-auto text-[9px] font-semibold uppercase ${value === c._id ? 'text-indigo-400' : 'text-gray-400'}`}>default</span>
                            )}
                        </button>
                    ))}
                    <div className="my-1 border-t border-gray-100" />
                    <button
                        type="button"
                        onClick={() => { setOpen(false); onCreate?.(); }}
                        className="w-full px-3 py-1.5 flex items-center gap-2 text-left text-xs font-semibold text-indigo-600 hover:bg-indigo-50"
                    >
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                        Create new collection
                    </button>
                </div>
            )}
        </div>
    );
};


// ── Main LeadsGrid component ───────────────────────────────────────────────────

const LeadsGrid = () => {
    const navigate                             = useNavigate();
    const location                             = useLocation();
    const { showSuccess, showError, showWarning, showReminder } = useNotifications();
    const { acctNo, acctId, isAccountLinked, accountsLoaded, accountsLoading, setIsLinkDialogOpen } = useAccount();
    const { userDetails, chatbotAdmin, user: rawUser, accessLevel } = useAuth();

    // ── Current user identity ─────────────────────────────────────────────────
    // Notes, reminders and the bell/SSE stream are all keyed by the lead-app userId.
    const currentUserId  = rawUser?.userId || '';
    const adminHasPhone  = Boolean(userDetails?.phone);

    // Admin identity + access level are resolved centrally in AccountContext.

    const isSuperAdmin = accessLevel === 'superadmin';

    // ── Admins for the Responsible dropdown ───────────────────────────────────
    const [adminsList, setAdminsList] = useState([]);
    const [responsibleFilter, setResponsibleFilter] = useState('');
    useEffect(() => {
        if (!acctId) { setAdminsList([]); return; }
        // roster=1 → full account roster so any admin can assign a lead to another admin
        api.get('/api/ui/admins/list', { params: { acctId, limit: 200, roster: 1 } })
            .then(res => {
                const list = res.data.admins;
                setAdminsList(list.filter(a => a.userId));
            })
            .catch(() => setAdminsList([]));
    }, [acctId]);

    // ── Real-time reminder stream + bell badge ────────────────────────────────
    const { firedCount, setFiredCount } = useReminderStream({ showReminder, onNewFired: null, acctId, userId: currentUserId });

    // ── Lead data ─────────────────────────────────────────────────────────────
    const [leads, setLeads]             = useState([]);
    const [loading, setLoading]         = useState(true);
    const [error, setError]             = useState(null);
    const [isExporting, setIsExporting] = useState(false);
    const [activeExportId, setActiveExportId] = useState(null);
    const exportAbortRef = useRef(null);

    useEffect(() => () => {
        const controller = exportAbortRef.current;
        exportAbortRef.current = null;
        controller?.abort();
    }, []);

    // ── Column definitions (from collection — separate from lead data) ──────────
    /**
     * columnDefs: [{ label, field, type, system? }]
     * fields:     [fieldName] — ordered list used for render + dnd
     */
    const [columnDefs, setColumnDefs]   = useState([]);
    const [fields, setFields]           = useState([]); // ordered field keys for the grid
    const columnDefMap = React.useMemo(() => {
        const map = new Map();
        columnDefs.forEach(c => map.set(c.field, c));
        // Trailing system fields
        map.set('createdAt', { label: 'Created At', field: 'createdAt', type: 'date' });
        map.set('updatedAt', { label: 'Updated At', field: 'updatedAt', type: 'date' });
        return map;
    }, [columnDefs]);

    // ── Pagination ────────────────────────────────────────────────────────────
    const [currentPage,   setCurrentPage]   = useState(1);
    const [pageSize,      setPageSize]       = useState(50);
    const [currentCursor, setCurrentCursor]  = useState(null);
    const [cursorHistory, setCursorHistory]  = useState([]);
    const [nextCursor,    setNextCursor]     = useState(null);
    const [hasNextPage,   setHasNextPage]    = useState(false);
    const [totalRecords,  setTotalRecords]   = useState(null);

    const resetPagination = useCallback(() => {
        setCurrentPage(1);
        setCurrentCursor(null);
        setCursorHistory([]);
        setNextCursor(null);
        setHasNextPage(false);
    }, []);

    // ── Sorting ───────────────────────────────────────────────────────────────
    const [sortField,  setSortField]  = useState('');
    const [sortOrder,  setSortOrder]  = useState('asc');

    // ── Filters ───────────────────────────────────────────────────────────────
    // filters: { [fieldName]: { type, value, op, min, max, from, to } }
    const [filters,        setFilters]        = useState({});
    const [appliedFilters, setAppliedFilters] = useState({});
    const filterTimerRef = useRef(null);

    // ── Column visibility ─────────────────────────────────────────────────────
    const [visibleFields,       setVisibleFields]       = useState(null);
    const [showColumnSelector,  setShowColumnSelector]  = useState(false);
    const columnSelectorRef = useRef(null);

    // ── Filter popup ──────────────────────────────────────────────────────────
    const [showFilterPopup, setShowFilterPopup] = useState(false);

    // ── Column drag state ─────────────────────────────────────────────────────
    const [activeColId, setActiveColId] = useState(null);
    const [colWidths, setColWidths]         = useState({});

    // Ref that's set synchronously inside fetchColumnDefs before any await so
    // fetchLeads can check it in the same effects phase and bail without fetching
    // stale data (prevents the duplicate-fetch race on collection switch).
    const columnDefsLoadingRef = useRef(false);
    const collectionsRequestRef = useRef(null);
    const fieldsRequestRef = useRef(null);
    const leadsRequestRef = useRef(null);
    const countsRequestRef = useRef(null);
    const collectionsGenerationRef = useRef(0);
    const fieldsGenerationRef = useRef(0);
    const leadsGenerationRef = useRef(0);
    const countsGenerationRef = useRef(0);

    // ── Grid viewport width (for even-spreading columns) ──────────────────────
    const gridScrollRef = useRef(null);
    const [gridViewportW, setGridViewportW] = useState(0);

    // ── Stage state (per selected collection) ───────────────────────────────────
    const [stages,      setStages]      = useState([]);   // [{ id, name, color, order }]
    const [stageFilter, setStageFilter] = useState('');   // selected stage id (string) or ''
    const stageMap = React.useMemo(() => {
        const m = new Map();
        stages.forEach(s => m.set(s.id, s));
        return m;
    }, [stages]);

    // ── Collection state ────────────────────────────────────────────────────────
    const [collections,           setCollections]           = useState([]);
    const [selectedCollection,     setSelectedCollection]     = useState('');
    const [collectionLoading,      setCollectionLoading]      = useState(false);
    const [collectionsReady,      setCollectionsReady]      = useState(false);
    const [columnDefsReady,      setColumnDefsReady]      = useState(false);
    const [deleteCollectionPending, setDeleteCollectionPending] = useState(null);
    const [deleteCollectionLoading, setDeleteCollectionLoading] = useState(false);

    // ── Edit / Delete form ────────────────────────────────────────────────────
    const [editLead,          setEditLead]          = useState(null);
    const [editForm,          setEditForm]          = useState({});
    const [editFields,        setEditFields]        = useState([]);
    const [isEditFormVisible, setIsEditFormVisible] = useState(false);
    const [isGridVisible,     setIsGridVisible]     = useState(true);
    const [isSaving,          setIsSaving]          = useState(false);
    const [deleteLeadId,      setDeleteLeadId]      = useState(null);
    const [isDeleteOpen,      setIsDeleteOpen]       = useState(false);

    // ── Activity panel (Notes / Reminders) ───────────────────────────────────
    const [activityLead,    setActivityLead]    = useState(null);
    const [activityTab,     setActivityTab]     = useState('notes');

    // ── Per-lead activity counts (for grid button highlights) ─────────────────
    const [noteCounts,      setNoteCounts]      = useState({}); // { [leadId]: number }
    const [reminderCounts,  setReminderCounts]  = useState({}); // { [leadId]: number }

    // ── View mode: 'grid' (default) | 'kanban' ────────────────────────────────
    const [viewMode,      setViewMode]      = useState('grid');
    // Bumped whenever a lead is created/updated/deleted from the shared panels so
    // the Kanban knows to refresh.
    const [leadsVersion,  setLeadsVersion]  = useState(0);


    // ── Restore the saved view (grid/kanban) for the active collection ─────────
    useEffect(() => {
        if (!acctId || !selectedCollection) { setViewMode('grid'); return; }
        const saved = loadNested('view', acctId, selectedCollection);
        const next  = saved === 'kanban' ? 'kanban' : 'grid';
        setViewMode(next);
    }, [acctId, selectedCollection]);

    const setView = (mode) => {
        saveNested('view', acctId, selectedCollection, mode === 'grid' ? null : 'kanban');
        setViewMode(mode);
    };

    // ── Click-outside: close column selector ─────────────────────────────────
    useEffect(() => {
        const handler = (e) => {
            if (columnSelectorRef.current && !columnSelectorRef.current.contains(e.target)) {
                setShowColumnSelector(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // ── Track the grid viewport width (drives even-spread of columns) ─────────
    useEffect(() => {
        const el = gridScrollRef.current;
        if (!el) return;
        let frame = null;
        const update = () => {
            if (frame != null) return;
            frame = requestAnimationFrame(() => {
                frame = null;
                setGridViewportW(el.clientWidth);
            });
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => {
            ro.disconnect();
            if (frame != null) cancelAnimationFrame(frame);
        };
    }, [viewMode, isEditFormVisible, activityLead, isGridVisible]);

    // ── Responsive: hide grid when edit form open on small screens ────────────
    useEffect(() => {
        const check = () => setIsGridVisible(window.innerWidth > 768 ? true : !isEditFormVisible && !activityLead);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, [isEditFormVisible, activityLead]);

    // ── CALL 1: Fetch collection list ───────────────────────────────────────────
    const fetchCollections = useCallback(async () => {
        collectionsRequestRef.current?.abort();
        const generation = ++collectionsGenerationRef.current;
        if (!acctId) return;
        const controller = new AbortController();
        collectionsRequestRef.current = controller;
        setCollectionLoading(true);
        setCollectionsReady(false);
        resetPagination();
        try {
            const res  = await api.get('/api/ui/leads/collections', { params: { acctId }, signal: controller.signal });
            if (generation !== collectionsGenerationRef.current) return;
            const list = (res.data?.data || []).filter(c => c?._id && c?.collectionName);
            setCollections(list);

            const urlCatId = new URLSearchParams(window.location.search).get('collectionId');
            const stored   = loadSelectedCollection(acctId);
            const active   = list.find(c => c._id === urlCatId)
                          || list.find(c => c._id === stored)
                          || list.find(c => c.default)
                          || list[0];

            if (active) {
                setSelectedCollection(active._id);
                const params = new URLSearchParams(window.location.search);
                params.set('collectionId', active._id);
                navigate(`${window.location.pathname}?${params.toString()}`, { replace: true });
            }
            setCollectionsReady(true);
        } catch (err) {
            if (generation === collectionsGenerationRef.current && err.code !== 'ERR_CANCELED' && err.name !== 'CanceledError') setCollectionsReady(true);
        } finally {
            if (generation === collectionsGenerationRef.current) setCollectionLoading(false);
        }
    }, [acctId, resetPagination]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { fetchCollections(); }, [fetchCollections]);

    // ── CALL 2: Fetch column definitions for selected collection ────────────────
    const fetchColumnDefs = useCallback(async (collectionId) => {
        fieldsRequestRef.current?.abort();
        const generation = ++fieldsGenerationRef.current;
        if (!collectionId || !acctId) {
            columnDefsLoadingRef.current = false;
            return;
        }
        const controller = new AbortController();
        fieldsRequestRef.current = controller;
        // Mark loading synchronously (before any await) so fetchLeads can check
        // the ref in the same effects phase and avoid a stale duplicate fetch.
        columnDefsLoadingRef.current = true;
        setColumnDefsReady(false);
        try {
            const res  = await api.get(`/api/ui/leads/collections/${collectionId}/fields`, { params: { acctId }, signal: controller.signal });
            if (generation !== fieldsGenerationRef.current) return;
            const data = res.data?.data;
            if (!data) return;

            // Collection-defined fields (system + user), then trailing timestamp fields
            const catFields = (data.fields || []).map(f => f.field);
            const allFields = [...catFields, ...TRAILING_FIELDS];

            setColumnDefs(data.fields || []);
            setStages(data.stages || []);

            // Apply saved column order, then restore visibility
            // Always enforce TRAILING_FIELDS at the very end regardless of saved order
            const savedOrder = loadNested('colOrder', acctId, collectionId);
            const rawOrdered = applyColOrder(allFields, savedOrder);
            const ordered = [
                ...rawOrdered.filter(f => !TRAILING_FIELDS.includes(f)),
                ...TRAILING_FIELDS.filter(f => rawOrdered.includes(f))
            ];
            setFields(ordered);

            const savedVis = loadNested('colVis', acctId, collectionId);
            if (savedVis) {
                const valid = ordered.filter(f => savedVis.includes(f));
                setVisibleFields(valid.length > 0 ? valid : null);
            } else {
                setVisibleFields(null);
            }

            // Restore/init filter state for this collection
            const savedFilters = loadNested('filters', acctId, collectionId) || {};
            const initFilters  = {};
            allFields.forEach(f => { initFilters[f] = savedFilters[f] ?? null; });
            setFilters(initFilters);

            setColumnDefsReady(true);
        } catch (err) {
            if (generation === fieldsGenerationRef.current && err.code !== 'ERR_CANCELED' && err.name !== 'CanceledError') setColumnDefsReady(true);
        } finally {
            if (generation === fieldsGenerationRef.current) columnDefsLoadingRef.current = false;
        }
    }, [acctId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Trigger column defs fetch when collection selection changes
    useEffect(() => {
        fetchColumnDefs(selectedCollection);
        if (selectedCollection) setColWidths({});  // reset column widths on collection change
    }, [selectedCollection, fetchColumnDefs]);

    // ── CALL 3: Fetch lead data ───────────────────────────────────────────────
    const fetchLeads = useCallback(async () => {
        leadsRequestRef.current?.abort();
        countsRequestRef.current?.abort();
        const generation = ++leadsGenerationRef.current;
        countsGenerationRef.current += 1;
        // Only fetch for the grid view; kanban manages its own per-stage fetches.
        if (viewMode !== 'grid') {
            setLoading(false);
            return;
        }

        // columnDefsLoadingRef is set synchronously in fetchColumnDefs before any
        // await, preventing a duplicate fetch that would otherwise start before
        // columnDefsReady state has been cleared in the same effects phase.
        if (!isAccountLinked || !acctId || !collectionsReady || !columnDefsReady || columnDefsLoadingRef.current) {
            if (accountsLoaded && !accountsLoading && !isAccountLinked) setLoading(false);
            // Account is linked and the collection list has loaded, but there is no
            // collection to load leads for (e.g. a freshly linked account with none
            // created yet). Column defs never get fetched in that case, so stop here
            // and show the empty grid instead of spinning forever.
            if (isAccountLinked && collectionsReady && !selectedCollection) {
                setLeads([]);
                setTotalRecords(0);
                setHasNextPage(false);
                setLoading(false);
            }
            return;
        }

        const controller = new AbortController();
        leadsRequestRef.current = controller;
        setLoading(true);
        setError(null);
        try {
            // Build fieldFilters — only include active filters
            const activeFilters = {};
            for (const [key, def] of Object.entries(appliedFilters)) {
                if (key === 'collectionId') continue;
                if (isFilterActive(def)) activeFilters[key] = def;
            }
            // Preserve the stage's stored type for legacy numeric and custom IDs.
            if (stageFilter) {
                const selectedStage = stages.find(stage => String(stage.id) === String(stageFilter));
                activeFilters.stage = typeof selectedStage?.id === 'number'
                    ? { type: 'number', op: 'eq', value: selectedStage.id }
                    : { type: 'text', value: selectedStage?.id ?? stageFilter };
            }

            const params = {
                limit:    pageSize,
                acctId,
                ...(currentCursor != null && { cursor: currentCursor }),
                ...(selectedCollection  && { collectionId: selectedCollection }),
                ...(sortField         && { sortBy: sortField, sortOrder }),
                ...(Object.keys(activeFilters).length > 0 && { fieldFilters: JSON.stringify(activeFilters) }),
                ...(isSuperAdmin && responsibleFilter && { responsibleFilter })
            };

            const res = await api.get('/api/ui/leads', { params, signal: controller.signal });
            if (generation !== leadsGenerationRef.current) return;
            const normalized = {
                items: res.data.data,
                nextCursor: res.data.pageInfo.nextCursor,
                hasNext: res.data.pageInfo.hasNextPage,
                total: res.data.total,
            };
            const newLeads = normalized.items;
            setLeads(newLeads);
            setTotalRecords(normalized.total);
            setNextCursor(normalized.nextCursor);
            setHasNextPage(normalized.hasNext);
            // Fetch per-lead activity counts (non-blocking — 1 combined call, silent on error)
            if (newLeads.length && acctId) {
                const leadIds = newLeads.map(l => l._id);
                const countsController = new AbortController();
                countsRequestRef.current = countsController;
                const countsGeneration = ++countsGenerationRef.current;
                activityApi.batchCounts(leadIds, acctId, { signal: countsController.signal }).then(r => {
                    if (countsGeneration !== countsGenerationRef.current || generation !== leadsGenerationRef.current) return;
                    const d = r.data?.data || {};
                    setNoteCounts(d.notes || {});
                    setReminderCounts(d.reminders || {});
                }).catch(() => {});
            } else {
                setNoteCounts({});
                setReminderCounts({});
            }
        } catch (err) {
            if (generation === leadsGenerationRef.current && err.code !== 'ERR_CANCELED' && err.name !== 'CanceledError') {
                setError(err.message || 'Failed to fetch leads');
            }
        } finally {
            if (generation === leadsGenerationRef.current) setLoading(false);
        }
    }, [viewMode, currentPage, currentCursor, pageSize, sortField, sortOrder, appliedFilters, acctId, isAccountLinked, collectionsReady, columnDefsReady, selectedCollection, responsibleFilter, stageFilter, stages, isSuperAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { fetchLeads(); }, [fetchLeads]);

    useEffect(() => () => {
        collectionsRequestRef.current?.abort();
        fieldsRequestRef.current?.abort();
        leadsRequestRef.current?.abort();
        countsRequestRef.current?.abort();
    }, []);

    // ── Deep-link: open a specific lead's activity panel via URL params ───────
    // Triggered by push notification clicks and bell notification item clicks.
    // URL format: /leads?openLead={leadId}&tab=reminders|notes
    useEffect(() => {
        const params    = new URLSearchParams(location.search);
        const openLeadId = params.get('openLead');
        const tabParam   = params.get('tab');
        if (!openLeadId || !acctId) return;

        // Remove the params from the URL immediately so a refresh doesn't re-trigger
        const clean = new URLSearchParams(location.search);
        clean.delete('openLead');
        clean.delete('tab');
        navigate(`${location.pathname}${clean.toString() ? '?' + clean.toString() : ''}`, { replace: true });

        // Fetch the lead by ID and open its activity panel
        api.get(`/api/ui/leads/${openLeadId}`, { params: { acctId } })
            .then(res => {
                const lead = res.data?.data;
                if (lead) {
                    setActivityLead(lead);
                    setActivityTab(tabParam === 'notes' ? 'notes' : 'reminders');
                }
            })
            .catch(() => {
                // Non-fatal — lead may have been deleted or user doesn't have access
            });
    }, [location.search]); // eslint-disable-line react-hooks/exhaustive-deps


    // ── Collection change ───────────────────────────────────────────────────────
    const handleCollectionChange = (value) => {
        setSelectedCollection(value || '');
        saveSelectedCollection(acctId, value || null);
        const params = new URLSearchParams(location.search);
        if (value) params.set('collectionId', value); else params.delete('collectionId');
        navigate(`${location.pathname}?${params.toString()}`, { replace: true });
        setAppliedFilters(value ? { collectionId: value } : {});
        setStageFilter('');  // stages are collection-specific
        setNoteCounts({});
        setReminderCounts({});
        resetPagination();
        // Column defs + filters will reload via the selectedCollection effect
    };

    const handleSetDefault = async (collectionId) => {
        try {
            await api.put(`/api/ui/leads/collections/${collectionId}/default`, null, { params: { acctId } });
            setCollections(prev => prev.map(c => ({ ...c, default: c._id === collectionId })));
            showSuccess('Default collection updated.');
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to update default collection.');
        }
    };

    const handleDeleteCollectionConfirm = async () => {
        if (!deleteCollectionPending) return;
        setDeleteCollectionLoading(true);
        try {
            await api.delete(`/api/ui/leads/collections/${deleteCollectionPending._id}`, { params: { acctId } });
            showSuccess(`Collection "${deleteCollectionPending.collectionName}" deleted.`);
            const remaining = collections.filter(c => c._id !== deleteCollectionPending._id);
            setCollections(remaining);
            if (selectedCollection === deleteCollectionPending._id) {
                const next   = remaining.find(c => c.default) || remaining[0] || null;
                const nextId = next?._id || '';
                handleCollectionChange(nextId);
            }
            setDeleteCollectionPending(null);
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to delete collection.');
        } finally {
            setDeleteCollectionLoading(false);
        }
    };


    // ── Sort ──────────────────────────────────────────────────────────────────
    const handleSort = (field) => {
        if (sortField === field) {
            if (sortOrder === 'asc') setSortOrder('desc');
            else { setSortField(''); setSortOrder('asc'); }
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
        resetPagination();
    };

    const renderSortIcon = (field) => {
        if (sortField !== field) return (
            <svg className="absolute -right-4 w-3 h-3 text-indigo-400 opacity-0 group-hover/sort:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
        );
        return sortOrder === 'asc' ? (
            <svg className="absolute -right-4 w-3 h-3 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
        ) : (
            <svg className="absolute -right-4 w-3 h-3 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
        );
    };

    // ── Filters ───────────────────────────────────────────────────────────────
    const handleFilterChange = (field, value) => {
        setFilters(prev => ({ ...prev, [field]: value }));
    };

    const applyFilter = useCallback((field, value) => {
        if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
        setAppliedFilters(prev => {
            const updated = { ...prev };
            if (isFilterActive(value)) updated[field] = value;
            else delete updated[field];
            // Persist (excluding collectionId)
            const { collectionId: _c, ...toSave } = updated;
            saveNested('filters', acctId, selectedCollection, Object.keys(toSave).length > 0 ? toSave : null);
            return updated;
        });
        resetPagination();
    }, [acctId, selectedCollection, resetPagination]);

    const handleApplyFilters = useCallback(() => {
        for (const [field, value] of Object.entries(filters)) {
            applyFilter(field, value);
        }
    }, [filters, applyFilter]);

    const clearAllFilters = () => {
        const cleared = {};
        fields.forEach(f => { cleared[f] = null; });
        setFilters(cleared);
        saveNested('filters', acctId, selectedCollection, null);
        setAppliedFilters(prev => {
            const updated = {};
            if (prev.collectionId) updated.collectionId = prev.collectionId;
            return updated;
        });
        setResponsibleFilter('');
        setStageFilter('');
        resetPagination();
    };

    const activeFilterCount = Object.entries(appliedFilters)
        .filter(([k, v]) => k !== 'collectionId' && isFilterActive(v)).length
        + (isSuperAdmin && responsibleFilter ? 1 : 0)
        + (stageFilter ? 1 : 0);

    const hasAnyFilter = activeFilterCount > 0 ||
        Object.values(filters).some(v => isFilterActive(v));


    // ── Column drag-and-drop ──────────────────────────────────────────────────
    const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    const handleColResize = useCallback((field, width) => {
        setColWidths(prev => ({ ...prev, [field]: width }));
    }, []);

    const handleColumnDragStart = (e) => setActiveColId(e.active.id);
    const handleColumnDragEnd   = (e) => {
        setActiveColId(null);
        const { active, over } = e;
        if (!over || active.id === over.id) return;

        const current  = visibleFields ?? fields;
        const oldIndex = current.indexOf(active.id);
        const newIndex = current.indexOf(over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        const reordered = arrayMove(current, oldIndex, newIndex);
        setFields(prev => {
            const hidden = prev.filter(f => !current.includes(f));
            return [...reordered, ...hidden];
        });
        if (visibleFields) setVisibleFields(reordered);
        saveNested('colOrder', acctId, selectedCollection, reordered);
    };

    // ── Column visibility ─────────────────────────────────────────────────────
    const updateVisibleFields = (newVal) => {
        setVisibleFields(newVal);
        saveNested('colVis', acctId, selectedCollection, newVal);
    };


    // ── Add lead ──────────────────────────────────────────────────────────────
    const handleAdd = () => {
        setEditLead(null);
        const initialForm  = {};
        const editableKeys = fields.filter(f => !TRAILING_FIELDS.includes(f));
        editableKeys.forEach(f => { initialForm[f] = ''; });
        // Default a new lead to the collection's first stage (stages are pre-sorted by order).
        if (stages.length > 0) initialForm.stage = stages[0].id;
        // Default the assignee to the admin creating the lead (same idea as the default stage).
        if (editableKeys.includes('responsible') && currentUserId) initialForm.responsible = currentUserId;
        setEditFields(editableKeys);
        setEditForm(initialForm);
        setIsEditFormVisible(true);
    };

    // ── Edit lead ─────────────────────────────────────────────────────────────
    const handleEditOpen = (lead) => {
        // Toggle: clicking Edit again for the same lead closes the panel.
        if (isEditFormVisible && editLead?._id === lead._id) {
            setIsEditFormVisible(false);
            setEditLead(null);
            setEditFields([]);
            return;
        }
        // Close activity panel if open (panels are mutually exclusive)
        setActivityLead(null);
        setEditLead(lead);
        const editableKeys = fields.filter(f => !TRAILING_FIELDS.includes(f));
        const formData     = {};
        editableKeys.forEach(f => { formData[f] = lead[f] ?? ''; });
        // Stage is not a grid column — seed it explicitly for the StageSelect.
        if (stages.length > 0) formData.stage = lead.stage ?? '';
        setEditFields(editableKeys);
        setEditForm(formData);
        setIsEditFormVisible(true);
    };

    const handleEditSave = async (draft) => {
        setIsSaving(true);
        try {
            if (editLead) {
                await api.put(`/api/ui/leads/${editLead._id}`, draft, { params: { acctId } });
                showSuccess('Lead updated successfully.');
            } else {
                const activeCat    = collections.find(c => c._id === selectedCollection);
                const collectionName = activeCat?.collectionName;
                const url          = collectionName
                    ? `/api/ui/leads/${encodeURIComponent(collectionName)}`
                    : '/api/ui/leads';
                await api.post(url, { data: draft }, { params: { acctId } });
                showSuccess('Lead created successfully.');
            }
            setIsEditFormVisible(false);
            setEditLead(null);
            setEditFields([]);
            fetchLeads();
            setLeadsVersion(v => v + 1);
        } catch (err) {
            showError(err.response?.data?.message || (editLead ? 'Failed to update lead.' : 'Failed to create lead.'));
        } finally {
            setIsSaving(false);
        }
    };

    const cancelEdit = () => {
        setIsEditFormVisible(false);
        setEditLead(null);
        setEditFields([]);
    };

    // ── Activity panel (Notes / Reminders) ───────────────────────────────────
    const handleActivityOpen = (lead, tab = 'notes') => {
        // Toggle: clicking the same tab again for the same lead closes the panel.
        if (activityLead?._id === lead._id && activityTab === tab) {
            setActivityLead(null);
            return;
        }
        setActivityLead(lead);
        setActivityTab(tab);
        // Close edit form if open (panels are mutually exclusive)
        if (isEditFormVisible) {
            setIsEditFormVisible(false);
            setEditLead(null);
            setEditFields([]);
        }
    };


    // ── Delete lead ───────────────────────────────────────────────────────────
    const handleDeleteOpen    = (id)  => { setDeleteLeadId(id); setIsDeleteOpen(true); };
    const handleDeleteConfirm = async () => {
        if (!deleteLeadId) return;
        try {
            await api.delete(`/api/ui/leads/${deleteLeadId}`, { params: { acctId } });
            showSuccess('Lead deleted successfully.');
            setIsDeleteOpen(false);
            setDeleteLeadId(null);
            fetchLeads();
            setLeadsVersion(v => v + 1);
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to delete lead.');
        }
    };


    // ── Pagination ────────────────────────────────────────────────────────────
    const goToNextPage = () => {
        if (!hasNextPage || loading) return;
        setCursorHistory(prev => [...prev, { cursor: currentCursor, page: currentPage }]);
        setCurrentCursor(nextCursor);
        setCurrentPage(prev => prev + 1);
    };

    const goToPreviousPage = () => {
        if (!cursorHistory.length || loading) return;
        const previous = cursorHistory[cursorHistory.length - 1];
        setCursorHistory(prev => prev.slice(0, -1));
        setCurrentCursor(previous.cursor);
        setCurrentPage(previous.page);
    };


    // ── Asynchronous CSV export ───────────────────────────────────────────────
    const handleExport = async () => {
        exportAbortRef.current?.abort();
        const controller = new AbortController();
        exportAbortRef.current = controller;
        setIsExporting(true);
        try {
            const activeFilters = {};
            for (const [k, v] of Object.entries(appliedFilters)) {
                if (k !== 'collectionId' && isFilterActive(v)) activeFilters[k] = v;
            }
            const exportFields = fields.length > 0
                ? fields.filter(f => !EXCLUDE_FROM_GRID.has(f))
                : columnDefs.map(definition => definition.field).filter(f => !EXCLUDE_FROM_GRID.has(f));
            if (!selectedCollection || exportFields.length === 0) {
                showError('Select a collection with exportable fields first.');
                return;
            }

            const createResponse = await api.post('/api/ui/exports', {
                collectionId: selectedCollection,
                fields: exportFields.map(field => ({
                    field,
                    label: columnDefMap.get(field)?.label || SYSTEM_LABELS[field] || field
                })),
                ...(sortField && { sortBy: sortField, sortOrder }),
                ...(Object.keys(activeFilters).length > 0 && { fieldFilters: JSON.stringify(activeFilters) })
            }, { params: { acctId }, signal: controller.signal });
            const exportId = createResponse.data?.data?.id;
            if (!exportId) throw new Error('The export could not be queued.');
            setActiveExportId(exportId);
            showSuccess('Export queued. It will download automatically when ready.');

            let exportState = createResponse.data.data;
            while (['queued', 'running'].includes(exportState.status)) {
                await new Promise(resolve => setTimeout(resolve, 1500));
                const statusResponse = await api.get(`/api/ui/exports/${exportId}`, { params: { acctId }, signal: controller.signal });
                exportState = statusResponse.data?.data;
            }
            if (exportState.status === 'cancelled') return;
            if (exportState.status !== 'completed') {
                throw new Error(exportState.error || 'Export failed.');
            }

            const download = await api.get(`/api/ui/exports/${exportId}/download`, {
                params: { acctId }, responseType: 'blob', timeout: 120000, signal: controller.signal
            });
            const fileName = exportState.fileName || `leads_${new Date().toISOString().slice(0, 10)}.csv`;
            const blob = download.data;
            const url      = URL.createObjectURL(blob);
            const a        = document.createElement('a');
            a.href = url; a.download = fileName;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
            showSuccess(`Exported ${exportState.processedRows ?? 0} lead(s) to ${fileName}`);
        } catch (err) {
            if (!controller.signal.aborted && err?.response?.status !== 409) {
                showError(err.response?.data?.message || err.message || 'Failed to export leads.');
            }
        } finally {
            if (exportAbortRef.current === controller) {
                exportAbortRef.current = null;
                setActiveExportId(null);
                setIsExporting(false);
            }
        }
    };

    const cancelExport = async () => {
        if (!activeExportId) return;
        try {
            await api.delete(`/api/ui/exports/${activeExportId}`, { params: { acctId } });
            exportAbortRef.current?.abort();
            exportAbortRef.current = null;
            setActiveExportId(null);
            setIsExporting(false);
            showSuccess('Export cancelled.');
        } catch (err) {
            showError(err.response?.data?.message || 'Unable to cancel export.');
        }
    };


    // ── Row cell renderer ─────────────────────────────────────────────────────
    const renderCell = (field, lead) => {
        const colDef = columnDefMap.get(field);
        const raw    = lead[field];
        const display = formatValue(colDef, raw);
        // Fixed-width columns: clip overflow with an ellipsis (and a hover tooltip
        // via title) so long values never bleed into the neighbouring column.
        const titleText = (raw === null || raw === undefined || typeof raw === 'object') ? undefined : String(raw);
        return (
            <td
                key={field}
                title={titleText}
                className="px-3 py-2 whitespace-nowrap overflow-hidden text-ellipsis text-[11px] text-gray-900 font-medium text-center"
            >
                {display}
            </td>
        );
    };

    /**
     * Responsible (assignee) cell — pinned as the first column. The whole cell
     * background is painted with a stable colour seeded on the assignee's name.
     * Falls back to the snapshot name ("adminName" = 'Unknown' when an assigned
     * admin has been removed).
     */
    const renderResponsibleCell = (lead) => {
        const assigned = !!lead.responsible;
        const name     = lead.adminName || (assigned ? 'Unknown' : '');
        const imgUrl   = lead.adminProfileImage || null;
        const baseColor = assigned ? twoLetterColor(name) : null;
        return (
            <td
                className="px-3 py-2 whitespace-nowrap text-[11px] font-medium sticky left-0 z-10 transition-colors"
                style={{
                    width: RESP_PIN_W,
                    minWidth: RESP_PIN_W,
                    boxShadow: '4px 0 8px -2px rgba(0,0,0,0.06)',
                    backgroundColor: '#ffffff'
                }}
            >
                {assigned ? (
                    <div
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: tint(baseColor, 0.28) }}
                    >
                        {imgUrl ? (
                            <img src={imgUrl} alt="" loading="lazy" decoding="async" className="w-4 h-4 rounded-full object-cover border border-white/70" onError={e => { e.target.style.display = 'none'; }} />
                        ) : (
                            <span className="w-4 h-4 rounded-full flex items-center justify-center text-white font-bold text-[8px] select-none" style={{ backgroundColor: baseColor }}>
                                {name.charAt(0).toUpperCase()}
                            </span>
                        )}
                        <span className="truncate text-gray-800">{name}</span>
                    </div>
                ) : (
                    <span className="text-gray-400">Unassigned</span>
                )}
            </td>
        );
    };

    /**
     * Stage cell — pinned immediately after Responsible. Uses the admin-chosen
     * stage colour (from stageMap), tinted for the pill background, mirroring the
     * Responsible pill treatment. Guards against an unknown/missing stage id.
     */
    const renderStageCell = (lead, left) => {
        const stage = stageMap.get(lead.stage);
        return (
            <td
                className="px-3 py-2 whitespace-nowrap text-[11px] font-medium sticky z-10 transition-colors"
                style={{ left, width: STAGE_PIN_W, minWidth: STAGE_PIN_W, boxShadow: '4px 0 8px -2px rgba(0,0,0,0.06)', backgroundColor: '#ffffff' }}
            >
                {stage ? (
                    <div className="inline-flex max-w-full items-center gap-2" title={stage.name}>
                        <span className="relative h-5 w-5 shrink-0" aria-hidden="true">
                            <span className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-slate-200" />
                            <span
                                className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border-2 border-white shadow-[0_0_0_1px_rgba(15,23,42,0.08)]"
                                style={{ backgroundColor: stage.color }}
                            />
                        </span>
                        <span className="truncate text-[11px] font-semibold text-slate-600">{stage.name}</span>
                    </div>
                ) : (
                    <span className="text-gray-400">—</span>
                )}
            </td>
        );
    };

    const displayFields = visibleFields ?? fields;
    // Responsible and Stage are rendered as dedicated pinned-left columns, never
    // inside the draggable/sortable set.
    const hasResponsibleCol = displayFields.includes('responsible');
    const hasStageCol = stages.length > 0;
    const gridFields = hasResponsibleCol ? displayFields.filter(f => f !== 'responsible') : displayFields;
    // Pinned-column geometry: Responsible sits at left:0, Stage immediately after it.
    const STAGE_LEFT = hasResponsibleCol ? RESP_PIN_W : 0;

    // ── Even-spread the data columns when they don't fill the viewport ─────────
    // With table-layout:fixed the columns keep their pixel widths, so a handful of
    // narrow columns would sit left-aligned with empty space on the right. We
    // measure the visible grid width and share any leftover space equally across
    // the data columns so they fill the width.
    const colBaseWidth = (field) => colWidths[field] || defaultColumnWidth(columnDefMap.get(field), field);
    const extraPerCol = React.useMemo(() => {
        if (!gridViewportW || gridFields.length === 0) return 0;
        const pinned = (hasResponsibleCol ? RESP_PIN_W : 0) + (hasStageCol ? STAGE_PIN_W : 0) + ACTIONS_COL_W;
        const dataTotal = gridFields.reduce((sum, f) => sum + colBaseWidth(f), 0);
        const leftover = gridViewportW - pinned - dataTotal;
        return leftover > 0 ? Math.floor(leftover / gridFields.length) : 0;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gridViewportW, gridFields, colWidths, columnDefMap, hasResponsibleCol, hasStageCol]);


    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="h-full w-full min-w-0 flex flex-col bg-gray-50 overflow-hidden relative">
            <LoadingMask
                loading={isExporting}
                title="Preparing export..."
                message="The server is creating a bounded CSV export in the background."
                actionLabel={activeExportId ? 'Cancel export' : undefined}
                onAction={activeExportId ? cancelExport : undefined}
            />
            <AppNavbar activePage="leads" firedCount={firedCount} setFiredCount={setFiredCount} />

            <div className="flex-1 min-w-0 overflow-hidden flex flex-col px-3 sm:px-4 py-3 relative">

                {/* No account linked */}
                {accountsLoaded && !accountsLoading && !isAccountLinked && (
                    <div className="flex-1 flex flex-col items-center justify-center animate-fade-in">
                        <div className="bg-white border border-gray-200 rounded-xl shadow-xl px-8 py-10 text-center max-w-sm">
                            <div className="w-14 h-14 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-7 h-7 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                </svg>
                            </div>
                            <h2 className="text-lg font-bold text-gray-900 mb-2">No Account Linked</h2>
                            <p className="text-xs text-gray-500 mb-5">Link a business account to view and manage leads.</p>
                            <Button onClick={() => setIsLinkDialogOpen(true)}>Link Account</Button>
                        </div>
                    </div>
                )}

                {isAccountLinked && (
                    <div className="flex-1 min-w-0 flex flex-col min-h-0 animate-fade-in">

                        {/* ── Toolbar ─────────────────────────────────────────── */}
                        <div className="mb-3 flex-shrink-0 flex items-center justify-start gap-1 flex-wrap">

                            {/* Group 1: Collection */}
                            <div className="flex items-center gap-1.5">
                                <CollectionSelectDropdown
                                    collections={collections}
                                    value={selectedCollection || null}
                                    onChange={val => handleCollectionChange(val || '')}
                                    onCreate={() => navigate('/settings')}
                                    disabled={collectionLoading || !acctId}
                                />
                                {selectedCollection && isSuperAdmin && (() => {
                                    const activeCat = collections.find(c => c._id === selectedCollection);
                                    return activeCat ? (
                                        <Tooltip content={`Delete collection "${activeCat.collectionName}"`} placement="top">
                                            <button
                                                onClick={() => setDeleteCollectionPending(activeCat)}
                                                className="group relative w-8 h-8 flex items-center justify-center bg-transparent rounded-lg hover:bg-red-50 transition-all duration-300 hover:scale-110 border border-gray-300 hover:border-red-400 focus:ring-1 focus:ring-red-300"
                                            >
                                                <svg className="w-4 h-4 text-gray-600 group-hover:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </Tooltip>
                                    ) : null;
                                })()}
                            </div>

                            <div className="w-px h-6 bg-gray-200 mx-1.5" />

                            {/* Group 1b: Responsible filter — superadmins only */}
                            {isSuperAdmin && adminsList.length > 0 && (
                                <>
                                    <ResponsibleFilterDropdown
                                        admins={adminsList}
                                        value={responsibleFilter}
                                        onChange={(v) => { setResponsibleFilter(v); resetPagination(); }}
                                    />
                                    <div className="w-px h-6 bg-gray-200 mx-1.5" />
                                </>
                            )}

                            {/* Group 1c: Stage filter — available to all users (grid view only) */}
                            {hasStageCol && viewMode === 'grid' && (
                                <>
                                    <StageFilterDropdown
                                        stages={stages}
                                        value={stageFilter}
                                        onChange={(v) => { setStageFilter(v); resetPagination(); }}
                                    />
                                    <div className="w-px h-6 bg-gray-200 mx-1.5" />
                                </>
                            )}

                            {/* Group 2a: Filter controls */}
                            <div className="flex items-center gap-1.5">
                                <Tooltip content="Filter columns" placement="top">
                                    <button
                                        onClick={() => setShowFilterPopup(true)}
                                        disabled={fields.length === 0}
                                        className={`group relative w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-300 hover:scale-110 border focus:ring-1 disabled:opacity-40 disabled:cursor-not-allowed ${activeFilterCount > 0 ? 'bg-indigo-50 border-indigo-400 focus:ring-indigo-300' : 'bg-transparent border-gray-300 hover:bg-indigo-50 hover:border-indigo-400 focus:ring-indigo-300'}`}
                                    >
                                        <svg className={`w-4 h-4 transition-colors ${activeFilterCount > 0 ? 'text-indigo-600' : 'text-gray-600 group-hover:text-indigo-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                                        </svg>
                                        {activeFilterCount > 0 && (
                                            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-indigo-600 rounded-full text-white text-[8px] flex items-center justify-center font-bold">{activeFilterCount}</span>
                                        )}
                                    </button>
                                </Tooltip>
                                <Tooltip content={activeFilterCount > 0 ? `Clear ${activeFilterCount} filter(s)` : 'No active filters'} placement="top">
                                    <button
                                        onClick={clearAllFilters}
                                        disabled={loading || activeFilterCount === 0}
                                        className={`group relative w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-300 hover:scale-110 border focus:ring-1 disabled:opacity-40 disabled:cursor-not-allowed ${activeFilterCount > 0 ? 'bg-red-50 border-red-400 focus:ring-red-300' : 'bg-transparent border-gray-300 hover:bg-red-50 hover:border-red-400 focus:ring-red-300'}`}
                                    >
                                        <svg className={`w-4 h-4 transition-colors ${activeFilterCount > 0 ? 'text-red-500' : 'text-gray-600 group-hover:text-red-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12" />
                                        </svg>
                                    </button>
                                </Tooltip>
                            </div>

                            <div className="w-px h-6 bg-gray-200 mx-1.5" />

                            {/* Group 2b: Sort controls */}
                            <div className="flex items-center gap-1.5">
                                <Tooltip content={sortField ? `Clear sort: ${sortField} (${sortOrder})` : 'No active sort'} placement="top">
                                    <button
                                        onClick={() => { setSortField(''); setSortOrder('asc'); resetPagination(); }}
                                        disabled={loading || !sortField}
                                        className={`group relative w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-300 hover:scale-110 border focus:ring-1 disabled:opacity-40 disabled:cursor-not-allowed ${sortField ? 'bg-orange-50 border-orange-400 focus:ring-orange-300' : 'bg-transparent border-gray-300 hover:bg-orange-50 hover:border-orange-400 focus:ring-orange-300'}`}
                                    >
                                        <svg className={`w-4 h-4 transition-colors ${sortField ? 'text-orange-500' : 'text-gray-600 group-hover:text-orange-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6h18M7 12h10M11 18h2" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12" />
                                        </svg>
                                    </button>
                                </Tooltip>
                                <Tooltip content={loading ? 'Loading...' : 'Refresh'} placement="top">
                                    <button
                                        onClick={() => { fetchLeads(); setLeadsVersion(v => v + 1); }}
                                        disabled={loading}
                                        className="group relative w-8 h-8 flex items-center justify-center bg-transparent rounded-lg hover:bg-indigo-50 transition-all duration-300 hover:scale-110 border border-gray-300 hover:border-indigo-400 focus:ring-1 focus:ring-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <svg className={`w-4 h-4 text-gray-700 group-hover:text-gray-900 transition-colors ${loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </button>
                                </Tooltip>
                            </div>

                            <div className="w-px h-6 bg-gray-200 mx-1.5" />

                            {/* Group 3: Column selector */}
                            {fields.length > 0 && (
                                <div className="relative" ref={columnSelectorRef}>
                                    <Tooltip content="Show / hide columns" placement="top">
                                        <button
                                            onClick={() => setShowColumnSelector(v => !v)}
                                            className={`group relative w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-300 hover:scale-110 border focus:ring-1 focus:ring-violet-400 ${(visibleFields !== null && visibleFields.length !== fields.length) || showColumnSelector ? 'bg-violet-50 border-violet-400' : 'bg-transparent border-gray-300 hover:bg-violet-50 hover:border-violet-400'}`}
                                        >
                                            <svg className={`w-4 h-4 transition-colors ${(visibleFields !== null && visibleFields.length !== fields.length) || showColumnSelector ? 'text-violet-600' : 'text-gray-600 group-hover:text-violet-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 6h18M3 14h18M3 18h18" />
                                            </svg>
                                            {visibleFields !== null && visibleFields.length !== fields.length && (
                                                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-violet-600 rounded-full text-white text-[8px] flex items-center justify-center font-bold">{visibleFields.length}</span>
                                            )}
                                        </button>
                                    </Tooltip>

                                    {showColumnSelector && (
                                        <div className="absolute left-0 mt-1 w-52 bg-white rounded-lg shadow-2xl border border-gray-200 z-50">
                                            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                                                <span className="text-[11px] font-semibold text-gray-700 uppercase tracking-wide">Columns</span>
                                                <div className="flex gap-2">
                                                    <button onClick={() => updateVisibleFields(null)} className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold">All</button>
                                                    <span className="text-gray-300 text-[10px]">|</span>
                                                    <button onClick={() => updateVisibleFields(fields.slice(0, 1))} className="text-[10px] text-gray-400 hover:text-gray-700 font-semibold">None</button>
                                                </div>
                                            </div>
                                            <div className="max-h-64 overflow-y-auto py-1">
                                                {fields.map(field => {
                                                    const colDef  = columnDefMap.get(field);
                                                    const label   = colDef?.label || SYSTEM_LABELS[field] || field;
                                                    const checked = visibleFields === null || visibleFields.includes(field);
                                                    return (
                                                        <label key={field} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                                                            <input type="checkbox" checked={checked} onChange={() => {
                                                                const current = visibleFields ?? fields;
                                                                const next = current.includes(field)
                                                                    ? (current.length > 1 ? current.filter(f => f !== field) : current)
                                                                    : fields.filter(f => current.includes(f) || f === field);
                                                                updateVisibleFields(next);
                                                            }} className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer flex-shrink-0" />
                                                            <span className="text-[11px] text-gray-700 font-medium truncate">{label}</span>
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="w-px h-6 bg-gray-200 mx-1.5" />

                            {/* Group 4: Output */}
                            <div className="flex items-center gap-1.5">
                                <Tooltip content={isExporting ? 'Cancel export' : 'Export leads to CSV'} placement="top">
                                    <button
                                        onClick={isExporting ? cancelExport : handleExport}
                                        disabled={loading || (isExporting && !activeExportId)}
                                        className="group relative w-8 h-8 flex items-center justify-center bg-transparent rounded-lg hover:bg-emerald-50 transition-all duration-300 hover:scale-110 border border-gray-300 hover:border-emerald-500 focus:ring-1 focus:ring-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {isExporting ? (
                                            <svg className="w-4 h-4 text-emerald-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                        ) : (
                                            <svg className="w-4 h-4 text-gray-600 group-hover:text-emerald-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                                            </svg>
                                        )}
                                    </button>
                                </Tooltip>
                            </div>

                            <div className="w-px h-6 bg-gray-200 mx-1.5" />

                            {/* Group 5: Primary action */}
                            <Tooltip content="Add New Lead" placement="top">
                                <Button size="sm" onClick={handleAdd} disabled={loading || fields.length === 0}>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add Lead
                                </Button>
                            </Tooltip>

                            {/* Group 6: View toggle (Grid ⇄ Kanban) — segmented control,
                                pinned to the far right. */}
                            {hasStageCol && (
                                <div className="ml-auto inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-gray-100 border border-gray-200">
                                    <Tooltip content="Grid view" placement="top">
                                        <button
                                            onClick={() => setView('grid')}
                                            aria-pressed={viewMode === 'grid'}
                                            className={`relative w-8 h-7 flex items-center justify-center rounded-md transition-all duration-200 ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            {/* Grid / table icon — 2×2 cells */}
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" strokeWidth={2} />
                                                <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" strokeWidth={2} />
                                                <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" strokeWidth={2} />
                                                <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" strokeWidth={2} />
                                            </svg>
                                        </button>
                                    </Tooltip>
                                    <Tooltip content="Kanban view" placement="top">
                                        <button
                                            onClick={() => setView('kanban')}
                                            aria-pressed={viewMode === 'kanban'}
                                            className={`relative w-8 h-7 flex items-center justify-center rounded-md transition-all duration-200 ${viewMode === 'kanban' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            {/* Kanban / columns icon */}
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h3a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM15 5a1 1 0 011-1h3a1 1 0 011 1v9a1 1 0 01-1 1h-3a1 1 0 01-1-1V5z" />
                                            </svg>
                                        </button>
                                    </Tooltip>
                                </div>
                            )}
                        </div>

                        {/* ── Split panel: Table + Edit form ──────────────── */}
                        <div className="flex flex-col sm:flex-row gap-4 transition-all duration-300 flex-1 min-h-0 min-w-0 w-full" style={{ alignItems: 'stretch' }}>

                            {/* LEFT — Table (grid) or Kanban board, crossfaded */}
                            {isGridVisible && (
                                <div className={`transition-all duration-300 flex flex-col min-h-0 min-w-0 ${(isEditFormVisible || activityLead) ? 'w-full sm:w-[calc(66.666%-0.5rem)]' : 'w-full'}`}>
                                  {/* GRID layer — kept mounted; toggled with the Kanban layer */}
                                  <div className={`${viewMode === 'grid' ? 'flex view-enter-grid' : 'hidden'} flex-col flex-1 min-h-0`}>
                                    <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-white rounded-lg shadow-2xl border border-gray-200">
                                        {error && (
                                            <div className="bg-indigo-50 border-l-4 border-indigo-500 text-indigo-900 px-3 py-2 m-3 rounded-lg flex items-center justify-between gap-2">
                                                <span className="text-xs font-medium flex items-center gap-2">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                    Error: {error}
                                                </span>
                                                <button onClick={fetchLeads} className="text-xs font-medium underline hover:text-black">Try Again</button>
                                            </div>
                                        )}

                                        <div ref={gridScrollRef} className="flex-1 overflow-y-scroll overflow-x-auto min-h-0">
                                            <table className="min-w-full divide-y divide-gray-200" style={{ tableLayout: 'fixed' }}>
                                                <thead className="sticky top-0 z-20 bg-white/70 backdrop-blur-xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] transition-all group/header">
                                                    <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragStart={handleColumnDragStart} onDragEnd={handleColumnDragEnd}>
                                                        <SortableContext items={gridFields} strategy={horizontalListSortingStrategy}>
                                                            <tr>
                                                                {hasResponsibleCol && (
                                                                    <th className="px-3 py-2.5 text-left align-middle sticky left-0 z-30 bg-white/90 backdrop-blur-xl" style={{ width: RESP_PIN_W, minWidth: RESP_PIN_W, boxShadow: '4px 0 8px -2px rgba(0,0,0,0.08)' }}>
                                                                        <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                                                                            <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                                                                <circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
                                                                                <path d="M3.5 13c.35-2.35 2.05-3.75 4.5-3.75s4.15 1.4 4.5 3.75" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                                                                            </svg>
                                                                            Responsible
                                                                        </span>
                                                                    </th>
                                                                )}
                                                                {hasStageCol && (
                                                                    <th className="px-3 py-2.5 text-left align-middle sticky z-30 bg-white/90 backdrop-blur-xl" style={{ left: STAGE_LEFT, width: STAGE_PIN_W, minWidth: STAGE_PIN_W, boxShadow: '4px 0 8px -2px rgba(0,0,0,0.08)' }}>
                                                                        <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">
                                                                            <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                                                                <path d="M2 8h12M5 5l3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                                                                            </svg>
                                                                            Stage
                                                                        </span>
                                                                    </th>
                                                                )}
                                                                {gridFields.map(field => {
                                                                    const colDef = columnDefMap.get(field);
                                                                    const label  = colDef?.label || SYSTEM_LABELS[field] || field;
                                                                    return (
                                                                        <SortableColumnHeader
                                                                            key={field}
                                                                            field={field}
                                                                            label={label}
                                                                            renderSortIcon={renderSortIcon}
                                                                            handleSort={handleSort}
                                                                            isColFilterActive={isFilterActive(appliedFilters[field])}
                                                                            isDragging={activeColId !== null}
                                                                            width={colBaseWidth(field) + extraPerCol}
                                                                            onResize={handleColResize}
                                                                        />
                                                                    );
                                                                })}
                                                                <th className="px-3 py-2.5 text-center w-20 align-middle sticky right-0 z-30 bg-white/80 backdrop-blur-xl" style={{ boxShadow: '-4px 0 8px -2px rgba(0,0,0,0.08)' }}>
                                                                    <div className="flex items-center justify-center gap-1">
                                                                        <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Actions</span>
                                                                    </div>
                                                                </th>
                                                            </tr>
                                                        </SortableContext>
                                                        <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
                                                            {activeColId ? (
                                                                <DragOverlayColumnHeader
                                                                    field={activeColId}
                                                                    label={columnDefMap.get(activeColId)?.label || SYSTEM_LABELS[activeColId] || activeColId}
                                                                />
                                                            ) : null}
                                                        </DragOverlay>
                                                    </DndContext>
                                                    <tr><th colSpan="100" className="p-0 h-[3px] bg-gradient-to-r from-indigo-500 via-violet-400 to-indigo-500 border-none shadow-[0_0_15px_rgba(99,102,241,0.6)] relative z-20" /></tr>
                                                </thead>
                                                <tbody className={`bg-white divide-y divide-gray-100 transition-opacity duration-200 ${loading && leads.length > 0 ? 'opacity-50 pointer-events-none' : ''}`}>
                                                    {loading && leads.length === 0 ? (
                                                        <tr><td colSpan={displayFields.length + 1 + (hasStageCol ? 1 : 0)} className="px-3 py-6 text-center">
                                                            <div className="flex flex-col justify-center items-center gap-2">
                                                                <div className="relative">
                                                                    <div className="animate-spin rounded-full h-8 w-8 border-4 border-gray-300" />
                                                                    <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent absolute top-0" />
                                                                </div>
                                                                <span className="text-gray-600 text-xs font-medium">Loading leads...</span>
                                                            </div>
                                                        </td></tr>
                                                    ) : leads.length === 0 ? (
                                                        <tr><td colSpan={displayFields.length + 1 + (hasStageCol ? 1 : 0)} className="px-3 py-6 text-center">
                                                            <div className="flex flex-col items-center gap-2">
                                                                <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" /></svg>
                                                                <span className="text-gray-500 text-xs font-medium">No leads found</span>
                                                            </div>
                                                        </td></tr>
                                                    ) : (
                                                        leads.map((lead, idx) => (
                                                            <tr key={lead._id} className="group hover:bg-gray-50 transition-all duration-200" style={{ animationDelay: `${idx * 50}ms` }}>
                                                                {hasResponsibleCol && renderResponsibleCell(lead)}
                                                                {hasStageCol && renderStageCell(lead, STAGE_LEFT)}
                                                                {gridFields.map(field => renderCell(field, lead))}
                                                                <td className="px-3 py-2 whitespace-nowrap text-center sticky right-0 z-10 bg-white group-hover:bg-gray-50 transition-colors" style={{ boxShadow: '-4px 0 8px -2px rgba(0,0,0,0.06)' }}>
                                                                     <div className="flex items-center justify-center gap-1.5">
                                                                        <Tooltip content="Edit lead" placement="top">
                                                                            <button onClick={() => handleEditOpen(lead)} className="group relative w-6 h-6 flex items-center justify-center bg-transparent rounded-md hover:bg-blue-50 transition-all duration-200 hover:scale-110 border border-gray-300 hover:border-blue-300 focus:ring-1 focus:ring-blue-300">
                                                                                <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                                            </button>
                                                                        </Tooltip>
                                                                        <Tooltip content="Notes" placement="top">
                                                                            <button
                                                                                onClick={() => handleActivityOpen(lead, 'notes')}
                                                                                className={`group relative w-6 h-6 flex items-center justify-center bg-transparent rounded-md transition-all duration-200 hover:scale-110 border focus:ring-1 focus:ring-indigo-300 ${activityLead?._id === lead._id && activityTab === 'notes' ? 'bg-indigo-100 border-indigo-400' : noteCounts[lead._id] > 0 ? 'bg-indigo-50 border-indigo-300' : 'border-gray-300 hover:bg-indigo-50 hover:border-indigo-300'}`}
                                                                            >
                                                                                <svg className={`w-3.5 h-3.5 transition-colors ${activityLead?._id === lead._id && activityTab === 'notes' ? 'text-indigo-600' : noteCounts[lead._id] > 0 ? 'text-indigo-400' : 'text-gray-400 group-hover:text-indigo-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                                </svg>
                                                                                {noteCounts[lead._id] > 0 && (
                                                                                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-indigo-600 rounded-full text-white text-[8px] flex items-center justify-center font-bold pointer-events-none">
                                                                                        {noteCounts[lead._id] > 9 ? '9+' : noteCounts[lead._id]}
                                                                                    </span>
                                                                                )}
                                                                            </button>
                                                                        </Tooltip>
                                                                        <Tooltip content="Reminders" placement="top">
                                                                            <button
                                                                                onClick={() => handleActivityOpen(lead, 'reminders')}
                                                                                className={`group relative w-6 h-6 flex items-center justify-center bg-transparent rounded-md transition-all duration-200 hover:scale-110 border focus:ring-1 focus:ring-amber-300 ${activityLead?._id === lead._id && activityTab === 'reminders' ? 'bg-amber-100 border-amber-400' : reminderCounts[lead._id] > 0 ? 'bg-amber-50 border-amber-300' : 'border-gray-300 hover:bg-amber-50 hover:border-amber-300'}`}
                                                                            >
                                                                                <svg className={`w-3.5 h-3.5 transition-colors ${activityLead?._id === lead._id && activityTab === 'reminders' ? 'text-amber-600' : reminderCounts[lead._id] > 0 ? 'text-amber-400' : 'text-gray-400 group-hover:text-amber-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                                                                </svg>
                                                                                {reminderCounts[lead._id] > 0 && (
                                                                                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 rounded-full text-white text-[8px] flex items-center justify-center font-bold pointer-events-none">
                                                                                        {reminderCounts[lead._id] > 9 ? '9+' : reminderCounts[lead._id]}
                                                                                    </span>
                                                                                )}
                                                                            </button>
                                                                        </Tooltip>
                                                                        {/* Deleting a lead is restricted to super admins */}
                                                                        {isSuperAdmin && (
                                                                            <Tooltip content="Delete lead" placement="top">
                                                                                <button onClick={() => handleDeleteOpen(lead._id)} className="group relative w-6 h-6 flex items-center justify-center bg-transparent rounded-md hover:bg-red-50 transition-all duration-200 hover:scale-110 border border-gray-300 hover:border-red-300 focus:ring-1 focus:ring-red-300">
                                                                                    <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                                                </button>
                                                                            </Tooltip>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Pagination */}
                                        <div className="flex-shrink-0 bg-gray-50 px-3 py-2 flex items-center justify-between border-t border-gray-200">
                                            <div className="hidden sm:flex flex-1 items-center justify-between">
                                                <p className="text-xs text-gray-700 font-medium">
                                                    Page <span className="font-bold text-indigo-700">{currentPage}</span>
                                                    {' · '}Showing <span className="font-bold text-indigo-700">{leads.length}</span> lead(s)
                                                    {totalRecords != null && <>{' · '}<span className="font-bold text-indigo-700">{totalRecords}</span> total</>}
                                                </p>
                                                <nav className="inline-flex rounded shadow-sm -space-x-px">
                                                    <button onClick={goToPreviousPage} disabled={!cursorHistory.length || loading} className="inline-flex items-center px-2 py-1 rounded-l border border-indigo-200 bg-white text-xs text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed">Previous</button>
                                                    <span className="inline-flex items-center px-3 py-1 border-y border-indigo-200 bg-indigo-50 text-xs font-semibold text-indigo-700">{currentPage}</span>
                                                    <button onClick={goToNextPage} disabled={!hasNextPage || loading} className="inline-flex items-center px-2 py-1 rounded-r border border-indigo-200 bg-white text-xs text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
                                                </nav>
                                            </div>
                                            {/* Mobile pagination */}
                                            <div className="flex sm:hidden flex-1 justify-between">
                                                <button onClick={goToPreviousPage} disabled={!cursorHistory.length || loading} className="inline-flex items-center px-2 py-1 border border-indigo-200 text-xs rounded text-indigo-600 bg-white hover:bg-indigo-50 disabled:opacity-50">Previous</button>
                                                <span className="text-xs font-semibold text-indigo-700 self-center">Page {currentPage}</span>
                                                <button onClick={goToNextPage} disabled={!hasNextPage || loading} className="ml-2 inline-flex items-center px-2 py-1 border border-indigo-200 text-xs rounded text-indigo-600 bg-white hover:bg-indigo-50 disabled:opacity-50">Next</button>
                                            </div>
                                        </div>
                                    </div>
                                  </div>
                                  {/* Unmount the board when hidden so pages and requests are released. */}
                                  {viewMode === 'kanban' && (
                                    <div className="flex view-enter-kanban flex-col flex-1 min-h-0">
                                        <LeadsKanban
                                            acctId={acctId}
                                            acctNo={acctNo}
                                            collectionId={selectedCollection}
                                            stages={stages}
                                            setStages={setStages}
                                            admins={adminsList}
                                            isSuperAdmin={isSuperAdmin}
                                            currentUserId={currentUserId}
                                            appliedFilters={appliedFilters}
                                            responsibleFilter={responsibleFilter}
                                            sortField={sortField}
                                            sortOrder={sortOrder}
                                            onEdit={handleEditOpen}
                                            onActivity={handleActivityOpen}
                                            onDelete={handleDeleteOpen}
                                            activeLeadId={activityLead?._id || editLead?._id || null}
                                            activityTab={activityLead ? activityTab : null}
                                            noteCounts={noteCounts}
                                            reminderCounts={reminderCounts}
                                            setNoteCounts={setNoteCounts}
                                            setReminderCounts={setReminderCounts}
                                            refreshKey={leadsVersion}
                                            isActive
                                            showSuccess={showSuccess}
                                            showError={showError}
                                        />
                                    </div>
                                  )}
                                </div>
                            )}

                            {/* RIGHT — Add/Edit form */}
                            {isEditFormVisible && (
                                <LeadFormPanel
                                    key={editLead?._id || 'new-lead'}
                                    editLead={editLead}
                                    editFields={editFields}
                                    columnDefMap={columnDefMap}
                                    initialForm={editForm}
                                    onSave={handleEditSave}
                                    onCancel={cancelEdit}
                                    isSaving={isSaving}
                                    admins={adminsList}
                                    stages={stages}
                                />
                            )}

                            {/* RIGHT — Notes / Reminders activity panel */}
                            {activityLead && (
                                <div className="w-full sm:w-[calc(33.333%-0.5rem)] flex flex-col min-h-0">
                                    <LeadActivityPanel
                                        lead={activityLead}
                                        leadName={String(activityLead['name'] || '').slice(0, 60) || 'Lead'}
                                        leadPhone={String(activityLead['phone'] || '')}
                                        initialTab={activityTab}
                                        currentAdminId={currentUserId}
                                        isSuperAdmin={isSuperAdmin}
                                        currentUser={
                                            // Priority: chatbotAdmin (from account_admins — has firstName, lastName, profileImage)
                                            // Fallback: userDetails (from auth service profile)
                                            // Last resort: rawUser (SSO token fields)
                                            chatbotAdmin
                                            || userDetails
                                            || (rawUser?.name ? { name: rawUser.name, profileImageUrl: rawUser.profileImageUrl || '' } : null)
                                        }
                                        adminHasPhone={adminHasPhone}
                                        onClose={() => setActivityLead(null)}
                                        onError={showError}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Filter popup */}
            {showFilterPopup && (
                <FilterPopup
                    fields={fields.filter(f => f !== 'responsible')}
                    columnDefMap={columnDefMap}
                    filters={filters}
                    onFilterChange={handleFilterChange}
                    onApply={() => {
                        handleApplyFilters();
                        setShowFilterPopup(false);
                    }}
                    onClearAll={() => {
                        clearAllFilters();
                        setShowFilterPopup(false);
                    }}
                    onClose={() => {
                        // Cancel — discard un-applied staged changes
                        setFilters(prev => {
                            const reset = { ...prev };
                            fields.forEach(f => {
                                reset[f] = appliedFilters[f] ?? null;
                            });
                            return reset;
                        });
                        setShowFilterPopup(false);
                    }}
                />
            )}

            {/* Delete lead confirmation */}
            <DeleteConfirmation
                isOpen={isDeleteOpen}
                onClose={() => setIsDeleteOpen(false)}
                onConfirm={handleDeleteConfirm}
                title="Delete Lead"
                message="Are you sure you want to delete this lead? This action cannot be undone."
            />

            {/* Delete collection confirmation */}
            {deleteCollectionPending && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !deleteCollectionLoading && setDeleteCollectionPending(null)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-md p-6 animate-fade-in">
                        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mx-auto mb-4">
                            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </div>
                        <h3 className="text-base font-semibold text-gray-900 text-center mb-2">Delete Collection</h3>
                        <p className="text-sm text-gray-600 text-center mb-1">You are about to permanently delete</p>
                        <p className="text-sm font-semibold text-gray-900 text-center mb-3">&ldquo;{deleteCollectionPending.collectionName}&rdquo;</p>
                        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-5">
                            <p className="text-xs text-red-700 text-center leading-relaxed">
                                This will also delete <strong>all leads</strong> in this collection.<br />
                                This action <strong>cannot be recovered</strong>.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <Button block variant="secondary" scheme="danger" onClick={() => setDeleteCollectionPending(null)} disabled={deleteCollectionLoading}>Cancel</Button>
                            <Button block variant="danger" onClick={handleDeleteCollectionConfirm} disabled={deleteCollectionLoading} loading={deleteCollectionLoading}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                Delete permanently
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LeadsGrid;

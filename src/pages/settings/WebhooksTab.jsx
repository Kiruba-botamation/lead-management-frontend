/**
 * Webhooks Settings Tab
 *
 * Configure outbound webhooks per account: subscribe a target URL to lead
 * events, enable/disable, and review recent deliveries. Superadmin-only
 * management; the signing secret is shown once on creation. Payloads are signed
 * with HMAC-SHA256 (X-Webhook-Signature header).
 *
 * Each webhook can additionally define:
 *  - custom HTTP headers (e.g. an Authorization token for the receiver)
 *  - a custom JSON payload template using {{path}} placeholders, so the body
 *    contains only the fields the receiver needs. A variable picker (the {x}
 *    icon) lists every available field — stage id, previous stage, responsible,
 *    custom fields, etc. — and inserts the token at the cursor.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api/axiosConfig';
import { useNotifications } from '../../components/Notifications';
import Button from '../../components/ui/Button';
import { Combobox } from '../../components/ui/Combobox';
import ConfirmationDialog from '../../components/ConfirmationDialog';

const EVENT_LABELS = {
    'lead.created':       'New Lead',
    'lead.assigned':      'Lead Assigned',
    'lead.unassigned':    'Lead Unassigned',
    'lead.stage_changed': 'Stage Changed',
};

// Variable picker: two scopes (fields on every event vs. event-specific),
// each rendered as a labelled band of collapsible groups. Accent colors come
// from design tokens so they track the theme.
const SCOPE_ORDER = ['common', 'event'];
const SCOPE_META = {
    common: { title: 'Available on every event', accent: 'var(--color-primary-600)' },
    event:  { title: 'Event-specific fields',    accent: 'var(--color-secondary-600)' },
};

const DEFAULT_TEMPLATE = `{
  "event": "{{event}}",
  "leadId": "{{data.leadId}}",
  "name": "{{data.lead.name}}",
  "timestamp": "{{timestamp}}"
}`;

const blankForm = {
    id: null,
    collectionId: '',
    url: '',
    events: [],
    headers: [{ key: '', value: '' }],
    useCustomPayload: false,
    payloadTemplate: DEFAULT_TEMPLATE,
};

/** Convert a stored headers object → editable rows. */
const headersToRows = (headers) => {
    const entries = Object.entries(headers || {});
    return entries.length ? entries.map(([key, value]) => ({ key, value: String(value ?? '') })) : [{ key: '', value: '' }];
};

/** Convert editable rows → a headers object (drops blank keys). */
const rowsToHeaders = (rows) => {
    const out = {};
    for (const { key, value } of rows) {
        const k = (key || '').trim();
        if (k) out[k] = value ?? '';
    }
    return out;
};

const WebhooksTab = ({ acctId: acctIdProp }) => {
    const acctId = acctIdProp || localStorage.getItem('acctId') || '';
    const { showSuccess, showError } = useNotifications();

    const [events, setEvents] = useState([]);
    const [configs, setConfigs] = useState([]);
    const [deliveries, setDeliveries] = useState([]);
    const [collections, setCollections] = useState([]);
    const [accessLevel, setAccessLevel] = useState(null);
    const [loading, setLoading] = useState(false);
    const [variableGroups, setVariableGroups] = useState([]);
    const [variablesLoading, setVariablesLoading] = useState(false);

    // Create / edit form
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(blankForm);
    const [saving, setSaving] = useState(false);
    const [newSecret, setNewSecret] = useState(null); // secret to surface once after creation
    const [showVarPicker, setShowVarPicker] = useState(false);
    const [varSearch, setVarSearch] = useState('');
    const [expandedGroups, setExpandedGroups] = useState({}); // { [group.key]: boolean }

    // A group defaults to expanded only when scope === 'common'.
    const isGroupExpanded = (key, scope) =>
        key in expandedGroups ? expandedGroups[key] : scope === 'common';
    const toggleGroup = (key, scope) =>
        setExpandedGroups(prev => ({ ...prev, [key]: !isGroupExpanded(key, scope) }));

    const [deleteId, setDeleteId] = useState(null);

    const templateRef = useRef(null);
    const isSuperadmin = accessLevel === 'superadmin';
    const isEditing = !!form.id;

    const load = useCallback(async () => {
        if (!acctId) return;
        setLoading(true);
        try {
            const [cfgRes, delRes, colRes] = await Promise.all([
                api.get('/api/ui/webhooks', { params: { acctId } }),
                api.get('/api/ui/webhooks/deliveries', { params: { acctId, limit: 20 } }),
                api.get('/api/ui/leads/collections', { params: { acctId } }),
            ]);
            setEvents(cfgRes.data?.events || []);
            setConfigs(cfgRes.data?.configs || []);
            setAccessLevel(cfgRes.data?.currentUserAccessLevel ?? null);
            setDeliveries(delRes.data?.deliveries || []);
            setCollections(colRes.data?.data || []);
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to load webhooks.');
        } finally {
            setLoading(false);
        }
    }, [acctId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { load(); }, [load]);

    // Variables are collection-scoped — (re)fetch whenever the form's collection changes.
    const loadVariables = useCallback(async (collectionId) => {
        if (!acctId || !collectionId) { setVariableGroups([]); return; }
        setVariablesLoading(true);
        try {
            const res = await api.get('/api/ui/webhooks/variables', { params: { acctId, collectionId } });
            setVariableGroups(res.data?.groups || []);
        } catch (err) {
            setVariableGroups([]);
        } finally {
            setVariablesLoading(false);
        }
    }, [acctId]);

    useEffect(() => {
        if (showForm && form.collectionId) loadVariables(form.collectionId);
        else setVariableGroups([]);
    }, [showForm, form.collectionId, loadVariables]);

    const patchForm = (patch) => setForm(prev => ({ ...prev, ...patch }));

    const toggleFormEvent = (ev) => {
        setForm(prev => ({
            ...prev,
            events: prev.events.includes(ev) ? prev.events.filter(e => e !== ev) : [...prev.events, ev]
        }));
    };

    // ── Header row helpers ─────────────────────────────────────────────
    const setHeaderRow = (idx, field, value) => {
        setForm(prev => {
            const headers = prev.headers.map((row, i) => i === idx ? { ...row, [field]: value } : row);
            return { ...prev, headers };
        });
    };
    const addHeaderRow = () => setForm(prev => ({ ...prev, headers: [...prev.headers, { key: '', value: '' }] }));
    const removeHeaderRow = (idx) => setForm(prev => {
        const headers = prev.headers.filter((_, i) => i !== idx);
        return { ...prev, headers: headers.length ? headers : [{ key: '', value: '' }] };
    });

    // ── Variable insertion ─────────────────────────────────────────────
    const insertVariable = (path) => {
        const token = `{{${path}}}`;
        const el = templateRef.current;
        setForm(prev => {
            const text = prev.payloadTemplate || '';
            if (!el) return { ...prev, payloadTemplate: text + token };
            const start = el.selectionStart ?? text.length;
            const end = el.selectionEnd ?? text.length;
            const next = text.slice(0, start) + token + text.slice(end);
            // restore caret just after the inserted token (after React re-renders)
            requestAnimationFrame(() => {
                el.focus();
                const pos = start + token.length;
                el.setSelectionRange(pos, pos);
            });
            return { ...prev, payloadTemplate: next };
        });
    };

    // Reset the variable-picker UI so it opens clean for each form session.
    const resetPicker = () => { setShowVarPicker(false); setVarSearch(''); setExpandedGroups({}); };

    const openCreate = () => {
        const preferred = collections.find(c => c.default) || collections[0];
        setForm({ ...blankForm, collectionId: preferred?._id || '' });
        resetPicker();
        setShowForm(true);
    };

    const openEdit = (cfg) => {
        setForm({
            id: cfg._id,
            collectionId: cfg.collectionId || '',
            url: cfg.url || '',
            events: cfg.events || [],
            headers: headersToRows(cfg.headers),
            useCustomPayload: !!cfg.payloadTemplate,
            payloadTemplate: cfg.payloadTemplate || DEFAULT_TEMPLATE,
        });
        resetPicker();
        setShowForm(true);
    };

    const resetForm = () => { setForm(blankForm); resetPicker(); setShowForm(false); };

    const validateForm = () => {
        if (!form.collectionId) { showError('Select a collection.'); return false; }
        if (!/^https?:\/\//i.test(form.url)) { showError('Enter a valid http(s) URL.'); return false; }
        if (form.events.length === 0) { showError('Select at least one event.'); return false; }
        if (form.useCustomPayload) {
            try { JSON.parse(form.payloadTemplate); }
            catch (e) { showError(`Payload template is not valid JSON: ${e.message}`); return false; }
        }
        return true;
    };

    const buildPayload = () => ({
        acctId,
        collectionId: form.collectionId,
        url: form.url,
        events: form.events,
        headers: rowsToHeaders(form.headers),
        payloadTemplate: form.useCustomPayload ? form.payloadTemplate : '',
    });

    const handleSave = async () => {
        if (!validateForm()) return;
        setSaving(true);
        try {
            if (isEditing) {
                await api.put(`/api/ui/webhooks/${form.id}`, buildPayload());
                showSuccess('Webhook updated.');
            } else {
                const res = await api.post('/api/ui/webhooks', buildPayload());
                setNewSecret(res.data?.config?.secret || null);
                showSuccess('Webhook created.');
            }
            resetForm();
            await load();
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to save webhook.');
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (cfg) => {
        try {
            await api.put(`/api/ui/webhooks/${cfg._id}`, { active: !cfg.active }, { params: { acctId } });
            setConfigs(prev => prev.map(c => c._id === cfg._id ? { ...c, active: !c.active } : c));
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to update webhook.');
        }
    };

    const handleDelete = async () => {
        const id = deleteId;
        setDeleteId(null);
        try {
            await api.delete(`/api/ui/webhooks/${id}`, { params: { acctId } });
            setConfigs(prev => prev.filter(c => c._id !== id));
            showSuccess('Webhook deleted.');
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to delete webhook.');
        }
    };

    return (
        <div className="max-w-2xl">
            <div className="flex items-start justify-between mb-1">
                <h2 className="text-base font-bold text-gray-900">Webhooks</h2>
                {isSuperadmin && !showForm && (
                    <Button size="sm" onClick={openCreate}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Webhook
                    </Button>
                )}
            </div>
            <p className="text-xs text-gray-500 mb-5">
                Send lead events to an external system. Payloads are POSTed as JSON and signed
                with <code className="bg-gray-100 px-1 py-0.5 rounded font-mono">X-Webhook-Signature: sha256=…</code> using the webhook secret.
            </p>

            {!isSuperadmin && (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                    Only superadmins can manage webhooks.
                </p>
            )}

            {/* Newly created secret — shown once */}
            {newSecret && (
                <div className="mb-4 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <p className="text-xs font-semibold text-green-800 mb-1">Webhook secret (copy it now — shown only once)</p>
                    <code className="block bg-white border border-green-200 rounded px-2 py-1 font-mono text-[11px] text-gray-800 break-all">{newSecret}</code>
                    <button onClick={() => setNewSecret(null)} className="mt-1 text-[11px] text-green-700 underline">Dismiss</button>
                </div>
            )}

            {/* Create / edit form */}
            {showForm && (
                <div className="mb-5 border border-gray-200 rounded-lg p-4">
                    <p className="text-xs font-bold text-gray-800 mb-3">{isEditing ? 'Edit Webhook' : 'New Webhook'}</p>

                    <label className="block text-xs font-semibold text-gray-700 mb-1">Collection</label>
                    <Combobox
                        value={form.collectionId}
                        onChange={(val) => patchForm({ collectionId: val })}
                        options={collections.map(c => ({ value: c._id, label: `${c.collectionName}${c.default ? ' (default)' : ''}` }))}
                        placeholder="Select a collection…"
                        searchable={collections.length > 6}
                        size="sm"
                        className="w-full mb-1"
                    />
                    <p className="text-[11px] text-gray-400 mb-3">
                        This webhook fires only for leads in this collection, and its payload variables are limited to its fields.
                    </p>

                    <label className="block text-xs font-semibold text-gray-700 mb-1">Target URL</label>
                    <input
                        type="url"
                        value={form.url}
                        onChange={(e) => patchForm({ url: e.target.value })}
                        placeholder="https://example.com/webhooks/leads"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 mb-3"
                    />

                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Events</label>
                    <div className="flex flex-col gap-1.5 mb-4">
                        {events.map(ev => (
                            <label key={ev} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                                <input type="checkbox" checked={form.events.includes(ev)} onChange={() => toggleFormEvent(ev)} className="rounded border-gray-300 w-3.5 h-3.5" style={{ accentColor: 'var(--color-primary-600)' }} />
                                {EVENT_LABELS[ev] || ev}
                            </label>
                        ))}
                    </div>

                    {/* Custom headers */}
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        Custom Headers <span className="font-normal text-gray-400">— e.g. Authorization for the receiver</span>
                    </label>
                    <div className="flex flex-col gap-1.5 mb-1">
                        {form.headers.map((row, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={row.key}
                                    onChange={(e) => setHeaderRow(idx, 'key', e.target.value)}
                                    placeholder="Header name"
                                    className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                />
                                <input
                                    type="text"
                                    value={row.value}
                                    onChange={(e) => setHeaderRow(idx, 'value', e.target.value)}
                                    placeholder="Value"
                                    className="flex-1 px-2 py-1.5 text-xs border border-gray-300 rounded-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                />
                                <button onClick={() => removeHeaderRow(idx)} className="text-gray-400 hover:text-red-500 flex-shrink-0" title="Remove header">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                    <button onClick={addHeaderRow} className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium mb-4">+ Add header</button>

                    {/* Custom payload */}
                    <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 mb-2 cursor-pointer">
                        <input type="checkbox" checked={form.useCustomPayload} onChange={(e) => patchForm({ useCustomPayload: e.target.checked })} className="rounded border-gray-300 w-3.5 h-3.5" style={{ accentColor: 'var(--color-primary-600)' }} />
                        Customize JSON payload
                    </label>

                    {form.useCustomPayload && (
                        <div className="mb-4 relative">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[11px] text-gray-500">
                                    Use <code className="bg-gray-100 px-1 rounded font-mono">{'{{path}}'}</code> placeholders. The whole JSON is customizable.
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setShowVarPicker(v => !v)}
                                    className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded border ${showVarPicker ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
                                    title="Insert a variable"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l-3 3 3 3m8-6l3 3-3 3M14 5l-4 14" />
                                    </svg>
                                    Variables
                                </button>
                            </div>

                            {showVarPicker && (
                                <div className="mb-2 border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
                                    {/* Sticky search */}
                                    <div className="border-b border-gray-100 p-2">
                                        <div className="relative">
                                            <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
                                            </svg>
                                            <input
                                                type="text"
                                                value={varSearch}
                                                onChange={(e) => setVarSearch(e.target.value)}
                                                placeholder="Search variables…"
                                                aria-label="Search variables"
                                                className="w-full pl-7 pr-7 py-1.5 text-[11px] border border-gray-300 rounded-md outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                            />
                                            {varSearch && (
                                                <button
                                                    type="button"
                                                    onClick={() => setVarSearch('')}
                                                    aria-label="Clear search"
                                                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Scrollable body */}
                                    <div className="max-h-60 overflow-y-auto p-1.5">
                                        {variablesLoading ? (
                                            <p className="text-[11px] text-gray-400 px-2 py-3 text-center">Loading fields…</p>
                                        ) : variableGroups.length === 0 ? (
                                            <p className="text-[11px] text-gray-400 px-2 py-3 text-center">No variables available.</p>
                                        ) : (() => {
                                            const q = varSearch.trim().toLowerCase();
                                            const matchVar = (v) =>
                                                !q || v.label.toLowerCase().includes(q) || v.path.toLowerCase().includes(q);

                                            const sections = SCOPE_ORDER.map((scope) => {
                                                const meta = SCOPE_META[scope];
                                                const groups = variableGroups
                                                    .filter((g) => (g.scope || 'common') === scope)
                                                    .map((g) => ({ ...g, variables: g.variables.filter(matchVar) }))
                                                    .filter((g) => g.variables.length > 0);
                                                if (groups.length === 0) return null;

                                                return (
                                                    <div key={scope} className="mb-2 last:mb-0">
                                                        {/* Scope band header */}
                                                        <div className="flex items-center gap-2 px-1.5 mb-1">
                                                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: meta.accent }}>
                                                                {meta.title}
                                                            </span>
                                                            <span className="flex-1 h-px bg-gray-100" />
                                                        </div>

                                                        {groups.map((group) => {
                                                            const expanded = q ? true : isGroupExpanded(group.key, scope);
                                                            return (
                                                                <div key={group.key} className="mb-1 last:mb-0">
                                                                    {/* Group header (collapsible) */}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => toggleGroup(group.key, scope)}
                                                                        aria-expanded={expanded}
                                                                        className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-md text-left hover:bg-gray-50"
                                                                    >
                                                                        <svg
                                                                            className={`w-3 h-3 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
                                                                            fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
                                                                        >
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                                                        </svg>
                                                                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: meta.accent }} />
                                                                        <span className="flex-1 text-[11px] font-semibold text-gray-700 truncate">{group.label}</span>
                                                                        <span className="text-[10px] font-medium text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5 flex-shrink-0">
                                                                            {group.variables.length}
                                                                        </span>
                                                                    </button>

                                                                    {/* Variables */}
                                                                    {expanded && (
                                                                        <div className="pl-[1.375rem] pr-1 pb-1 flex flex-col gap-0.5" role="group">
                                                                            {group.variables.map((v) => (
                                                                                <button
                                                                                    key={v.path}
                                                                                    type="button"
                                                                                    onClick={() => insertVariable(v.path)}
                                                                                    title={`Insert {{${v.path}}}`}
                                                                                    className="flex items-center justify-between gap-3 text-left px-2 py-1 rounded hover:bg-indigo-50 group"
                                                                                >
                                                                                    <span className="text-[11px] text-gray-700 group-hover:text-indigo-700 truncate">{v.label}</span>
                                                                                    <code className="text-[10px] font-mono text-gray-400 group-hover:text-indigo-600 truncate flex-shrink-0">{`{{${v.path}}}`}</code>
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                );
                                            }).filter(Boolean);

                                            return sections.length
                                                ? sections
                                                : <p className="text-[11px] text-gray-400 px-2 py-3 text-center">No variables match “{varSearch}”.</p>;
                                        })()}
                                    </div>
                                </div>
                            )}

                            <textarea
                                ref={templateRef}
                                value={form.payloadTemplate}
                                onChange={(e) => patchForm({ payloadTemplate: e.target.value })}
                                spellCheck={false}
                                rows={10}
                                className="w-full px-3 py-2 text-[12px] font-mono border border-gray-300 rounded-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-y"
                            />
                        </div>
                    )}

                    <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" scheme="primary" onClick={resetForm} disabled={saving}>Cancel</Button>
                        <Button size="sm" onClick={handleSave} loading={saving} disabled={saving}>{isEditing ? 'Save' : 'Create'}</Button>
                    </div>
                </div>
            )}

            {/* Config list */}
            <div className="space-y-2 mb-8">
                {loading && configs.length === 0 ? (
                    <p className="text-xs text-gray-400">Loading…</p>
                ) : configs.length === 0 ? (
                    <p className="text-xs text-gray-400">No webhooks configured.</p>
                ) : configs.map(cfg => (
                    <div key={cfg._id} className="flex items-center justify-between gap-3 border border-gray-200 rounded-lg px-3 py-2.5">
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                                {cfg.collectionName && (
                                    <span className="text-[10px] font-semibold bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 flex-shrink-0" title="Collection">{cfg.collectionName}</span>
                                )}
                                <p className="text-xs font-medium text-gray-800 truncate">{cfg.url}</p>
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                                {(cfg.events || []).map(ev => (
                                    <span key={ev} className="text-[10px] font-medium bg-indigo-50 text-indigo-700 rounded px-1.5 py-0.5">{EVENT_LABELS[ev] || ev}</span>
                                ))}
                                {cfg.payloadTemplate && (
                                    <span className="text-[10px] font-medium bg-purple-50 text-purple-700 rounded px-1.5 py-0.5" title="Custom JSON payload">custom payload</span>
                                )}
                                {cfg.headers && Object.keys(cfg.headers).length > 0 && (
                                    <span className="text-[10px] font-medium bg-amber-50 text-amber-700 rounded px-1.5 py-0.5" title="Custom headers">{Object.keys(cfg.headers).length} header{Object.keys(cfg.headers).length > 1 ? 's' : ''}</span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {cfg.active ? 'Active' : 'Disabled'}
                            </span>
                            {isSuperadmin && (
                                <>
                                    <button onClick={() => openEdit(cfg)} className="text-[11px] text-gray-500 hover:text-indigo-600 underline">
                                        Edit
                                    </button>
                                    <button onClick={() => toggleActive(cfg)} className="text-[11px] text-gray-500 hover:text-indigo-600 underline">
                                        {cfg.active ? 'Disable' : 'Enable'}
                                    </button>
                                    <button onClick={() => setDeleteId(cfg._id)} className="text-gray-400 hover:text-red-500" title="Delete">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Recent deliveries */}
            <h3 className="text-sm font-bold text-gray-900 mb-2">Recent Deliveries</h3>
            {deliveries.length === 0 ? (
                <p className="text-xs text-gray-400">No deliveries yet.</p>
            ) : (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="min-w-full text-[11px]">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold">Event</th>
                                <th className="px-3 py-2 text-left font-semibold">Status</th>
                                <th className="px-3 py-2 text-left font-semibold">Code</th>
                                <th className="px-3 py-2 text-left font-semibold">When</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {deliveries.map(d => (
                                <tr key={d._id}>
                                    <td className="px-3 py-1.5 text-gray-700">{EVENT_LABELS[d.event] || d.event}</td>
                                    <td className="px-3 py-1.5">
                                        <span className={`font-semibold ${d.status === 'success' ? 'text-green-600' : 'text-red-600'}`}>{d.status}</span>
                                    </td>
                                    <td className="px-3 py-1.5 text-gray-500">{d.statusCode ?? '—'}</td>
                                    <td className="px-3 py-1.5 text-gray-500">{new Date(d.createdAt).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <ConfirmationDialog
                isOpen={!!deleteId}
                onConfirm={handleDelete}
                onCancel={() => setDeleteId(null)}
                title="Delete webhook?"
                message="This endpoint will stop receiving events immediately."
                confirmText="Delete"
                cancelText="Cancel"
                variant="warning"
            />
        </div>
    );
};

export default WebhooksTab;

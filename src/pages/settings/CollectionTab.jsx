/**
 * Collection Settings Tab
 *
 * Allows users to:
 *  - Create, rename, and manage lead collections
 *  - Define column schemas (label, field key, type) for each collection
 *  - Copy the external API integration info (endpoint, headers, payload)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api/axiosConfig';
import { useAccount } from '../../context/AccountContext';
import { useNotifications } from '../../components/Notifications';
import Button from '../../components/ui/Button';
import Tooltip from '../../components/Tooltip';
import { Dropdown, DropdownItem } from '../../components/ui/Dropdown';
import StageColorPicker from '../../components/ui/StageColorPicker';

// ── Constants ────────────────────────────────────────────────────────────────

const FIELD_TYPES = ['text', 'number', 'date', 'boolean'];

const FIELD_TYPE_META = {
    text:    {
        label: 'Text',
        icon: (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h10M4 18h7" />
            </svg>
        ),
    },
    number:  {
        label: 'Number',
        icon: (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
            </svg>
        ),
    },
    date:    {
        label: 'Date',
        icon: (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
        ),
    },
    boolean: {
        label: 'Boolean',
        icon: (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
    },
};

const SYSTEM_FIELDS = [
    {
        label:    'Name',
        field:    'name',
        type:     'text',
        system:   true,
        required: true,
        tooltip:  'Mandatory — full name of the lead'
    },
    {
        label:    'Phone',
        field:    'phone',
        type:     'text',
        system:   true,
        required: true,
        tooltip:  'Mandatory — phone number of the lead'
    },
    {
        label:    'Email',
        field:    'email',
        type:     'text',
        system:   true,
        required: false,
        tooltip:  'Optional — email address of the lead'
    },
    {
        label:    'Responsible',
        field:    'responsible',
        type:     'text',
        system:   true,
        required: false,
        tooltip:  'Optional — represents the assignee of the lead'
    }
];

// Set of field keys that are always system fields
const SYSTEM_FIELD_KEYS = new Set(SYSTEM_FIELDS.map(f => f.field));

// System predefined fields shown in the API documentation. These are ALWAYS
// accepted by the lead-intake API regardless of the collection's custom fields.
// `stage` is included here because it is accepted by the lead-intake API.
const API_PREDEFINED_FIELDS = [
    { label: 'Name',        field: 'name',        type: 'text',   required: true,  sample: 'Joe Smith' },
    { label: 'Phone',       field: 'phone',       type: 'text',   required: true,  sample: '+1234567890' },
    { label: 'Email',       field: 'email',       type: 'text',   required: false, sample: 'joe@example.com' },
    { label: 'Responsible', field: 'responsible', type: 'text', required: false, sample: '{{user_id}}' },
    { label: 'Stage',       field: 'stage',       type: 'number', required: false, sample: 1 },
];
const API_PREDEFINED_KEYS = new Set(API_PREDEFINED_FIELDS.map(f => f.field));

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Normalise a collection name: lowercase, spaces → underscore, strip special chars */
const normaliseName = (value) =>
    value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

/** Derive a field key from a column label */
const deriveFieldKey = (label) =>
    label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

// ── Copy-to-clipboard button ─────────────────────────────────────────────────

const CopyButton = ({ text, size = 'sm' }) => {
    const [copied, setCopied] = useState(false);
    const handle = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* ignore */ }
    };
    return (
        <button
            onClick={handle}
            className={`p-1 rounded transition-colors ${copied ? 'text-green-600' : 'text-gray-400 hover:text-gray-600'}`}
            title={copied ? 'Copied!' : 'Copy'}
        >
            {copied ? (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
            ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
            )}
        </button>
    );
};

// ── API Info Modal ────────────────────────────────────────────────────────────

const ApiInfoModal = ({ collection, acctNo, acctId, onClose }) => {
    const [apiKey, setApiKey] = useState('<your-api-key>');

    // Fetch the real API key when the modal opens
    useEffect(() => {
        if (!acctId) return;
        api.post('/api/ui/accounts/token', { masked: false }, { params: { acctId } })
            .then(res => { if (res.data?.apiKey) setApiKey(res.data.apiKey); })
            .catch(() => {}); // silently fall back to placeholder
    }, [acctId]);

    if (!collection) return null;

    const origin      = window.location.origin;
    const endpoint    = `POST ${origin}/api/leads/${collection.collectionName}`;
    const headersText = `x-api-key: ${apiKey}\nx-page-id: ${acctNo || '<your-account-number>'}\nContent-Type: application/json`;

    const dummyValue = (f) => {
        const key = (f.label || f.field || '').toLowerCase().replace(/\s+/g, '_');
        switch ((f.type || 'Text').toLowerCase()) {
            case 'number':  return 0;
            case 'boolean': return false;
            case 'date':    return '2026-01-15';
            default: {
                if (/name/.test(key))                          return 'Joe Smith';
                if (/phone|mobile|mob|contact/.test(key))     return '+1234567890';
                if (/email/.test(key))                        return 'joe@example.com';
                if (/company|org|organisation/.test(key))     return 'Acme Corp';
                if (/city|location|address/.test(key))        return 'New York';
                if (/country/.test(key))                      return 'US';
                if (/source|src/.test(key))                   return 'Inbound';
                if (/status/.test(key))                       return 'Active';
                if (/designation|role|title|position/.test(key)) return 'Manager';
                if (/note|comment|remark/.test(key))          return 'Interested in product';
                if (/website|url|link/.test(key))             return 'https://example.com';
                if (/age/.test(key))                          return '30';
                if (/gender/.test(key))                       return 'Male';
                if (/registration|reg/.test(key))             return 'Completed';
                if (/attendance/.test(key))                   return '1';
                return 'sample';
            }
        }
    };
    // Custom (collection-specific) fields, excluding any predefined ones
    const customFields = (collection.fields || []).filter(f => !API_PREDEFINED_KEYS.has(f.field));

    // Full field reference: predefined first (always present), then custom fields.
    const allFields = [
        ...API_PREDEFINED_FIELDS.map(f => ({ ...f, predefined: true })),
        ...customFields.map(f => ({ ...f, predefined: false, required: !!f.required })),
    ];

    // Build the example payload in the same order — predefined fields always shown.
    const payloadFields = {};
    API_PREDEFINED_FIELDS.forEach(f => { payloadFields[f.field] = f.sample; });
    customFields.forEach(f => { payloadFields[f.field] = dummyValue(f); });

    const payloadText = JSON.stringify({ data: payloadFields }, null, 2);

    const curlText = `curl -X POST "${origin}/api/leads/${collection.collectionName}" \\
  -H "x-api-key: ${apiKey}" \\
  -H "x-page-id: ${acctNo || '<your-account-number>'}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ data: payloadFields })}'`;

    // ── Bulk insert (batch) ────────────────────────────────────────────────────
    // `data` also accepts an array of lead objects in a single request. A second
    // sample lead is derived from the first by varying the identifying fields.
    const secondLead = { ...payloadFields };
    if ('name' in secondLead)  secondLead.name  = 'Jane Doe';
    if ('email' in secondLead) secondLead.email = 'jane@example.com';
    if ('phone' in secondLead) secondLead.phone = '+1987654321';
    const bulkLeads = [payloadFields, secondLead];

    const bulkPayloadText = JSON.stringify({ data: bulkLeads }, null, 2);
    const bulkMergeText   = JSON.stringify({ config: { merge: { properties: ['email'] } }, data: bulkLeads }, null, 2);
    const bulkCurlText = `curl -X POST "${origin}/api/leads/${collection.collectionName}" \\
  -H "x-api-key: ${apiKey}" \\
  -H "x-page-id: ${acctNo || '<your-account-number>'}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({ data: bulkLeads })}'`;

    return (
        <div className="fixed inset-0 flex items-start justify-center p-4 pt-6" style={{ zIndex: 300 }}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/60 flex flex-col animate-fade-in"
                    style={{ zIndex: 400, maxHeight: 'calc(100vh - 3rem)', width: 'min(100%, 42rem)' }}>
                    {/* Fixed header */}
                    <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-indigo-100/60 rounded-t-2xl flex-shrink-0"
                         style={{ background: 'linear-gradient(135deg, #f8faff 0%, #eef2ff 100%)' }}>
                        <div>
                            <h3 className="text-sm font-bold text-slate-800">API Integration</h3>
                            <p className="text-[11px] text-slate-500 mt-0.5">{collection.collectionName}</p>
                        </div>
                        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Scrollable body */}
                    <div className="flex-1 overflow-y-auto px-6 py-4">
                        <div className="space-y-4 text-xs">
                            {/* Endpoint */}
                            <Section title="Endpoint" copyText={endpoint}>
                                <code className="block bg-gray-100 rounded-lg px-3 py-2 font-mono text-[11px] text-gray-800 break-all">
                                    {endpoint}
                                </code>
                            </Section>

                            {/* Headers */}
                            <Section title="Headers" copyText={headersText}>
                                <div className="bg-gray-100 rounded-lg px-3 py-2 font-mono text-[11px] text-gray-800 space-y-0.5">
                                    <p>x-api-key: <span className="text-indigo-700 font-semibold">{apiKey}</span></p>
                                    <p>x-page-id: <span className="text-gray-500">{acctNo || '<your-account-number>'}</span></p>
                                    <p>Content-Type: application/json</p>
                                </div>
                                <p className="mt-1 text-[10px] text-gray-500">
                                    Manage your API key from <span className="font-semibold">Settings → API</span> tab.
                                </p>
                            </Section>

                            {/* Fields reference */}
                            <Section title="Fields">
                                <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                                    <table className="w-full text-[11px]">
                                        <thead>
                                            <tr className="bg-gray-100 text-gray-600">
                                                <th className="text-left font-semibold px-3 py-1.5">Field</th>
                                                <th className="text-left font-semibold px-3 py-1.5">Type</th>
                                                <th className="text-left font-semibold px-3 py-1.5">Requirement</th>
                                                <th className="text-left font-semibold px-3 py-1.5">Category</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {allFields.map(f => (
                                                <tr key={f.field}>
                                                    <td className="px-3 py-1.5 font-mono text-gray-800">{f.field}</td>
                                                    <td className="px-3 py-1.5 text-gray-600">{(f.type || 'text')}</td>
                                                    <td className="px-3 py-1.5">
                                                        {f.required ? (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700">Mandatory</span>
                                                        ) : (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">Optional</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-1.5 text-gray-500">{f.predefined ? 'Predefined' : 'Custom'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="mt-1 text-[10px] text-gray-500">
                                    <strong>name</strong> and <strong>phone</strong> are mandatory; all other fields are optional.
                                    <span className="block"><code className="bg-gray-100 px-1 rounded font-mono">responsible</code> accepts a Chatbot Admin ID, Admin ID, or User ID.</span>
                                </p>
                            </Section>

                            {/* Responsible assignment */}
                            <Section title="Responsible Assignment">
                                <p className="mb-2 text-[10px] text-gray-500">
                                    Pass any supported admin identifier through the single <code className="ds-code">responsible</code> property. You can copy each value from the Admin dashboard.
                                </p>
                                <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                                    <table className="w-full text-[11px]">
                                        <thead>
                                            <tr className="bg-gray-100 text-gray-600">
                                                <th className="px-3 py-1.5 text-left font-semibold">Match order</th>
                                                <th className="px-3 py-1.5 text-left font-semibold">Accepted value</th>
                                                <th className="px-3 py-1.5 text-left font-semibold">Admin field</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            <tr>
                                                <td className="px-3 py-1.5 font-semibold text-indigo-700">1</td>
                                                <td className="px-3 py-1.5 text-gray-600">Chatbot Admin ID</td>
                                                <td className="px-3 py-1.5"><code className="ds-code text-[10px]">chatbotAdminId</code></td>
                                            </tr>
                                            <tr>
                                                <td className="px-3 py-1.5 font-semibold text-gray-600">2</td>
                                                <td className="px-3 py-1.5 text-gray-600">Admin ID</td>
                                                <td className="px-3 py-1.5"><code className="ds-code text-[10px]">_id</code></td>
                                            </tr>
                                            <tr>
                                                <td className="px-3 py-1.5 font-semibold text-gray-600">3</td>
                                                <td className="px-3 py-1.5 text-gray-600">Lead-app User ID</td>
                                                <td className="px-3 py-1.5"><code className="ds-code text-[10px]">userId</code></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-[10px] text-gray-600">
                                    <p><strong className="text-indigo-700">Recommended:</strong> use the Chatbot Admin ID for stable external integrations.</p>
                                    <p className="mt-1">The identifier is resolved only against admins in the authenticated account and stored on the lead as its canonical User ID.</p>
                                    <p className="mt-1">Unknown identifiers return a validation error. Omit <code className="ds-code">responsible</code> to create an unassigned lead.</p>
                                </div>
                            </Section>

                            {/* Payload */}
                            <Section title="Payload" copyText={payloadText}>
                                <pre className="bg-gray-100 rounded-lg px-3 py-2 font-mono text-[11px] text-gray-800 overflow-x-auto whitespace-pre">
                                    {payloadText}
                                </pre>
                            </Section>

                            {/* cURL example */}
                            <Section title="cURL Example" copyText={curlText}>
                                <pre className="bg-gray-900 text-green-400 rounded-lg px-3 py-2 font-mono text-[10px] overflow-x-auto whitespace-pre">
                                    {curlText}
                                </pre>
                            </Section>

                            {/* Bulk insert (batch) */}
                            <Section title="Bulk Insert (Batch)" copyText={bulkPayloadText}>
                                <p className="mb-1 text-[10px] text-gray-500">
                                    Send multiple leads in one request by passing an array to <code className="bg-gray-100 px-1 rounded font-mono">data</code>.
                                </p>
                                <pre className="bg-gray-100 rounded-lg px-3 py-2 font-mono text-[11px] text-gray-800 overflow-x-auto whitespace-pre">
                                    {bulkPayloadText}
                                </pre>
                            </Section>

                            {/* Bulk insert with merge / upsert */}
                            <Section title="Bulk Insert with Merge (Upsert)" copyText={bulkMergeText}>
                                <pre className="bg-gray-100 rounded-lg px-3 py-2 font-mono text-[11px] text-gray-800 overflow-x-auto whitespace-pre">
                                    {bulkMergeText}
                                </pre>
                                <p className="mt-1 text-[10px] text-gray-500">
                                    With <code className="bg-gray-100 px-1 rounded font-mono">config.merge.properties</code>, existing leads matching those fields
                                    (e.g. <code className="bg-gray-100 px-1 rounded font-mono">email</code>) are updated instead of duplicated. Omit it to always create new leads.
                                </p>
                            </Section>

                            {/* Bulk cURL example */}
                            <Section title="Bulk cURL Example" copyText={bulkCurlText}>
                                <pre className="bg-gray-900 text-green-400 rounded-lg px-3 py-2 font-mono text-[10px] overflow-x-auto whitespace-pre">
                                    {bulkCurlText}
                                </pre>
                            </Section>

                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-[10px] text-yellow-800">
                                <strong>Note:</strong> Only fields defined in this collection are accepted.
                                Payloads with unrecognised fields will be rejected with a 400 error.
                            </div>
                        </div>
                    </div>
                </div>
        </div>
    );
};

const Section = ({ title, copyText, children }) => (
    <div>
        <div className="flex items-center justify-between mb-1">
            <p className="font-semibold text-gray-900">{title}</p>
            {copyText != null && <CopyButton text={copyText} />}
        </div>
        {children}
    </div>
);

// ── Add / Edit collection name dialog ────────────────────────────────────────

const CollectionNameDialog = ({ initial = '', onSave, onClose, saving }) => {
    const [value, setValue] = useState(initial);
    const preview = normaliseName(value);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm p-6">
                <h3 className="text-sm font-bold text-gray-900 mb-4">
                    {initial ? 'Rename Collection' : 'New Collection'}
                </h3>

                <label className="block text-xs font-semibold text-gray-700 mb-1">Collection Name</label>
                <input
                    autoFocus
                    type="text"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && preview) onSave(preview); }}
                    placeholder="e.g. Enterprise Leads"
                    className="ds-input ds-input--sm w-full mb-1"
                />
                {value && (
                    <p className="text-[10px] text-gray-400 mb-4">
                        Saved as: <code className="bg-gray-100 px-1 rounded font-mono">{preview}</code>
                    </p>
                )}

                <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="secondary" scheme="primary" onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button size="sm" onClick={() => onSave(preview)} disabled={!preview || saving} loading={saving}>
                        {initial ? 'Save' : 'Create'}
                    </Button>
                </div>
            </div>
        </div>
    );
};

// ── Main CollectionTab component ─────────────────────────────────────────────

// ── Stage editor ──────────────────────────────────────────────────────────────
// Stages are managed inline via dedicated endpoints (independent of the collection
// Save flow). At least one stage is mandatory; deleting a stage reassigns its
// leads to the first remaining stage.
const DEFAULT_STAGE_COLOR = '#4f46e5';

const StagesEditor = ({ acctId, collectionId, stages, onStagesChange, showSuccess, showError }) => {
    const [busy, setBusy]               = useState(false);
    const [adding, setAdding]           = useState(false);
    const [newName, setNewName]         = useState('');
    const [newColor, setNewColor]       = useState(DEFAULT_STAGE_COLOR);
    const [confirmDelete, setConfirmDelete] = useState(null); // the stage pending deletion

    const base = `/api/ui/leads/collections/${collectionId}/stages`;

    const addStage = async () => {
        const name = newName.trim();
        if (!name) return;
        setBusy(true);
        try {
            const res = await api.post(base, { name, color: newColor }, { params: { acctId } });
            onStagesChange(res.data?.data || []);
            setNewName(''); setNewColor(DEFAULT_STAGE_COLOR); setAdding(false);
            showSuccess('Stage added.');
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to add stage.');
        } finally { setBusy(false); }
    };

    // Persist a name/colour edit. Skips the call when nothing changed.
    const saveStage = async (stage, patch) => {
        if (patch.name !== undefined && patch.name.trim() === stage.name) return;
        if (patch.color !== undefined && patch.color === stage.color) return;
        if (patch.name !== undefined && !patch.name.trim()) return;
        setBusy(true);
        try {
            const res = await api.put(`${base}/${stage.id}`, patch, { params: { acctId } });
            onStagesChange(res.data?.data || []);
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to update stage.');
        } finally { setBusy(false); }
    };

    const moveStage = async (index, dir) => {
        const target = index + dir;
        if (target < 0 || target >= stages.length) return;
        const ordered = [...stages];
        const [m] = ordered.splice(index, 1);
        ordered.splice(target, 0, m);
        const orderedIds = ordered.map(s => s.id);
        onStagesChange(ordered.map((s, i) => ({ ...s, order: i }))); // optimistic
        setBusy(true);
        try {
            const res = await api.put(`${base}/reorder`, { orderedIds }, { params: { acctId } });
            onStagesChange(res.data?.data || []);
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to reorder stages.');
        } finally { setBusy(false); }
    };

    const deleteStage = async () => {
        if (!confirmDelete) return;
        setBusy(true);
        try {
            const res = await api.delete(`${base}/${confirmDelete.id}`, { params: { acctId } });
            const data = res.data?.data || {};
            onStagesChange(data.stages || []);
            const moved = data.reassignedCount || 0;
            showSuccess(moved ? `Stage deleted — ${moved} lead(s) reassigned.` : 'Stage deleted.');
            setConfirmDelete(null);
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to delete stage.');
        } finally { setBusy(false); }
    };

    return (
        <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Lead Stages</span>
                <span className="text-[10px] text-gray-400">At least one stage is required</span>
            </div>
            <p className="text-[11px] text-gray-400 mb-3">
                Stages track where a lead is in your pipeline. Deleting a stage moves its leads to the first stage.
            </p>

            <ul className="flex flex-col gap-2">
                {stages.map((stage, index) => (
                    <li key={stage.id} className="flex items-center gap-2">
                        {/* Reorder */}
                        <div className="flex flex-col">
                            <button
                                type="button"
                                disabled={busy || index === 0}
                                onClick={() => moveStage(index, -1)}
                                className="w-4 h-3 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-30"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" /></svg>
                            </button>
                            <button
                                type="button"
                                disabled={busy || index === stages.length - 1}
                                onClick={() => moveStage(index, 1)}
                                className="w-4 h-3 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-30"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                            </button>
                        </div>

                        {/* Order id badge */}
                        <span className="text-[10px] font-mono text-gray-400 w-4 text-center">{stage.id}</span>

                        <StageColorPicker value={stage.color} disabled={busy}
                            label={`Choose ${stage.name} color`} onChange={(color) => saveStage(stage, { color })} />

                        {/* Name */}
                        <input
                            type="text"
                            defaultValue={stage.name}
                            disabled={busy}
                            onBlur={(e) => saveStage(stage, { name: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            className="ds-input ds-input--sm flex-1"
                        />

                        {/* Delete */}
                        <Tooltip content={stages.length <= 1 ? 'At least one stage is required' : 'Delete stage'} placement="top">
                            <span>
                                <button
                                    type="button"
                                    disabled={busy || stages.length <= 1}
                                    onClick={() => setConfirmDelete(stage)}
                                    className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-300 text-gray-400 hover:text-red-500 hover:border-red-300 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:border-gray-300 disabled:hover:text-gray-400"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </span>
                        </Tooltip>
                    </li>
                ))}
            </ul>

            {/* Add stage */}
            {adding ? (
                <div className="flex items-center gap-2 mt-3">
                    <StageColorPicker value={newColor} onChange={setNewColor} label="Choose new stage color" />
                    <input
                        autoFocus
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') addStage(); if (e.key === 'Escape') { setAdding(false); setNewName(''); } }}
                        placeholder="Stage name (e.g. In Progress)"
                        className="ds-input ds-input--sm flex-1"
                    />
                    <Button size="sm" onClick={addStage} disabled={busy || !newName.trim()} loading={busy}>Add</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewName(''); }} disabled={busy}>Cancel</Button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors mt-3"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                    Add Stage
                </button>
            )}

            {/* Delete confirmation */}
            {confirmDelete && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !busy && setConfirmDelete(null)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm p-6 flex flex-col gap-4">
                        <div className="flex justify-center">
                            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                                <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 001.74-2.99L13.74 4a2 2 0 00-3.48 0L3.34 16.01A2 2 0 005.07 19z" /></svg>
                            </div>
                        </div>
                        <div className="text-center">
                            <h3 className="text-sm font-bold text-gray-900">Delete stage "{confirmDelete.name}"?</h3>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-800">
                            Any leads currently in this stage will be <strong>reassigned to the first stage</strong>.
                        </div>
                        <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="secondary" scheme="primary" onClick={() => setConfirmDelete(null)} disabled={busy}>Cancel</Button>
                            <Button size="sm" variant="danger" onClick={deleteStage} disabled={busy} loading={busy}>Delete & reassign</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const CollectionTab = () => {
    const { acctId, acctNo } = useAccount();
    const { showSuccess, showError } = useNotifications();

    const [collections, setCollections]               = useState([]);
    const [selectedId, setSelectedId]                 = useState(null);
    const [selectedCollection, setSelectedCollection] = useState(null); // full detail with fields
    const [loadingList, setLoadingList]               = useState(false);
    const [loadingDetail, setLoadingDetail]           = useState(false);
    const [saving, setSaving]                         = useState(false);

    // Local edit state for the selected collection
    const [editName, setEditName]   = useState('');
    const [editFields, setEditFields] = useState([]); // user-defined only

    // Dialogs
    const [showNewCollectionDialog, setShowNewCollectionDialog] = useState(false);
    const [showRenameDialog, setShowRenameDialog]               = useState(false);
    const [showApiInfo, setShowApiInfo]                         = useState(false);
    const [createSaving, setCreateSaving]                       = useState(false);
    const [deleteLoading, setDeleteLoading]                     = useState(false);
    const [showDeleteDialog, setShowDeleteDialog]               = useState(false);

    // ── Fetch collection list ──────────────────────────────────────────────

    const fetchCollections = useCallback(async () => {
        if (!acctId) return;
        setLoadingList(true);
        try {
            const res = await api.get('/api/ui/leads/collections', { params: { acctId } });
            const list = res.data?.data || [];
            setCollections(list);

            // Auto-select first collection
            if (list.length > 0 && !selectedId) {
                setSelectedId(list[0]._id);
            }
        } catch (err) {
            showError('Failed to load collections.');
        } finally {
            setLoadingList(false);
        }
    }, [acctId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { fetchCollections(); }, [fetchCollections]);

    // ── Fetch collection field detail ──────────────────────────────────────

    useEffect(() => {
        if (!selectedId || !acctId) return;
        setLoadingDetail(true);
        api.get(`/api/ui/leads/collections/${selectedId}/fields`, { params: { acctId } })
            .then(res => {
                const data = res.data?.data;
                if (!data) return;
                const annotated = { ...data, fields: (data.fields || []).map(f => SYSTEM_FIELD_KEYS.has(f.field) ? { ...f, system: true } : f) };
                setSelectedCollection(annotated);
                setEditName(data.collectionName);
                // Only user-defined fields go into editFields; system fields remain locked
                setEditFields((data.fields || []).filter(f => !SYSTEM_FIELD_KEYS.has(f.field)));
            })
            .catch(() => showError('Failed to load collection fields.'))
            .finally(() => setLoadingDetail(false));
    }, [selectedId, acctId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Field editor helpers ───────────────────────────────────────────────

    const _nextKeyRef = useRef(0);
    const addField = () => {
        const _key = `_new_${_nextKeyRef.current++}`;
        setEditFields(prev => [...prev, { label: '', field: '', type: 'text', _new: true, _key }]);
    };

    const updateField = (index, key, value) => {
        setEditFields(prev => prev.map((f, i) => {
            if (i !== index) return f;
            const updated = { ...f, [key]: value };
            if (key === 'label') updated.field = deriveFieldKey(value);
            return updated;
        }));
    };

    const removeField = (index) => {
        setEditFields(prev => prev.filter((_, i) => i !== index));
    };

    const reorderField = (fromIndex, toIndex) => {
        if (fromIndex === toIndex) return;
        setEditFields(prev => {
            const next = [...prev];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, moved);
            return next;
        });
    };

    // ── Save collection ────────────────────────────────────────────────────

    const handleRevert = () => {
        if (!selectedCollection) return;
        setEditName(selectedCollection.collectionName);
        setEditFields((selectedCollection.fields || []).filter(f => !SYSTEM_FIELD_KEYS.has(f.field)));
    };

    const handleSave = async () => {
        if (!selectedId) return;
        // Validate: non-system fields must have a non-empty label
        const invalid = editFields.some(f => !f.system && !f.label.trim());
        if (invalid) {
            showError('All columns must have a name.');
            return;
        }
        setSaving(true);
        try {
            const systemFields = (selectedCollection.fields || []).filter(f => SYSTEM_FIELD_KEYS.has(f.field));
            const res = await api.put(`/api/ui/leads/collections/${selectedId}`, {
                collectionName: editName,
                fields:         [...systemFields, ...editFields.map(f => ({ label: f.label.trim(), type: f.type }))]
            }, { params: { acctId } });

            const updated = res.data?.data;
            const annotatedUpd = { ...updated, fields: (updated.fields || []).map(f => SYSTEM_FIELD_KEYS.has(f.field) ? { ...f, system: true } : f) };
            setSelectedCollection(annotatedUpd);
            setEditName(updated.collectionName);
            setEditFields((updated.fields || []).filter(f => !SYSTEM_FIELD_KEYS.has(f.field)));

            // Refresh list in case name changed
            setCollections(prev => prev.map(c =>
                c._id === selectedId ? { ...c, collectionName: updated.collectionName } : c
            ));
            showSuccess('Collection saved successfully.');
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to save collection.');
        } finally {
            setSaving(false);
        }
    };

    // Keep the selected collection's stages in sync after a stage CRUD operation,
    // and mirror them into the lightweight list so the grid/other tabs stay current.
    const handleStagesChange = (stages) => {
        setSelectedCollection(prev => prev ? { ...prev, stages } : prev);
        setCollections(prev => prev.map(c => c._id === selectedId ? { ...c, stages } : c));
    };

    // ── Delete collection ──────────────────────────────────────────────────

    const handleDeleteCollection = async () => {
        if (!selectedId) return;
        setDeleteLoading(true);
        try {
            await api.delete(`/api/ui/leads/collections/${selectedId}`, { params: { acctId } });
            const remaining = collections.filter(c => c._id !== selectedId);
            setCollections(remaining);
            setShowDeleteDialog(false);
            setSelectedId(remaining.length > 0 ? remaining[0]._id : null);
            setSelectedCollection(null);
            showSuccess('Collection deleted.');
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to delete collection.');
        } finally {
            setDeleteLoading(false);
        }
    };

    // ── Create collection ──────────────────────────────────────────────────

    const handleCreate = async (normalisedName) => {
        setCreateSaving(true);
        try {
            const res = await api.post('/api/ui/leads/collections', {
                collectionName: normalisedName,
                fields: []
            }, { params: { acctId } });
            const created = res.data?.data;
            setCollections(prev => [...prev, { _id: created._id, collectionName: created.collectionName, default: created.default, stages: created.stages || [] }]);
            setSelectedId(created._id);
            setShowNewCollectionDialog(false);
            showSuccess(`Collection "${created.collectionName}" created.`);
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to create collection.');
        } finally {
            setCreateSaving(false);
        }
    };

    // ── Rename collection ──────────────────────────────────────────────────

    const handleRename = async (normalisedName) => {
        if (!selectedId) return;
        setSaving(true);
        try {
            const res = await api.put(`/api/ui/leads/collections/${selectedId}`, {
                collectionName: normalisedName
            }, { params: { acctId } });
            const updated = res.data?.data;
            setEditName(updated.collectionName);
            setSelectedCollection(prev => prev ? { ...prev, collectionName: updated.collectionName } : prev);
            setCollections(prev => prev.map(c =>
                c._id === selectedId ? { ...c, collectionName: updated.collectionName } : c
            ));
            setShowRenameDialog(false);
            showSuccess('Collection renamed.');
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to rename collection.');
        } finally {
            setSaving(false);
        }
    };

    // ── Derived state ──────────────────────────────────────────────────────

    const hasUnsavedChanges = selectedCollection && (
        editName !== selectedCollection.collectionName ||
        JSON.stringify(editFields.map(f => ({ field: f.field, label: f.label, type: f.type }))) !==
        JSON.stringify((selectedCollection.fields || []).filter(f => !SYSTEM_FIELD_KEYS.has(f.field)).map(f => ({ field: f.field, label: f.label, type: f.type })))
    );

    // Combine system fields from selectedCollection + current user editFields for modal
    const collectionForApiInfo = selectedCollection ? {
        ...selectedCollection,
        fields: [
            ...(selectedCollection.fields || []).filter(f => SYSTEM_FIELD_KEYS.has(f.field)),
            ...editFields,
        ]
    } : null;

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <div className="flex gap-6 min-h-[480px]">

            {/* ── Left sidebar: collection list ────────────────────────── */}
            <div className="w-52 flex-shrink-0 flex flex-col gap-2">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Collections</span>
                    <Tooltip content="Add new collection" placement="top">
                        <button
                            onClick={() => setShowNewCollectionDialog(true)}
                            className="w-6 h-6 flex items-center justify-center rounded-md bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                            </svg>
                        </button>
                    </Tooltip>
                </div>

                {loadingList ? (
                    <div className="flex justify-center py-6">
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-indigo-600" />
                    </div>
                ) : collections.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">No collections yet</p>
                ) : (
                    <ul className="space-y-1">
                        {collections.map(col => (
                            <li key={col._id}>
                                <button
                                    onClick={() => setSelectedId(col._id)}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors truncate ${
                                        selectedId === col._id
                                            ? 'bg-indigo-600 text-white'
                                            : 'text-gray-700 hover:bg-gray-100'
                                    }`}
                                >
                                    {col.collectionName}
                                    {col.default && (
                                        <span className={`ml-1.5 text-[9px] font-semibold uppercase ${selectedId === col._id ? 'text-indigo-200' : 'text-indigo-400'}`}>
                                            default
                                        </span>
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* ── Right panel: collection detail ───────────────────────── */}
            <div className="flex-1 min-w-0">
                {!selectedId ? (
                    <div className="flex items-center justify-center h-full text-gray-400 text-xs">
                        Select a collection or create a new one.
                    </div>
                ) : loadingDetail ? (
                    <div className="flex justify-center py-10">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-indigo-600" />
                    </div>
                ) : selectedCollection ? (
                    <div className="flex flex-col gap-4">
                        {/* Header row */}
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-1.5">
                                <h3 className="text-sm font-bold text-gray-900">{selectedCollection.collectionName}</h3>
                                <Tooltip content="Rename collection" placement="top">
                                    <button
                                        onClick={() => setShowRenameDialog(true)}
                                        className="group relative w-7 h-7 flex items-center justify-center bg-transparent rounded-md hover:bg-blue-50 transition-all duration-200 border border-gray-300 hover:border-blue-300 focus:ring-1 focus:ring-blue-300"
                                    >
                                        <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                    </button>
                                </Tooltip>
                                <Tooltip content="Delete collection" placement="top">
                                    <button
                                        onClick={() => setShowDeleteDialog(true)}
                                        className="group relative w-7 h-7 flex items-center justify-center bg-transparent rounded-md hover:bg-red-50 transition-all duration-200 border border-gray-300 hover:border-red-300 focus:ring-1 focus:ring-red-300"
                                    >
                                        <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </Tooltip>
                            </div>
                            <div className="flex items-center gap-2">
                                <Tooltip
                                    content={hasUnsavedChanges ? 'Save your changes before copying API info' : undefined}
                                    placement="top"
                                >
                                    <span>
                                        <Button
                                            size="sm"
                                            variant="secondary"
                                            scheme="primary"
                                            disabled={hasUnsavedChanges}
                                            onClick={() => !hasUnsavedChanges && setShowApiInfo(true)}
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                            Copy API Info
                                        </Button>
                                    </span>
                                </Tooltip>
                                <Button
                                    size="sm"
                                    onClick={handleSave}
                                    disabled={saving || !hasUnsavedChanges}
                                    loading={saving}
                                >
                                    Save Changes
                                </Button>
                                {hasUnsavedChanges && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={handleRevert}
                                        disabled={saving}
                                    >
                                        Revert
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Column definitions table */}
                        <div className="border border-gray-200 rounded-lg" style={{ overflow: 'visible' }}>
                            <table className="min-w-full" style={{ borderCollapse: 'collapse', borderRadius: '0.5rem', overflow: 'hidden' }}>
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-2 py-2.5 w-6 rounded-tl-lg" />
                                        <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider w-1/2">Column Name</th>
                                        <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider w-1/4">Field Key</th>
                                        <th className="px-4 py-2.5 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider w-1/6">Type</th>
                                        <th className="px-4 py-2.5 w-10 rounded-tr-lg" />
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    {/* System fields — always locked, shown first */}
                                    {(selectedCollection.fields || []).filter(f => SYSTEM_FIELD_KEYS.has(f.field)).map(field => (
                                        <FieldRow
                                            key={field.field}
                                            field={field}
                                            index={-1}
                                            onChange={() => {}}
                                            onRemove={() => {}}
                                            onReorder={() => {}}
                                            totalFields={editFields.length}
                                        />
                                    ))}
                                    {/* User-defined fields — editable and reorderable */}
                                    {editFields.map((field, index) => (
                                        <FieldRow
                                            key={field._key || field.field || index}
                                            field={field}
                                            index={index}
                                            onChange={updateField}
                                            onRemove={removeField}
                                            onReorder={reorderField}
                                            totalFields={editFields.length}
                                        />
                                    ))}

                                    {/* Add row */}
                                    <tr>
                                        <td colSpan={5} className="px-4 py-2.5">
                                            <button
                                                onClick={addField}
                                                className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                                </svg>
                                                Add Column
                                            </button>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Lead stages */}
                        <StagesEditor
                            acctId={acctId}
                            collectionId={selectedId}
                            stages={selectedCollection.stages || []}
                            onStagesChange={handleStagesChange}
                            showSuccess={showSuccess}
                            showError={showError}
                        />
                    </div>
                ) : null}
            </div>

            {/* ── Dialogs ───────────────────────────────────────────────── */}
            {showNewCollectionDialog && (
                <CollectionNameDialog
                    onSave={handleCreate}
                    onClose={() => setShowNewCollectionDialog(false)}
                    saving={createSaving}
                />
            )}

            {showRenameDialog && (
                <CollectionNameDialog
                    initial={editName}
                    onSave={handleRename}
                    onClose={() => setShowRenameDialog(false)}
                    saving={saving}
                />
            )}

            {showApiInfo && (
                <ApiInfoModal
                    collection={collectionForApiInfo}
                    acctNo={acctNo}
                    acctId={acctId}
                    onClose={() => setShowApiInfo(false)}
                />
            )}

            {showDeleteDialog && selectedCollection && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !deleteLoading && setShowDeleteDialog(false)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm p-6 flex flex-col gap-4">
                        {/* Icon */}
                        <div className="flex justify-center">
                            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                                <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </div>
                        </div>

                        {/* Title */}
                        <div className="text-center">
                            <h3 className="text-sm font-bold text-gray-900">Delete Collection</h3>
                            <p className="text-xs text-gray-500 mt-1">
                                "{selectedCollection.collectionName}"
                            </p>
                        </div>

                        {/* Warning */}
                        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-xs text-red-800">
                            This will also delete <strong>all leads</strong> in this collection.
                            This action <strong>cannot be recovered</strong>.
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 justify-end">
                            <Button
                                size="sm"
                                variant="secondary"
                                scheme="primary"
                                onClick={() => setShowDeleteDialog(false)}
                                disabled={deleteLoading}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                variant="danger"
                                onClick={handleDeleteCollection}
                                disabled={deleteLoading}
                                loading={deleteLoading}
                            >
                                Delete permanently
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Editable field row ────────────────────────────────────────────────────────

const FieldRow = ({ field, index, onChange, onRemove, onReorder, totalFields }) => {
    const preview  = deriveFieldKey(field.label || '');
    const dragRef  = useRef(null);
    const [dragging, setDragging]   = useState(false);
    const [dragOver, setDragOver]   = useState(false);

    // Open upward for the last 2 rows so the menu doesn't get clipped by the viewport bottom
    const dropdownDirection = index >= totalFields - 2 ? 'top' : 'bottom';

    const handleDragStart = (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
        // Use the whole row as the drag image
        if (dragRef.current) e.dataTransfer.setDragImage(dragRef.current, 0, 0);
        setDragging(true);
    };

    const handleDragEnd = () => { setDragging(false); setDragOver(false); };

    const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(true); };
    const handleDragLeave = () => setDragOver(false);

    const handleDrop = (e) => {
        e.preventDefault();
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        setDragOver(false);
        if (!isNaN(fromIndex)) onReorder(fromIndex, index);
    };

    return (
        <tr
            ref={dragRef}
            className={[
                'transition-colors',
                dragging  ? 'opacity-40 bg-indigo-50'   : 'hover:bg-gray-50',
                dragOver  ? 'bg-indigo-50 border-t-2 border-indigo-400' : '',
            ].filter(Boolean).join(' ')}
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            {/* Drag handle */}
            <td className="px-2 py-2 w-6">
                <span className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing transition-colors block">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M7 2a1 1 0 110 2 1 1 0 010-2zm6 0a1 1 0 110 2 1 1 0 010-2zM7 7a1 1 0 110 2 1 1 0 010-2zm6 0a1 1 0 110 2 1 1 0 010-2zM7 12a1 1 0 110 2 1 1 0 010-2zm6 0a1 1 0 110 2 1 1 0 010-2z" />
                    </svg>
                </span>
            </td>
            <td className="px-4 py-2">
                {field.system ? (
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-gray-500">{field.label}</span>
                        {field.tooltip && (
                            <Tooltip content={field.tooltip} placement="right">
                                <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </Tooltip>
                        )}
                        {field.required && (
                            <span className="text-[9px] font-bold text-red-500 uppercase">required</span>
                        )}
                    </div>
                ) : (
                    <input
                        type="text"
                        value={field.label}
                        onChange={e => onChange(index, 'label', e.target.value)}
                        placeholder="Column name..."
                        className="ds-input ds-input--xs w-full"
                    />
                )}
            </td>
            <td className="px-4 py-2">
                <code className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                    {field.system ? field.field : (preview || <span className="text-gray-300">auto</span>)}
                </code>
            </td>
            <td className="px-4 py-2">
                {field.system ? (
                    <span className="text-[10px] text-gray-400">{field.type}</span>
                ) : (
                <Dropdown
                    align="left"
                    direction={dropdownDirection}
                    trigger={
                        <button
                            type="button"
                            className="ds-input ds-input--xs flex items-center gap-1.5 pr-6 cursor-pointer select-none"
                            style={{ minWidth: '90px' }}
                        >
                            <span className="text-indigo-500">{FIELD_TYPE_META[field.type]?.icon}</span>
                            <span>{FIELD_TYPE_META[field.type]?.label ?? field.type}</span>
                            <svg className="w-3 h-3 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                        </button>
                    }
                >
                    {FIELD_TYPES.map(t => (
                        <DropdownItem
                            key={t}
                            active={field.type === t}
                            icon={FIELD_TYPE_META[t].icon}
                            onClick={() => onChange(index, 'type', t)}
                        >
                            {FIELD_TYPE_META[t].label}
                        </DropdownItem>
                    ))}
                </Dropdown>
                )}
            </td>
            <td className="px-4 py-2">
                {field.system ? (
                    <svg className="w-3.5 h-3.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                ) : (
                    <button
                        onClick={() => onRemove(index)}
                        className="group relative w-6 h-6 flex items-center justify-center bg-transparent rounded-md hover:bg-red-50 transition-all duration-200 border border-gray-300 hover:border-red-300 focus:ring-1 focus:ring-red-300"
                        title="Remove column"
                    >
                        <svg className="w-3.5 h-3.5 text-gray-400 group-hover:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                )}
            </td>
        </tr>
    );
};

export default CollectionTab;

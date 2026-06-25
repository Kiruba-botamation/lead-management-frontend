/**
 * Webhooks Settings Tab
 *
 * Configure outbound webhooks per account: subscribe a target URL to lead
 * events (created / assigned / unassigned), enable/disable, and review recent
 * deliveries. Superadmin-only management; the signing secret is shown once on
 * creation. Payloads are signed with HMAC-SHA256 (X-Webhook-Signature header).
 */
import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/axiosConfig';
import { useNotifications } from '../../components/Notifications';
import Button from '../../components/ui/Button';
import ConfirmationDialog from '../../components/ConfirmationDialog';

const EVENT_LABELS = {
    'lead.created':    'New Lead',
    'lead.assigned':   'Lead Assigned',
    'lead.unassigned': 'Lead Unassigned',
};

const WebhooksTab = ({ acctId: acctIdProp }) => {
    const acctId = acctIdProp || localStorage.getItem('acctId') || '';
    const { showSuccess, showError, NotificationComponent } = useNotifications();

    const [events, setEvents] = useState([]);
    const [configs, setConfigs] = useState([]);
    const [deliveries, setDeliveries] = useState([]);
    const [accessLevel, setAccessLevel] = useState(null);
    const [loading, setLoading] = useState(false);

    // Create form
    const [showForm, setShowForm] = useState(false);
    const [formUrl, setFormUrl] = useState('');
    const [formEvents, setFormEvents] = useState([]);
    const [saving, setSaving] = useState(false);
    const [newSecret, setNewSecret] = useState(null); // secret to surface once after creation

    const [deleteId, setDeleteId] = useState(null);

    const isSuperadmin = accessLevel === 'superadmin';

    const load = useCallback(async () => {
        if (!acctId) return;
        setLoading(true);
        try {
            const [cfgRes, delRes] = await Promise.all([
                api.get('/api/ui/webhooks', { params: { acctId } }),
                api.get('/api/ui/webhooks/deliveries', { params: { acctId, limit: 20 } }),
            ]);
            setEvents(cfgRes.data?.events || []);
            setConfigs(cfgRes.data?.configs || []);
            setAccessLevel(cfgRes.data?.currentUserAccessLevel ?? null);
            setDeliveries(delRes.data?.deliveries || []);
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to load webhooks.');
        } finally {
            setLoading(false);
        }
    }, [acctId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { load(); }, [load]);

    const toggleFormEvent = (ev) => {
        setFormEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]);
    };

    const resetForm = () => {
        setFormUrl('');
        setFormEvents([]);
        setShowForm(false);
    };

    const handleCreate = async () => {
        if (!/^https?:\/\//i.test(formUrl)) { showError('Enter a valid http(s) URL.'); return; }
        if (formEvents.length === 0) { showError('Select at least one event.'); return; }
        setSaving(true);
        try {
            const res = await api.post('/api/ui/webhooks', { acctId, url: formUrl, events: formEvents });
            setNewSecret(res.data?.config?.secret || null);
            resetForm();
            await load();
            showSuccess('Webhook created.');
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to create webhook.');
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (cfg) => {
        try {
            await api.put(`/api/ui/webhooks/${cfg._id}`, { acctId, active: !cfg.active });
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
            <NotificationComponent />
            <div className="flex items-start justify-between mb-1">
                <h2 className="text-base font-bold text-gray-900">Webhooks</h2>
                {isSuperadmin && !showForm && (
                    <Button size="sm" onClick={() => setShowForm(true)}>
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

            {/* Create form */}
            {showForm && (
                <div className="mb-5 border border-gray-200 rounded-lg p-4">
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Target URL</label>
                    <input
                        type="url"
                        value={formUrl}
                        onChange={(e) => setFormUrl(e.target.value)}
                        placeholder="https://example.com/webhooks/leads"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 mb-3"
                    />
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Events</label>
                    <div className="flex flex-col gap-1.5 mb-4">
                        {events.map(ev => (
                            <label key={ev} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                                <input type="checkbox" checked={formEvents.includes(ev)} onChange={() => toggleFormEvent(ev)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                {EVENT_LABELS[ev] || ev}
                            </label>
                        ))}
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button size="sm" variant="secondary" scheme="primary" onClick={resetForm} disabled={saving}>Cancel</Button>
                        <Button size="sm" onClick={handleCreate} loading={saving} disabled={saving}>Create</Button>
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
                            <p className="text-xs font-medium text-gray-800 truncate">{cfg.url}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                                {(cfg.events || []).map(ev => (
                                    <span key={ev} className="text-[10px] font-medium bg-indigo-50 text-indigo-700 rounded px-1.5 py-0.5">{EVENT_LABELS[ev] || ev}</span>
                                ))}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cfg.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                {cfg.active ? 'Active' : 'Disabled'}
                            </span>
                            {isSuperadmin && (
                                <>
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

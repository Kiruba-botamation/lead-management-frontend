import React, { useState, useEffect, useCallback, useRef } from 'react';
import api, { authApi } from '../../api/axiosConfig';
import Tooltip from '../../components/Tooltip';
import Button from '../../components/ui/Button';
import { Dropdown, DropdownItem } from '../../components/ui/Dropdown';

/** Blank profile-edit form. */
const EMPTY_FORM = { firstName: '', lastName: '', email: '', phone: '', profileImage: '', accessLevel: 'admin' };

// Fixed column schema for the admin grid.
//  - `filter`: 'text' shows a debounced text filter; 'select' shows the access-level dropdown; null = no filter
const COLUMNS = [
    { key: 'firstName',      label: 'Name',            type: 'name',   filter: 'text', align: 'left'   },
    { key: 'lastName',       label: 'Last Name',       type: 'text',   filter: 'text', align: 'center' },
    { key: 'email',          label: 'Email',           type: 'text',   filter: 'text', align: 'center' },
    { key: 'phone',          label: 'Phone',           type: 'text',   filter: 'text', align: 'center' },
    { key: 'chatbotAdminId', label: 'Assignment IDs',  type: 'identifiers', filter: 'text', align: 'center' },
    { key: 'accessLevel',    label: 'Access Level',    type: 'badge',  filter: 'select', align: 'center' },
    { key: 'createdAt',      label: 'Created Date',    type: 'date',   filter: null,   align: 'center' },
    { key: 'updatedAt',      label: 'Updated Date',    type: 'date',   filter: null,   align: 'center' },
];

const AVATAR_COLORS = [
    '#4f46e5', '#0891b2', '#059669', '#d97706',
    '#dc2626', '#7c3aed', '#db2777', '#0284c7',
];
// Seed the avatar colour on the first two letters of the name for a stable per-admin colour
const getAvatarColor = (str) => {
    if (!str) return AVATAR_COLORS[0];
    const seed = (str.charCodeAt(0) || 0) + (str.charCodeAt(1) || 0);
    return AVATAR_COLORS[seed % AVATAR_COLORS.length];
};

const fullName = (a) => [a.firstName || '', a.lastName || ''].filter(Boolean).join(' ') || '-';

const AssignmentIdentifiers = ({ admin, copied, onCopy }) => {
    const identifiers = [
        { label: 'Chatbot ID', value: admin.chatbotAdminId },
        { label: 'Admin ID', value: admin._id },
        { label: 'User ID', value: admin.userId },
    ].filter(identifier => identifier.value);
    const primary = identifiers[0];

    return (
        <div className="inline-flex items-center gap-2">
            <div className="flex min-w-0 flex-col text-left">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">{primary?.label || 'Identifier'}</span>
                <code className="max-w-28 truncate ds-code text-[10px] text-gray-700" title={primary?.value || ''}>
                    {primary?.value || '-'}
                </code>
            </div>
            {identifiers.length > 0 && (
                <Dropdown
                    align="right"
                    portal
                    trigger={(
                        <Tooltip content={copied ? 'Copied!' : 'Copy assignment ID'} placement="top">
                            <Button type="button" variant="secondary" size="sm" aria-label="Copy an assignment ID">
                                {copied ? (
                                    <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                ) : (
                                    <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                )}
                                {copied ? 'Copied' : 'Copy IDs'}
                            </Button>
                        </Tooltip>
                    )}
                >
                    {identifiers.map(identifier => (
                        <DropdownItem key={identifier.label} onClick={() => onCopy(identifier.value)} className="min-w-64">
                            <span className="flex w-full items-center justify-between gap-4">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{identifier.label}</span>
                                <code className="ds-code max-w-40 truncate text-[10px] text-gray-700" title={identifier.value}>{identifier.value}</code>
                            </span>
                        </DropdownItem>
                    ))}
                </Dropdown>
            )}
        </div>
    );
};

const ROLE_COLORS = {
    superadmin: { bg: 'bg-indigo-100', text: 'text-indigo-700', dot: 'bg-indigo-500' },
    admin:      { bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400'   },
};

const AccessLevelSelect = ({ roles, value, onChange, disabled }) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const onDocClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    const selected = roles.find(r => r.key === value) || null;
    const colors = ROLE_COLORS[value] || ROLE_COLORS.admin;

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(o => !o)}
                className="ds-input w-full flex items-center justify-between gap-2 text-left disabled:opacity-50"
            >
                <span className="flex items-center gap-2 min-w-0">
                    {selected ? (
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${colors.bg} ${colors.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                            {selected.label}
                        </span>
                    ) : (
                        <span className="text-gray-400">Select role…</span>
                    )}
                </span>
                <svg className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>
            {open && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl py-1 overflow-hidden">
                    {roles.map(r => {
                        const rc = ROLE_COLORS[r.key] || ROLE_COLORS.admin;
                        const isActive = r.key === value;
                        return (
                            <button
                                key={r.key}
                                type="button"
                                onClick={() => { onChange(r.key); setOpen(false); }}
                                className={`w-full px-3 py-2 flex items-center gap-2.5 text-left text-xs transition-colors ${isActive ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                            >
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${rc.bg} ${rc.text}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${rc.dot}`} />
                                    {r.label}
                                </span>
                                {isActive && (
                                    <svg className="ml-auto w-3.5 h-3.5 text-indigo-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const AdminTab = ({ acctId }) => {
    const [admins, setAdmins] = useState([]);
    const [filters, setFilters] = useState({});
    const [appliedFilters, setAppliedFilters] = useState({});
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState('');
    const [sortField, setSortField] = useState('');
    const [sortOrder, setSortOrder] = useState('asc');
    const filterTimerRef = useRef(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize] = useState(20);
    const [totalPages, setTotalPages] = useState(1);
    const [totalRecords, setTotalRecords] = useState(0);

    const [currentAccessLevel, setCurrentAccessLevel] = useState(null);
    const [roles, setRoles] = useState([]);
    const [editingAdmin, setEditingAdmin] = useState(null);
    const [editForm, setEditForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [authSyncing, setAuthSyncing] = useState(false);
    const [copiedIdentifier, setCopiedIdentifier] = useState('');

    const isSuperadmin = currentAccessLevel === 'superadmin';

    const copyIdentifier = async (value) => {
        try {
            await navigator.clipboard.writeText(String(value));
            setCopiedIdentifier(String(value));
            setTimeout(() => setCopiedIdentifier(current => current === String(value) ? '' : current), 2000);
        } catch {
            setError('Failed to copy the admin identifier.');
        }
    };

    const loadAdmins = useCallback(async (endpoint, filterParams = {}, sortBy = '', order = 'asc', page = 1, limit = 20) => {
        if (!acctId) return;
        const setBusy = endpoint === '/api/ui/admins' ? setSyncing : setLoading;
        setBusy(true);
        setError('');
        try {
            const params = { acctId, page, limit, ...filterParams };
            if (sortBy) { params.sortBy = sortBy; params.sortOrder = order; }
            const response = await api.get(endpoint, { params });
            const data = response.data;
            const list = Array.isArray(data) ? data : (data.admins || data.data || []);
            const pagination = data.pagination || null;
            setAdmins(list);
            setCurrentAccessLevel(data.currentUserAccessLevel ?? null);
            setTotalRecords(pagination?.total ?? list.length);
            setTotalPages(pagination?.pages ?? 1);
            setCurrentPage(pagination?.page ?? page);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to load admins.');
        } finally {
            setBusy(false);
        }
    }, [acctId]);

    const buildActiveFilters = useCallback(() => (
        Object.keys(appliedFilters).reduce((acc, k) => {
            if (appliedFilters[k]) acc[k] = appliedFilters[k];
            return acc;
        }, {})
    ), [appliedFilters]);

    // Initial load + reload on filter/sort/page change
    useEffect(() => {
        loadAdmins('/api/ui/admins/list', buildActiveFilters(), sortField, sortOrder, currentPage, pageSize);
    }, [loadAdmins, appliedFilters, sortField, sortOrder, currentPage, pageSize]); // eslint-disable-line react-hooks/exhaustive-deps

    // Load roles once for the edit dropdown
    useEffect(() => {
        if (!acctId) return;
        api.get('/api/ui/roles', { params: { acctId } })
            .then((res) => setRoles(res.data?.roles || []))
            .catch(() => setRoles([]));
    }, [acctId]);

    const syncAdmins = useCallback(() => {
        loadAdmins('/api/ui/admins', buildActiveFilters(), sortField, sortOrder, currentPage, pageSize);
    }, [loadAdmins, buildActiveFilters, sortField, sortOrder, currentPage, pageSize]);

    const handleFilterChange = (col, val) => {
        setFilters(prev => ({ ...prev, [col]: val }));
        if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
        filterTimerRef.current = setTimeout(() => {
            setCurrentPage(1);
            setAppliedFilters(prev => {
                const updated = { ...prev };
                if (val) updated[col] = val; else delete updated[col];
                return updated;
            });
        }, 500);
    };

    const handleSort = (col) => {
        if (sortField === col) {
            setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(col);
            setSortOrder('asc');
        }
        setCurrentPage(1);
    };

    const goToPage = (page) => {
        if (page >= 1 && page <= totalPages) setCurrentPage(page);
    };

    const openEdit = (admin) => {
        setEditingAdmin(admin);
        setEditForm({
            firstName: admin.firstName || '',
            lastName: admin.lastName || '',
            email: admin.email || '',
            phone: admin.phone || '',
            profileImage: admin.profileImage || '',
            accessLevel: admin.accessLevel || 'admin',
        });
    };

    const setField = (key, val) => setEditForm(prev => ({ ...prev, [key]: val }));

    // Pull fresh name/email/phone/picture from the auth app by the admin's userId and
    // persist them onto the admin record (req: sync admin details from the auth app).
    const syncFromAuth = async () => {
        if (!editingAdmin?.userId) return;
        setAuthSyncing(true);
        setError('');
        try {
            const res = await authApi.get(`/api/user/users/${editingAdmin.userId}`);
            const u = res.data?.user || res.data || {};
            // Full name lives in a single field on the auth profile → store it in firstName
            setEditForm(prev => ({
                ...prev,
                firstName: u.name ?? prev.firstName,
                lastName: u.name ? '' : prev.lastName,
                email: u.email ?? prev.email,
                phone: u.phone ?? prev.phone,
                profileImage: u.profileImageUrl ?? prev.profileImage,
            }));
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to fetch user details from the auth app.');
        } finally {
            setAuthSyncing(false);
        }
    };

    const saveAdmin = async () => {
        if (!editingAdmin) return;
        setSaving(true);
        setError('');
        try {
            // Profile fields (everyone may edit their own; superadmins may edit anyone)
            await api.patch('/api/ui/admins/profile', {
                acctId,
                chatbotAdminId: editingAdmin.chatbotAdminId,
                firstName: editForm.firstName,
                lastName: editForm.lastName,
                email: editForm.email,
                phone: editForm.phone,
                profileImage: editForm.profileImage,
            });

            // Access level — superadmin only, and only when it actually changed
            const levelChanged = editForm.accessLevel !== editingAdmin.accessLevel;
            if (isSuperadmin && levelChanged) {
                await api.patch('/api/ui/admins/access-level', {
                    acctId,
                    chatbotAdminId: editingAdmin.chatbotAdminId,
                    accessLevel: editForm.accessLevel,
                });
            }

            const patch = {
                firstName: editForm.firstName,
                lastName: editForm.lastName,
                email: editForm.email,
                phone: editForm.phone,
                profileImage: editForm.profileImage,
                ...(isSuperadmin && levelChanged ? { accessLevel: editForm.accessLevel } : {}),
            };
            setAdmins(prev => prev.map(a => (a._id === editingAdmin._id ? { ...a, ...patch } : a)));
            setEditingAdmin(null);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to update admin.');
        } finally {
            setSaving(false);
        }
    };

    const renderSortIcon = (col) => {
        if (sortField !== col) {
            return (
                <svg className="absolute -right-4 w-3 h-3 text-indigo-400 opacity-0 group-hover/sort:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
            );
        }
        return (
            <svg className="absolute -right-4 w-3 h-3 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sortOrder === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
            </svg>
        );
    };

    const renderCell = (admin, col) => {
        if (col.type === 'name') {
            const name = fullName(admin);
            const display = admin.firstName || name;
            return (
                <div className="flex items-center justify-start gap-1.5">
                    {admin.profileImage ? (
                        <img src={admin.profileImage} alt={display} className="w-5 h-5 rounded-full object-cover border border-gray-200 flex-shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
                    ) : (
                        <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-[9px] select-none" style={{ backgroundColor: getAvatarColor(name) }}>
                            {name && name !== '-' ? name.charAt(0).toUpperCase() : '?'}
                        </span>
                    )}
                    <span>{display}</span>
                </div>
            );
        }
        if (col.type === 'badge') {
            const isSuper = admin.accessLevel === 'superadmin';
            return (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${isSuper ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                    {isSuper ? 'Super Admin' : 'Admin'}
                </span>
            );
        }
        if (col.type === 'identifiers') {
            return (
                <AssignmentIdentifiers admin={admin} copied={[
                    admin.chatbotAdminId,
                    admin._id,
                    admin.userId,
                ].some(value => copiedIdentifier === String(value))} onCopy={copyIdentifier} />
            );
        }
        if (col.type === 'date') {
            return admin[col.key] ? new Date(admin[col.key]).toLocaleDateString() : '-';
        }
        const v = admin[col.key];
        return v != null && v !== '' ? String(v) : '-';
    };

    // Everyone gets an edit action (non-superadmins only ever see their own row);
    // the access-level field inside the editor is what's gated to superadmins.
    const colCount = COLUMNS.length + 1;

    return (
        <div className="h-full flex flex-col">
            <div className="mb-3 flex-shrink-0 flex justify-start gap-2">
                <Tooltip content={syncing ? 'Syncing...' : 'Sync admins'} placement="top">
                    <button
                        onClick={syncAdmins}
                        disabled={syncing || loading}
                        className="group relative w-8 h-8 flex items-center justify-center bg-transparent rounded-lg hover:bg-indigo-50 transition-all duration-300 hover:scale-110 border border-gray-300 hover:border-indigo-400 focus:ring-1 focus:ring-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed"
                        title={syncing ? 'Syncing...' : 'Sync admins'}
                    >
                        <svg
                            className={`w-4 h-4 text-gray-700 group-hover:text-gray-900 transition-colors ${syncing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                </Tooltip>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-white rounded-lg shadow-2xl border border-gray-200">
                {error && (
                    <div className="bg-rose-50 border-l-4 border-rose-500 text-rose-900 px-3 py-2 m-3 rounded-lg">
                        <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-xs font-medium">Error: {error}</span>
                        </div>
                    </div>
                )}
                <div className="flex-1 overflow-y-scroll overflow-x-auto min-h-0">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="sticky top-0 z-10 bg-white/70 backdrop-blur-xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] transition-all group/header">
                            <tr>
                                {COLUMNS.map((col) => (
                                    <th key={col.key} className={`px-3 py-2.5 relative align-bottom ${col.align === 'left' ? 'text-left' : 'text-center'}`}>
                                        <div
                                            className={`flex items-center ${col.align === 'left' ? 'justify-start' : 'justify-center'} cursor-pointer group/sort mb-1.5 transition-colors`}
                                            onClick={() => handleSort(col.key)}
                                        >
                                            <div className="relative inline-flex items-center">
                                                <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider group-hover/sort:text-indigo-600 transition-colors">
                                                    {col.label}
                                                </span>
                                                {renderSortIcon(col.key)}
                                            </div>
                                        </div>
                                        {col.filter && (
                                            <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${Object.values(filters).some(Boolean) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] group-hover/header:grid-rows-[1fr] group-focus-within/header:grid-rows-[1fr]'}`}>
                                                <div className="overflow-hidden">
                                                    <div className="pb-1 pt-0.5 px-0.5">
                                                        {col.filter === 'select' ? (
                                                            <select
                                                                value={filters[col.key] || ''}
                                                                onChange={(e) => handleFilterChange(col.key, e.target.value)}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="w-full px-2 py-1 text-[10px] bg-white border border-slate-200 text-slate-700 rounded-md outline-none focus:border-indigo-400"
                                                            >
                                                                <option value="">All</option>
                                                                {roles.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                                                            </select>
                                                        ) : (
                                                            <div className="relative rounded-md bg-slate-200/80 focus-within:bg-gradient-to-r focus-within:from-indigo-500 focus-within:via-violet-400 focus-within:to-indigo-500 p-[1px] transition-all duration-300 shadow-sm">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Filter..."
                                                                    value={filters[col.key] || ''}
                                                                    onChange={(e) => handleFilterChange(col.key, e.target.value)}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className={`w-full px-2 py-1 text-[10px] bg-white/70 focus:bg-white text-slate-700 rounded-[5px] outline-none placeholder-slate-400 transition-all ${col.align === 'left' ? 'text-left' : 'text-center'}`}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </th>
                                ))}
                                <th className="px-3 py-2.5 text-center align-bottom">
                                    <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Actions</span>
                                </th>
                            </tr>
                            <tr>
                                <th colSpan="100" className="p-0 h-[3px] bg-gradient-to-r from-indigo-500 via-violet-400 to-indigo-500 border-none shadow-[0_0_15px_rgba(99,102,241,0.6)] relative z-20"></th>
                            </tr>
                        </thead>
                        <tbody className={`bg-white divide-y divide-gray-100 transition-opacity duration-200 ${loading && admins.length > 0 ? 'opacity-50 pointer-events-none' : ''}`}>
                            {loading && admins.length === 0 ? (
                                <tr>
                                    <td colSpan={colCount} className="px-3 py-6 text-center">
                                        <div className="flex flex-col justify-center items-center gap-2">
                                            <div className="relative">
                                                <div className="animate-spin rounded-full h-8 w-8 border-4 border-gray-300"></div>
                                                <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent absolute top-0"></div>
                                            </div>
                                            <span className="text-gray-600 text-xs font-medium">Loading admins...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : admins.length === 0 ? (
                                <tr>
                                    <td colSpan={colCount} className="px-3 py-6 text-center">
                                        <div className="flex flex-col items-center gap-2">
                                            <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                            <span className="text-gray-500 text-xs font-medium">No admins found</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                admins.map((admin) => (
                                    <tr key={admin._id} className="hover:bg-gray-50 transition-all duration-200">
                                        {COLUMNS.map((col) => (
                                            <td key={col.key} className={`px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 font-medium ${col.align === 'left' ? 'text-left' : 'text-center'}`}>
                                                {renderCell(admin, col)}
                                            </td>
                                        ))}
                                        <td className="px-3 py-2 whitespace-nowrap text-center">
                                            <Tooltip content="Edit admin" placement="top">
                                                <button
                                                    onClick={() => openEdit(admin)}
                                                    className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition-all"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </button>
                                            </Tooltip>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div className="flex-shrink-0 bg-gray-50 px-3 py-2 flex items-center justify-between border-t border-gray-200">
                    <p className="text-xs text-gray-700 font-medium">
                        Showing <span className="font-bold text-indigo-700">{totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1}</span> to{' '}
                        <span className="font-bold text-indigo-700">{Math.min(currentPage * pageSize, totalRecords)}</span> of{' '}
                        <span className="font-bold text-indigo-700">{totalRecords}</span> results
                    </p>
                    <nav className="relative z-0 inline-flex rounded shadow-sm -space-x-px" aria-label="Pagination">
                        <button
                            onClick={() => goToPage(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="relative inline-flex items-center px-2 py-1 rounded-l border border-gray-300 bg-white text-xs font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            Previous
                        </button>
                        {[...Array(totalPages)].map((_, index) => {
                            const page = index + 1;
                            if (page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1)) {
                                return (
                                    <button
                                        key={page}
                                        onClick={() => goToPage(page)}
                                        className={`relative inline-flex items-center px-2 py-1 border text-xs font-medium transition-all ${currentPage === page
                                            ? 'z-10 bg-gradient-to-b from-indigo-500 to-indigo-700 border-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'}`}
                                    >
                                        {page}
                                    </button>
                                );
                            } else if (page === currentPage - 2 || page === currentPage + 2) {
                                return <span key={page} className="relative inline-flex items-center px-2 py-1 border border-gray-300 bg-white text-xs font-medium text-gray-700">...</span>;
                            }
                            return null;
                        })}
                        <button
                            onClick={() => goToPage(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="relative inline-flex items-center px-2 py-1 rounded-r border border-gray-300 bg-white text-xs font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            Next
                        </button>
                    </nav>
                </div>
            </div>

            {/* Edit admin modal */}
            {editingAdmin && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => !saving && !authSyncing && setEditingAdmin(null)}>
                    <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-96 max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between mb-4">
                            <div>
                                <h3 className="text-sm font-bold text-gray-800">Edit Admin</h3>
                                <p className="text-xs text-gray-500">{fullName(editingAdmin)}</p>
                            </div>
                            <Tooltip content={editingAdmin.userId ? 'Pull name, email, phone & picture from the auth app' : 'No linked user to sync'} placement="left">
                                <button
                                    type="button"
                                    onClick={syncFromAuth}
                                    disabled={saving || authSyncing || !editingAdmin.userId}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <svg className={`w-3.5 h-3.5 ${authSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    {authSyncing ? 'Syncing…' : 'Sync from auth'}
                                </button>
                            </Tooltip>
                        </div>

                        {/* Avatar preview */}
                        <div className="flex items-center gap-3 mb-4">
                            {editForm.profileImage ? (
                                <img src={editForm.profileImage} alt="" className="w-12 h-12 rounded-full object-cover border border-gray-200" onError={(e) => { e.target.style.display = 'none'; }} />
                            ) : (
                                <span className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: getAvatarColor(editForm.firstName || 'A') }}>
                                    {(editForm.firstName || '?').charAt(0).toUpperCase()}
                                </span>
                            )}
                            <div className="flex-1">
                                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Profile Picture URL</label>
                                <input className="ds-input w-full text-xs" value={editForm.profileImage} onChange={(e) => setField('profileImage', e.target.value)} placeholder="https://…" disabled={saving} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                                <label className="block text-[11px] font-semibold text-gray-500 mb-1">First Name</label>
                                <input className="ds-input w-full text-xs" value={editForm.firstName} onChange={(e) => setField('firstName', e.target.value)} disabled={saving} />
                            </div>
                            <div>
                                <label className="block text-[11px] font-semibold text-gray-500 mb-1">Last Name</label>
                                <input className="ds-input w-full text-xs" value={editForm.lastName} onChange={(e) => setField('lastName', e.target.value)} disabled={saving} />
                            </div>
                        </div>
                        <div className="mb-3">
                            <label className="block text-[11px] font-semibold text-gray-500 mb-1">Email</label>
                            <input className="ds-input w-full text-xs" type="email" value={editForm.email} onChange={(e) => setField('email', e.target.value)} disabled={saving} />
                        </div>
                        <div className="mb-3">
                            <label className="block text-[11px] font-semibold text-gray-500 mb-1">Phone</label>
                            <input className="ds-input w-full text-xs" value={editForm.phone} onChange={(e) => setField('phone', e.target.value)} disabled={saving} />
                        </div>

                        <div className="mb-4">
                            <label className="block text-[11px] font-semibold text-gray-500 mb-1">Access Level</label>
                            {isSuperadmin ? (
                                <AccessLevelSelect roles={roles} value={editForm.accessLevel} onChange={(v) => setField('accessLevel', v)} disabled={saving} />
                            ) : (
                                <div className="flex items-center gap-2">
                                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${(ROLE_COLORS[editForm.accessLevel] || ROLE_COLORS.admin).bg} ${(ROLE_COLORS[editForm.accessLevel] || ROLE_COLORS.admin).text}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${(ROLE_COLORS[editForm.accessLevel] || ROLE_COLORS.admin).dot}`} />
                                        {(roles.find(r => r.key === editForm.accessLevel)?.label) || editForm.accessLevel}
                                    </span>
                                    <span className="text-[10px] text-gray-400">Only a super admin can change rights</span>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setEditingAdmin(null)}
                                disabled={saving}
                                className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-all disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveAdmin}
                                disabled={saving}
                                className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all disabled:opacity-50"
                            >
                                {saving ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminTab;

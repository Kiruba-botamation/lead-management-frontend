import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api/axiosConfig';
import Tooltip from '../../components/Tooltip';

const EXCLUDE_KEYS = ['__v', '_id', 'id', 'chatbotAdminId', 'acctNo', 'acctno'];
const COLUMN_ORDER = ['firstName', 'lastName', 'phone', 'email', 'createdAt', 'updatedAt'];
const IMAGE_KEYS = ['profileImage', 'profileImageUrl', 'avatar', 'photo', 'image'];
const NAME_KEYS = ['firstName', 'firstname', 'name', 'fullName', 'fullname', 'username', 'displayName', 'displayname'];

const isImageKey = (k) => IMAGE_KEYS.map(s => s.toLowerCase()).includes(k.toLowerCase());
const isNameKey = (k) => NAME_KEYS.map(s => s.toLowerCase()).includes(k.toLowerCase());

const AVATAR_COLORS = [
    '#4f46e5', '#0891b2', '#059669', '#d97706',
    '#dc2626', '#7c3aed', '#db2777', '#0284c7',
];
const getAvatarColor = (str) =>
    AVATAR_COLORS[str ? str.charCodeAt(0) % AVATAR_COLORS.length : 0];

const formatFieldName = (key) => {
    if (key === 'createdAt') return 'Created Date';
    if (key === 'updatedAt') return 'Updated Date';
    return key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
};

const AdminTab = ({ acctId }) => {
    const [admins, setAdmins] = useState([]);
    const [columns, setColumns] = useState([]);
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

    const loadAdminsFromDb = useCallback(async (filterParams = {}, sortBy = '', order = 'asc', page = 1, limit = 20) => {
        if (!acctId) return;
        setLoading(true);
        setError('');
        try {
            const params = { acctId, page, limit, ...filterParams };
            if (sortBy) { params.sortBy = sortBy; params.sortOrder = order; }
            const response = await api.get('/api/ui/admins/list', { params });
            const data = response.data;
            const list = Array.isArray(data) ? data : (data.admins || data.data || []);
            const pagination = data.pagination || null;
            setAdmins(list);
            setTotalRecords(pagination?.total ?? list.length);
            setTotalPages(pagination?.pages ?? 1);
            setCurrentPage(pagination?.page ?? page);
            if (list.length > 0) {
                const available = new Set(
                    Object.keys(list[0]).filter((k) =>
                        !EXCLUDE_KEYS.map(e => e.toLowerCase()).includes(k.toLowerCase()) && !isImageKey(k)
                    )
                );
                // Fixed order: firstName, lastName, phone, email, createdAt — only include if present
                const ordered = COLUMN_ORDER.filter(c =>
                    [...available].some(a => a.toLowerCase() === c.toLowerCase())
                ).map(c => [...available].find(a => a.toLowerCase() === c.toLowerCase()));
                // Append any remaining fields not in COLUMN_ORDER
                const rest = [...available].filter(a => !COLUMN_ORDER.some(c => c.toLowerCase() === a.toLowerCase()));
                const cols = [...ordered, ...rest];
                setColumns(cols);
                setFilters(prev => {
                    const init = {};
                    cols.forEach((c) => { init[c] = prev[c] || ''; });
                    return init;
                });
            }
        } catch (err) {
            setError(err.message || 'Failed to load admins.');
        } finally {
            setLoading(false);
        }
    }, [acctId]);

    const syncAdmins = useCallback(async () => {
        if (!acctId) return;
        setSyncing(true);
        setError('');
        try {
            // Single call — backend syncs from Botamation platform then returns the refreshed list
            const activeFilters = Object.keys(appliedFilters).reduce((acc, k) => {
                if (appliedFilters[k]) { acc[k] = appliedFilters[k]; }
                return acc;
            }, {});
            const params = { acctId, page: currentPage, limit: pageSize, ...activeFilters };
            if (sortField) { params.sortBy = sortField; params.sortOrder = sortOrder; }
            const response = await api.get('/api/ui/admins', { params });
            const data = response.data;
            const list = Array.isArray(data) ? data : (data.admins || data.data || []);
            const pagination = data.pagination || null;
            setAdmins(list);
            setTotalRecords(pagination?.total ?? list.length);
            setTotalPages(pagination?.pages ?? 1);
            setCurrentPage(pagination?.page ?? currentPage);
            if (list.length > 0) {
                const available = new Set(
                    Object.keys(list[0]).filter((k) =>
                        !EXCLUDE_KEYS.map(e => e.toLowerCase()).includes(k.toLowerCase()) && !isImageKey(k)
                    )
                );
                const ordered = COLUMN_ORDER.filter(c =>
                    [...available].some(a => a.toLowerCase() === c.toLowerCase())
                ).map(c => [...available].find(a => a.toLowerCase() === c.toLowerCase()));
                const rest = [...available].filter(a => !COLUMN_ORDER.some(c => c.toLowerCase() === a.toLowerCase()));
                const cols = [...ordered, ...rest];
                setColumns(cols);
                setFilters(prev => {
                    const init = {};
                    cols.forEach((c) => { init[c] = prev[c] || ''; });
                    return init;
                });
            }
        } catch (err) {
            setError(err.message || 'Failed to synchronize admins.');
        } finally {
            setSyncing(false);
        }
    }, [acctId, appliedFilters, sortField, sortOrder, currentPage, pageSize]);

    // Initial load
    useEffect(() => { loadAdminsFromDb(); }, [loadAdminsFromDb]);

    // Re-fetch when applied filters, sort, or page changes (skip initial — loadAdminsFromDb effect handles it)
    useEffect(() => {
        if (columns.length === 0) return;
        const activeFilters = Object.keys(appliedFilters).reduce((acc, k) => {
            if (appliedFilters[k]) { acc[k] = appliedFilters[k]; }
            return acc;
        }, {});
        loadAdminsFromDb(activeFilters, sortField, sortOrder, currentPage, pageSize);
    }, [appliedFilters, sortField, sortOrder, currentPage]); // eslint-disable-line react-hooks/exhaustive-deps

    // Debounced filter change — auto-applies server-side
    const handleFilterChange = (col, val) => {
        setFilters(prev => ({ ...prev, [col]: val }));
        if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
        filterTimerRef.current = setTimeout(() => {
            setCurrentPage(1);
            setAppliedFilters(prev => {
                const updated = { ...prev };
                if (val) updated[col] = val;
                else delete updated[col];
                return updated;
            });
        }, 600);
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

    const renderSortIcon = (col) => {
        if (sortField !== col) {
            return (
                <svg className="absolute -right-4 w-3 h-3 text-indigo-400 opacity-0 group-hover/sort:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
            );
        }
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
                                <div className="bg-indigo-50 border-l-4 border-indigo-500 text-indigo-900 px-3 py-2 m-3 rounded-lg">
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
                                        {columns.map((col) => (
                                            <th key={col} className={`px-3 py-2.5 relative align-bottom ${isNameKey(col) ? 'text-left' : 'text-center'}`}>
                                                <div
                                                    className={`flex items-center ${isNameKey(col) ? 'justify-start' : 'justify-center'} cursor-pointer group/sort mb-1.5 transition-colors`}
                                                    onClick={() => handleSort(col)}
                                                >
                                                    <div className="relative inline-flex items-center">
                                                        <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider group-hover/sort:text-indigo-600 transition-colors">
                                                            {formatFieldName(col)}
                                                        </span>
                                                        {renderSortIcon(col)}
                                                    </div>
                                                </div>
                                                <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${Object.values(filters).some(Boolean) ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] group-hover/header:grid-rows-[1fr] group-focus-within/header:grid-rows-[1fr]'}`}>
                                                    <div className="overflow-hidden">
                                                        <div className="pb-1 pt-0.5 px-0.5">
                                                            <div className="relative rounded-md bg-slate-200/80 focus-within:bg-gradient-to-r focus-within:from-indigo-500 focus-within:via-violet-400 focus-within:to-indigo-500 p-[1px] transition-all duration-300 shadow-sm focus-within:shadow-[0_0_10px_rgba(99,102,241,0.3)]">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Filter..."
                                                                    value={filters[col] || ''}
                                                                    onChange={(e) => handleFilterChange(col, e.target.value)}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className={`w-full px-2 py-1 text-[10px] bg-white/70 focus:bg-white text-slate-700 rounded-[5px] outline-none placeholder-slate-400 transition-all ${isNameKey(col) ? 'text-left' : 'text-center'}`}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                    <tr>
                                        <th colSpan="100" className="p-0 h-[3px] bg-gradient-to-r from-indigo-500 via-violet-400 to-indigo-500 border-none shadow-[0_0_15px_rgba(99,102,241,0.6)] relative z-20"></th>
                                    </tr>
                                </thead>
                        <tbody className={`bg-white divide-y divide-gray-100 transition-opacity duration-200 ${loading && admins.length > 0 ? 'opacity-50 pointer-events-none' : ''}`}>
                            {loading && admins.length === 0 ? (
                                <tr>
                                    <td colSpan={columns.length || 1} className="px-3 py-6 text-center">
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
                                    <td colSpan={columns.length || 1} className="px-3 py-6 text-center">
                                        <div className="flex flex-col items-center gap-2">
                                            <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                            <span className="text-gray-500 text-xs font-medium">No admins found</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                admins.map((admin, idx) => {
                                    const rowId = admin._id || admin.id || idx;
                                    return (
                                        <tr key={rowId} className="hover:bg-gray-50 transition-all duration-200">
                                            {columns.map((col) => {
                                                const rawVal = admin[col];
                                                const displayValue = rawVal != null && rawVal !== ''
                                                    ? (col === 'createdAt' || col === 'updatedAt'
                                                        ? new Date(rawVal).toLocaleDateString()
                                                        : String(rawVal))
                                                    : '-';
                                                const value = displayValue;
                                                if (isNameKey(col)) {
                                                    const imgUrl = IMAGE_KEYS.reduce((found, k) => {
                                                        if (found) return found;
                                                        const match = Object.keys(admin).find(ak => ak.toLowerCase() === k.toLowerCase());
                                                        return match ? admin[match] : null;
                                                    }, null);
                                                    return (
                                                        <td key={col} className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 font-medium text-left">
                                                            <div className="flex items-center justify-start gap-1.5">
                                                                {imgUrl ? (
                                                                    <img src={imgUrl} alt={value} className="w-5 h-5 rounded-full object-cover border border-gray-200 flex-shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
                                                                ) : (
                                                                    <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-[9px] select-none" style={{ backgroundColor: getAvatarColor(value) }}>
                                                                        {value && value !== '-' ? value.charAt(0).toUpperCase() : '?'}
                                                                    </span>
                                                                )}
                                                                <span>{value}</span>
                                                            </div>
                                                        </td>
                                                    );
                                                }
                                                return (
                                                    <td key={col} className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 font-medium text-center">
                                                        {value}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
                {/* Pagination Section */}
                <div className="flex-shrink-0 bg-gray-50 px-3 py-2 flex items-center justify-between border-t border-gray-200">
                    <div className="flex-1 flex justify-between sm:hidden">
                        <button
                            onClick={() => goToPage(currentPage - 1)}
                            disabled={currentPage === 1}
                            className="relative inline-flex items-center px-2 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => goToPage(currentPage + 1)}
                            disabled={currentPage === totalPages}
                            className="ml-2 relative inline-flex items-center px-2 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            Next
                        </button>
                    </div>
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                        <div>
                            <p className="text-xs text-gray-700 font-medium">
                                    Showing <span className="font-bold text-indigo-700">{totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1}</span> to{' '}
                                                <span className="font-bold text-indigo-700">{Math.min(currentPage * pageSize, totalRecords)}</span> of{' '}
                                                <span className="font-bold text-indigo-700">{totalRecords}</span> results
                            </p>
                        </div>
                        <div>
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
                                    if (
                                        page === 1 ||
                                        page === totalPages ||
                                        (page >= currentPage - 1 && page <= currentPage + 1)
                                    ) {
                                        return (
                                            <button
                                                key={page}
                                                onClick={() => goToPage(page)}
                                                className={`relative inline-flex items-center px-2 py-1 border text-xs font-medium transition-all ${currentPage === page
                                                    ? 'z-10 bg-gradient-to-b from-indigo-500 to-indigo-700 border-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                                                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'
                                                    }`}
                                            >
                                                {page}
                                            </button>
                                        );
                                    } else if (page === currentPage - 2 || page === currentPage + 2) {
                                        return (
                                            <span key={page} className="relative inline-flex items-center px-2 py-1 border border-gray-300 bg-white text-xs font-medium text-gray-700">
                                                ...
                                            </span>
                                        );
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
                </div>
            </div>
        </div>
    );
};

export default AdminTab;

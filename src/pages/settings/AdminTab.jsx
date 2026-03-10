import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api/axiosConfig';

const EXCLUDE_KEYS = ['__v', 'updatedAt', '_id', 'id', 'adminId', 'acctNo', 'acctno'];
const COLUMN_ORDER = ['firstName', 'lastName', 'phone', 'email', 'createdAt'];
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
    return key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());
};

const AdminTab = ({ acctNo }) => {
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
        if (!acctNo) return;
        setLoading(true);
        setError('');
        try {
            const params = { acctNo, page, limit, ...filterParams };
            if (sortBy) { params.sortBy = sortBy; params.sortOrder = order; }
            const response = await api.get('/api/accounts/admins/list', { params });
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
    }, [acctNo]);

    const syncAdmins = useCallback(async () => {
        if (!acctNo) return;
        setSyncing(true);
        setError('');
        try {
            await api.get('/api/accounts/admins', { params: { acctNo } });
            const activeFilters = Object.keys(appliedFilters).reduce((acc, k) => {
                if (appliedFilters[k]) { acc[k] = appliedFilters[k]; }
                return acc;
            }, {});
            await loadAdminsFromDb(activeFilters, sortField, sortOrder, currentPage, pageSize);
        } catch (err) {
            setError(err.message || 'Failed to synchronize admins.');
        } finally {
            setSyncing(false);
        }
    }, [acctNo, appliedFilters, sortField, sortOrder, currentPage, pageSize, loadAdminsFromDb]);

    // Initial load
    useEffect(() => { loadAdminsFromDb(); }, [loadAdminsFromDb]);

    // Re-fetch when applied filters, sort, or page changes
    useEffect(() => {
        if (columns.length === 0) return; // skip before columns are known
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
                <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
            );
        }
        return sortOrder === 'asc' ? (
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
        ) : (
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
        );
    };

    return (
        <div className="h-full flex flex-col">
            <div className="mb-3 flex-shrink-0 flex justify-start gap-2">
                <button
                    onClick={syncAdmins}
                    disabled={syncing || loading}
                    className="group relative w-8 h-8 flex items-center justify-center bg-transparent rounded-lg hover:bg-gray-100 transition-all duration-300 hover:scale-110 border border-gray-300 hover:border-gray-400 focus:ring-1 focus:ring-gray-400 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={syncing ? 'Syncing...' : 'Sync admins'}
                >
                    <svg
                        className={`w-4 h-4 text-gray-700 group-hover:text-gray-900 transition-colors ${syncing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                </button>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-white rounded-lg shadow-2xl border border-gray-200">
                {error && (
                    <div className="bg-gray-100 border-l-4 border-black text-gray-900 px-3 py-2 m-3 rounded-lg">
                        <div className="flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-xs font-medium">Error: {error}</span>
                        </div>
                    </div>
                )}
                <div className="flex-1 overflow-auto min-h-0">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-black">
                            <tr>
                                {columns.map((col) => (
                                    <th key={col} className="px-3 py-2 text-center">
                                        <div
                                            className="flex items-center justify-center gap-1 cursor-pointer hover:text-gray-300 mb-1.5 transition-colors"
                                            onClick={() => handleSort(col)}
                                        >
                                            <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                                                {formatFieldName(col)}
                                            </span>
                                            {renderSortIcon(col)}
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Filter..."
                                            value={filters[col] || ''}
                                            onChange={(e) => handleFilterChange(col, e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                            className="w-full px-2 py-1 text-[10px] border border-gray-700 bg-gray-900 text-white rounded focus:ring-1 focus:ring-gray-500 focus:border-transparent placeholder-gray-500 transition-all text-center"
                                        />
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={columns.length || 1} className="px-3 py-6 text-center">
                                        <div className="flex flex-col justify-center items-center gap-2">
                                            <div className="relative">
                                                <div className="animate-spin rounded-full h-8 w-8 border-4 border-gray-300"></div>
                                                <div className="animate-spin rounded-full h-8 w-8 border-4 border-black border-t-transparent absolute top-0"></div>
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
                                                    ? (col === 'createdAt'
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
                                                        <td key={col} className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 font-medium text-center">
                                                            <div className="flex items-center justify-center gap-1.5">
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
                                Showing <span className="font-bold text-black">{totalRecords === 0 ? 0 : (currentPage - 1) * pageSize + 1}</span> to{' '}
                                <span className="font-bold text-black">{Math.min(currentPage * pageSize, totalRecords)}</span> of{' '}
                                <span className="font-bold text-black">{totalRecords}</span> results
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
                                                    ? 'z-10 bg-black border-black text-white shadow-lg'
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

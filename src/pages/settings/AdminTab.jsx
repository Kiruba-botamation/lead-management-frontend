import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/axiosConfig';

const EXCLUDE_KEYS = ['__v', 'updatedAt', '_id', 'id', 'adminId'];
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

const formatFieldName = (key) =>
    key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim()
        .replace(/\b\w/g, (c) => c.toUpperCase());

const AdminTab = ({ acctNo }) => {
    const [admins, setAdmins] = useState([]);
    const [columns, setColumns] = useState([]);
    const [filters, setFilters] = useState({});
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [error, setError] = useState('');
    const [sortField, setSortField] = useState('');
    const [sortOrder, setSortOrder] = useState('asc');

    const fetchAdmins = useCallback(async (isSync = false) => {
        if (!acctNo) return;
        if (isSync) setSyncing(true); else setLoading(true);
        setError('');
        try {
            const response = await api.get('/api/accounts/admins', { params: { acctNo } });
            const data = response.data;
            const list = Array.isArray(data) ? data : (data.admins || data.data || []);
            setAdmins(list);
            if (list.length > 0) {
                const cols = Object.keys(list[0]).filter((k) => !EXCLUDE_KEYS.includes(k) && !isImageKey(k));
                setColumns(cols);
                const init = {};
                cols.forEach((c) => { init[c] = ''; });
                setFilters(init);
            }
        } catch (err) {
            setError(err.message || 'Failed to fetch admins.');
        } finally {
            setLoading(false);
            setSyncing(false);
        }
    }, [acctNo]);

    useEffect(() => { fetchAdmins(); }, [fetchAdmins]);

    const handleFilterChange = (col, val) =>
        setFilters((prev) => ({ ...prev, [col]: val }));

    const clearFilters = () => {
        const cleared = {};
        columns.forEach((c) => { cleared[c] = ''; });
        setFilters(cleared);
    };

    const handleSort = (col) => {
        if (sortField === col) {
            setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(col);
            setSortOrder('asc');
        }
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

    const filtered = admins
        .filter((admin) =>
            columns.every((col) => {
                const f = filters[col] || '';
                if (!f) return true;
                return String(admin[col] ?? '').toLowerCase().includes(f.toLowerCase());
            })
        )
        .sort((a, b) => {
            if (!sortField) return 0;
            const av = String(a[sortField] ?? '').toLowerCase();
            const bv = String(b[sortField] ?? '').toLowerCase();
            return sortOrder === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        });

    return (
        <div>
            <div className="mb-3 flex justify-start gap-2">
                <button
                    onClick={clearFilters}
                    className="group relative w-8 h-8 bg-transparent rounded-lg hover:bg-gray-100 transition-all duration-300 flex items-center justify-center border border-gray-300 hover:border-gray-400 hover:scale-110 focus:ring-1 focus:ring-gray-400"
                    title="Clear Filters"
                >
                    <svg className="w-4 h-4 text-gray-700 group-hover:text-gray-900 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        <line x1="18" y1="6" x2="6" y2="18" strokeWidth={2} strokeLinecap="round" />
                    </svg>
                </button>
                <button
                    onClick={() => fetchAdmins(true)}
                    disabled={syncing}
                    className="group relative w-8 h-8 bg-transparent rounded-lg hover:bg-gray-100 transition-all duration-300 flex items-center justify-center border border-gray-300 hover:border-gray-400 hover:scale-110 focus:ring-1 focus:ring-gray-400 disabled:opacity-50"
                    title="Synchronize"
                >
                    <svg className={`w-4 h-4 text-gray-700 group-hover:text-gray-900 transition-colors ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                </button>
            </div>

            <div className="bg-white rounded-lg shadow-2xl overflow-hidden border border-gray-200">
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
                <div className="overflow-x-auto">
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
                            ) : filtered.length === 0 ? (
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
                                filtered.map((admin, idx) => {
                                    const rowId = admin._id || admin.id || idx;
                                    return (
                                        <tr key={rowId} className="hover:bg-gray-50 transition-all duration-200">
                                            {columns.map((col) => {
                                                const value = admin[col] != null && admin[col] !== '' ? String(admin[col]) : '-';
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
                {!loading && filtered.length > 0 && (
                    <div className="bg-gray-50 px-3 py-2 border-t border-gray-200">
                        <p className="text-xs text-gray-700 font-medium">
                            Showing <span className="font-bold text-black">{filtered.length}</span> of{' '}
                            <span className="font-bold text-black">{admins.length}</span> results
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminTab;

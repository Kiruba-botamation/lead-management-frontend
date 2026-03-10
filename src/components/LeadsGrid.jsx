import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import api from '../api/axiosConfig';
import { useAuth } from '../context/AuthContext';
import { useAccount } from '../context/AccountContext';
import AccountCombobox from './AccountCombobox';
import { useNotifications } from './Notifications';
import DeleteConfirmation from './DeleteConfirmation';

const LeadsGrid = () => {
    const navigate = useNavigate();
    const { user, userDetails, logout } = useAuth();
    const {
        acctNo,
        acctName,
        accounts,
        isAccountLinked,
        accountsLoaded,
        accountsLoading,
        setIsLinkDialogOpen,
        switchAccount,
    } = useAccount();
    const { showSuccess, showError, NotificationComponent } = useNotifications();
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [fields, setFields] = useState([]);
    const [adminsMap, setAdminsMap] = useState({});
    const [showUserMenu, setShowUserMenu] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Delete confirmation state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [leadToDelete, setLeadToDelete] = useState(null);

    const userMenuRef = useRef(null);
    const filterTimerRef = useRef(null);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
                setShowUserMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);;

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [totalPages, setTotalPages] = useState(0);
    const [totalRecords, setTotalRecords] = useState(0);

    // Sorting state
    const [sortField, setSortField] = useState('');
    const [sortOrder, setSortOrder] = useState('asc');

    // Filter state
    const [filters, setFilters] = useState({});
    const [appliedFilters, setAppliedFilters] = useState({});

    // Fetch leads from API
    const fetchLeads = async () => {
        // Wait until account state is resolved before fetching
        if (!isAccountLinked || !acctNo) return;

        setLoading(true);
        setError(null);

        try {
            const params = {
                page: currentPage,
                limit: pageSize,
                ...(sortField && { sortBy: sortField, sortOrder }),
                ...(acctNo && { acctNo }),
                ...appliedFilters
            };

            const response = await api.get('/api/leads', { params });

            setLeads(response.data.data || []);
            setTotalRecords(response.data.pagination?.total || 0);
            setTotalPages(response.data.pagination?.pages || 1);
            setCurrentPage(response.data.pagination?.page || 1);

            // Extract field names from the first lead object
            if ((response.data.data || []).length > 0) {
                const firstLead = response.data.data[0];
                const excludeFields = ['__v', 'updatedAt', '_id'];
                const rawFields = Object.keys(firstLead).filter(field => !excludeFields.includes(field));
                const displayFields = rawFields.includes('adminId')
                    ? ['adminId', ...rawFields.filter(f => f !== 'adminId')]
                    : rawFields;
                setFields(displayFields);

                if (Object.keys(filters).length === 0) {
                    const initialFilters = {};
                    displayFields.forEach(field => {
                        initialFilters[field] = '';
                    });
                    setFilters(initialFilters);
                }
            }
        } catch (err) {
            setError(err.message || 'Failed to fetch leads');
            console.error('Error fetching leads:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLeads();
    }, [currentPage, pageSize, sortField, sortOrder, appliedFilters, acctNo, isAccountLinked]);

    // Fetch admins and build a lookup map keyed by adminId
    useEffect(() => {
        if (!acctNo) return;
        api.get('/api/accounts/admins', { params: { acctNo } })
            .then((res) => {
                const list = Array.isArray(res.data) ? res.data : (res.data.admins || res.data.data || []);
                const map = {};
                list.forEach((admin) => {
                    const id = admin.adminId || admin._id || admin.id;
                    if (id) map[String(id)] = admin;
                });
                setAdminsMap(map);
            })
            .catch(() => { });
    }, [acctNo]);

    // Handle sorting
    const handleSort = (field) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
        setCurrentPage(1);
    };

    // Handle filter input change — auto-debounce server-side apply
    const handleFilterChange = (field, value) => {
        setFilters(prev => ({ ...prev, [field]: value }));
        if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
        filterTimerRef.current = setTimeout(() => {
            setAppliedFilters(prev => {
                const updated = { ...prev };
                if (value) updated[field] = value;
                else delete updated[field];
                return updated;
            });
            setCurrentPage(1);
        }, 600);
    };

    // Handle delete lead button click
    const handleDeleteClick = (lead) => {
        setLeadToDelete(lead);
        setDeleteDialogOpen(true);
    };

    // Handle delete confirmation
    const handleDeleteConfirm = async () => {
        setDeleteDialogOpen(false);
        // TODO: wire up delete API call, e.g.:
        // try {
        //     await api.delete(`/api/leads/${leadToDelete._id}`);
        //     showSuccess('Lead deleted successfully.');
        //     fetchLeads();
        // } catch (err) {
        //     showError(err.message || 'Failed to delete lead.');
        // }
        setLeadToDelete(null);
    };

    // Export to Excel with current filters
    const handleExportExcel = async () => {
        setIsExporting(true);
        try {
            const params = {
                limit: 100000, // fetch all matching records
                ...(sortField && { sortBy: sortField, sortOrder }),
                ...(acctNo && { acctNo }),
                ...appliedFilters
            };

            const response = await api.get('/api/leads', { params });
            const allLeads = response.data.data || [];

            if (allLeads.length === 0) {
                showError('No data to export with the current filters.');
                return;
            }

            // Build rows: exclude internal fields, resolve adminId -> name
            const excludeFields = ['__v', 'updatedAt', '_id'];
            const exportFields = fields.length > 0
                ? fields
                : Object.keys(allLeads[0]).filter(f => !excludeFields.includes(f));

            const rows = allLeads.map(lead => {
                const row = {};
                exportFields.forEach(field => {
                    if (field === 'adminId') {
                        const admin = adminsMap[String(lead.adminId)];
                        const adminName = admin
                            ? (admin.firstName
                                ? `${admin.firstName}${admin.lastName ? ' ' + admin.lastName : ''}`
                                : admin.name || admin.fullName || admin.username || admin.adminName || lead.adminId)
                            : (lead.adminId || '-');
                        row['Admin Name'] = adminName;
                    } else if (field === 'createdAt' || field.includes('Date') || field.includes('date')) {
                        row[formatFieldName(field)] = lead[field] ? new Date(lead[field]).toLocaleDateString() : '-';
                    } else {
                        row[formatFieldName(field)] = lead[field] ?? '-';
                    }
                });
                return row;
            });

            const worksheet = XLSX.utils.json_to_sheet(rows);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');

            // Auto-size columns
            const colWidths = Object.keys(rows[0] || {}).map(key => ({
                wch: Math.max(key.length, ...rows.map(r => String(r[key] ?? '').length)) + 2
            }));
            worksheet['!cols'] = colWidths;

            const filterSuffix = Object.keys(appliedFilters).length > 0 ? '_filtered' : '';
            const fileName = `leads${filterSuffix}_${new Date().toISOString().slice(0, 10)}.xlsx`;
            XLSX.writeFile(workbook, fileName);
            showSuccess(`Exported ${allLeads.length} lead${allLeads.length !== 1 ? 's' : ''} to ${fileName}`);
        } catch (err) {
            showError(err.message || 'Failed to export leads.');
            console.error('Export error:', err);
        } finally {
            setIsExporting(false);
        }
    };

    // Pagination handlers
    const goToPage = (page) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        }
    };

    const renderSortIcon = (field) => {
        if (sortField !== field) {
            return (
                <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

    // Helper to format field names for display
    const formatFieldName = (field) => {
        if (field === 'adminId') return 'Admin Name';
        return field
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    };

    // Helper to format field values
    const formatFieldValue = (field, value) => {
        if (!value) return '-';

        if (field === 'createdAt' || field.includes('Date') || field.includes('date')) {
            return new Date(value).toLocaleDateString();
        }

        return value;
    };

    return (
        <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
            <NotificationComponent />
            <DeleteConfirmation
                isOpen={deleteDialogOpen}
                onClose={() => { setDeleteDialogOpen(false); setLeadToDelete(null); }}
                onConfirm={handleDeleteConfirm}
                title="Delete Lead"
                message="Are you sure you want to delete this lead? This action cannot be undone."
            />
            {/* Navigation Menu */}
            <nav className="bg-black border-b border-gray-800 animate-fade-in shadow-lg flex-shrink-0">
                <div className="container mx-auto px-4">
                    <div className="flex items-center gap-4">
                        {/* Logo */}
                        <div className="py-2">
                            <img src="/botamation_logo.jpg" alt="Botamation Logo" className="w-10 h-10 object-contain rounded-lg shadow-lg" />
                        </div>

                        {/* Menu Items */}
                        <div className="flex items-center gap-1">
                            <button
                                className="px-3 py-2 text-xs font-semibold transition-all duration-300 rounded-t-lg relative bg-gray-900 text-white shadow-lg"
                            >
                                <div className="flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                    Leads
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-t-full"></div>
                            </button>
                            <button
                                onClick={() => navigate('/admin')}
                                className="px-3 py-2 text-xs font-semibold transition-all duration-300 rounded-t-lg relative text-gray-400 hover:bg-gray-900 hover:text-white"
                            >
                                <div className="flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Admin
                                </div>
                            </button>
                            <button
                                onClick={() => navigate('/settings')}
                                className="px-3 py-2 text-xs font-semibold transition-all duration-300 rounded-t-lg relative text-gray-400 hover:bg-gray-900 hover:text-white"
                            >
                                <div className="flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    Settings
                                </div>
                            </button>
                        </div>

                        {/* Right side: Account + User */}
                        <div className="ml-auto py-2 flex items-center gap-2">

                            {/* Account dropdown */}
                            <AccountCombobox
                                accounts={accounts}
                                acctNo={acctNo}
                                acctName={acctName}
                                isAccountLinked={isAccountLinked}
                                accountsLoaded={accountsLoaded}
                                switchAccount={switchAccount}
                                setIsLinkDialogOpen={setIsLinkDialogOpen}
                                onOpen={() => setShowUserMenu(false)}
                            />

                            {/* User Profile */}
                            <div className="relative" ref={userMenuRef}>
                                <button
                                    onClick={() => { setShowUserMenu(v => !v); }}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 transition-all duration-300 border border-gray-700"
                                >
                                    {(() => {
                                        const imgUrl = userDetails?.profileImageUrl || '';
                                        const src = imgUrl.startsWith('/') ? `http://localhost:8080${imgUrl}` : imgUrl;
                                        return src
                                            ? <img src={src} alt="avatar" className="w-6 h-6 rounded-full object-cover border border-gray-600 flex-shrink-0" />
                                            : <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-white text-xs font-bold shadow-lg border border-gray-600">
                                                {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                                            </div>;
                                    })()}
                                    <span className="text-xs font-medium text-white hidden md:block">{user?.email || user?.name || 'User'}</span>
                                    <svg className={`w-3 h-3 text-gray-400 transition-transform duration-300 ${showUserMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {/* Dropdown Menu */}
                                {showUserMenu && (
                                    <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-2xl border border-gray-200 py-1 z-50 animate-scale-in">
                                        <div className="px-3 py-2 border-b border-gray-100">
                                            <p className="text-xs font-semibold text-gray-900">{user?.name || 'User'}</p>
                                            <p className="text-[10px] text-gray-500 truncate mt-0.5">{user?.email || ''}</p>
                                        </div>
                                        <button
                                            onClick={() => { setShowUserMenu(false); navigate('/profile'); }}
                                            className="w-full px-3 py-2 text-left text-xs font-medium text-gray-900 hover:bg-gray-100 transition-colors flex items-center gap-1.5"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                            My Profile
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowUserMenu(false);
                                                logout();
                                            }}
                                            className="w-full px-3 py-2 text-left text-xs font-medium text-gray-900 hover:bg-gray-100 transition-colors flex items-center gap-1.5"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                            </svg>
                                            Logout
                                        </button>
                                    </div>
                                )}
                            </div>
                            {/* end User Profile */}

                        </div>
                        {/* end Right side */}
                    </div>
                </div>
            </nav>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden flex flex-col px-3 sm:px-4 py-3">
                {/* No Account Linked — full-page prompt */}
                {accountsLoaded && !accountsLoading && !isAccountLinked && (
                    <div className="flex-1 flex flex-col items-center justify-center animate-fade-in">
                        <div className="bg-white border border-gray-200 rounded-xl shadow-xl px-8 py-10 text-center max-w-sm">
                            <div className="w-14 h-14 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-7 h-7 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                </svg>
                            </div>
                            <h2 className="text-lg font-bold text-gray-900 mb-2">No Account Linked</h2>
                            <p className="text-xs text-gray-500 mb-5">
                                You need to link a business account to view and manage leads.
                            </p>
                            <button
                                onClick={() => setIsLinkDialogOpen(true)}
                                className="px-5 py-2.5 bg-black text-white text-xs font-semibold rounded-lg hover:bg-gray-800 transition-colors"
                            >
                                Link Account
                            </button>
                        </div>
                    </div>
                )}

                {isAccountLinked && (
                    <div className="flex-1 flex flex-col min-h-0 animate-fade-in">
                        <div className="mb-3 flex-shrink-0 flex justify-start gap-2">
                            {/* Clear Filters button */}
                            <button
                                onClick={() => {
                                    const cleared = {};
                                    fields.forEach(f => { cleared[f] = ''; });
                                    setFilters(cleared);
                                    setAppliedFilters({});
                                    setCurrentPage(1);
                                }}
                                disabled={loading || Object.keys(appliedFilters).length === 0}
                                className="group relative w-8 h-8 flex items-center justify-center bg-transparent rounded-lg hover:bg-red-50 transition-all duration-300 hover:scale-110 border border-gray-300 hover:border-red-400 focus:ring-1 focus:ring-red-300 disabled:opacity-40 disabled:cursor-not-allowed"
                                title={Object.keys(appliedFilters).length > 0 ? `Clear ${Object.keys(appliedFilters).length} active filter${Object.keys(appliedFilters).length !== 1 ? 's' : ''}` : 'No active filters'}
                            >
                                <svg className="w-4 h-4 text-gray-600 group-hover:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 6l12 12" />
                                </svg>
                            </button>

                            {/* Export to Excel — icon-only */}
                            <button
                                onClick={handleExportExcel}
                                disabled={isExporting || loading}
                                className="group relative w-8 h-8 flex items-center justify-center bg-transparent rounded-lg hover:bg-emerald-50 transition-all duration-300 hover:scale-110 border border-gray-300 hover:border-emerald-500 focus:ring-1 focus:ring-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed"
                                title={isExporting ? 'Exporting...' : (Object.keys(appliedFilters).length > 0 ? `Export filtered leads (${totalRecords}) to Excel` : 'Export all leads to Excel')}
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

                            <button
                                onClick={() => navigate('/analytics')}
                                className="group relative w-8 h-8 bg-transparent rounded-lg hover:bg-gray-100 transition-all duration-300 flex items-center justify-center hover:scale-110 border border-gray-300 hover:border-gray-400 focus:ring-1 focus:ring-gray-400"
                                title="Analytics"
                            >
                                <svg className="w-4 h-4 text-gray-700 group-hover:text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                            </button>
                        </div>

                        {/* Table Section */}
                        <div className="flex-1 overflow-hidden flex flex-col min-h-0 bg-white rounded-lg shadow-2xl border border-gray-200 animate-scale-in">
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
                                            {fields.map((field) => (
                                                <th key={field} className="px-3 py-2 text-center">
                                                    <div
                                                        className="flex items-center justify-center gap-1 cursor-pointer hover:text-gray-300 mb-1.5 transition-colors group"
                                                        onClick={() => handleSort(field)}
                                                    >
                                                        <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                                                            {formatFieldName(field)}
                                                        </span>
                                                        {renderSortIcon(field)}
                                                    </div>
                                                    <input
                                                        type="text"
                                                        placeholder="Filter..."
                                                        value={filters[field] || ''}
                                                        onChange={(e) => handleFilterChange(field, e.target.value)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="w-full px-2 py-1 text-[10px] border border-gray-700 bg-gray-900 text-white rounded focus:ring-1 focus:ring-gray-500 focus:border-transparent placeholder-gray-500 transition-all text-center"
                                                    />
                                                </th>
                                            ))}
                                            <th className="px-3 py-2 text-center text-[10px] font-bold text-white uppercase tracking-wider">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-100">
                                        {loading ? (
                                            <tr>
                                                <td colSpan={fields.length + 1} className="px-3 py-6 text-center">
                                                    <div className="flex flex-col justify-center items-center gap-2">
                                                        <div className="relative">
                                                            <div className="animate-spin rounded-full h-8 w-8 border-4 border-gray-300"></div>
                                                            <div className="animate-spin rounded-full h-8 w-8 border-4 border-black border-t-transparent absolute top-0"></div>
                                                        </div>
                                                        <span className="text-gray-600 text-xs font-medium">Loading leads...</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : leads.length === 0 ? (
                                            <tr>
                                                <td colSpan={fields.length + 1} className="px-3 py-6 text-center">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                                        </svg>
                                                        <span className="text-gray-500 text-xs font-medium">No leads found</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            leads.map((lead, index) => (
                                                <tr key={lead._id} className="hover:bg-gray-50 transition-all duration-200" style={{ animationDelay: `${index * 50}ms` }}>
                                                    {fields.map((field) => {
                                                        if (field === 'adminId') {
                                                            if (!lead.adminId) {
                                                                return (
                                                                    <td key={field} className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 font-medium text-center">-</td>
                                                                );
                                                            }
                                                            const admin = adminsMap[String(lead.adminId)];
                                                            const imgUrl = admin && (admin.profileImage || admin.profileImageUrl || admin.avatar || admin.photo);
                                                            const adminName = admin
                                                                ? (admin.firstName
                                                                    ? `${admin.firstName}${admin.lastName ? ' ' + admin.lastName : ''}`
                                                                    : admin.name || admin.fullName || admin.username || admin.adminName || '-')
                                                                : '-';
                                                            const initial = adminName !== '-' ? adminName.charAt(0).toUpperCase() : null;
                                                            const COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0284c7'];
                                                            const avatarColor = initial ? COLORS[(initial.charCodeAt(0) || 0) % COLORS.length] : null;
                                                            return (
                                                                <td key={field} className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 font-medium text-center">
                                                                    {adminName === '-' ? (
                                                                        <span>-</span>
                                                                    ) : (
                                                                        <div className="flex items-center justify-center gap-1.5">
                                                                            {imgUrl ? (
                                                                                <img
                                                                                    src={imgUrl}
                                                                                    alt="admin"
                                                                                    className="w-5 h-5 rounded-full object-cover border border-gray-200 flex-shrink-0"
                                                                                    onError={(e) => { e.target.style.display = 'none'; }}
                                                                                />
                                                                            ) : (
                                                                                <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-[9px] select-none" style={{ backgroundColor: avatarColor }}>
                                                                                    {initial}
                                                                                </span>
                                                                            )}
                                                                            <span>{adminName}</span>
                                                                        </div>
                                                                    )}
                                                                </td>
                                                            );
                                                        }
                                                        return (
                                                            <td key={field} className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-900 font-medium text-center">
                                                                {formatFieldValue(field, lead[field])}
                                                            </td>
                                                        );
                                                    })}
                                                    <td className="px-3 py-2 whitespace-nowrap text-xs text-center">
                                                        <div className="flex gap-1.5 justify-center">
                                                            <button
                                                                className="p-1 text-gray-700 hover:bg-gray-100 rounded transition-all duration-200 hover:scale-110 border border-gray-200"
                                                                title="Edit"
                                                            >
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                className="p-1 text-gray-900 hover:bg-gray-100 rounded transition-all duration-200 hover:scale-110 border border-gray-200"
                                                                title="Delete"
                                                                onClick={() => handleDeleteClick(lead)}
                                                            >
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))
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
                                            Showing <span className="font-bold text-black">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                                            <span className="font-bold text-black">
                                                {Math.min(currentPage * pageSize, totalRecords)}
                                            </span> of{' '}
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
                )}
            </div>
        </div>
    );
};

export default LeadsGrid;

import React, { useState, useEffect } from 'react';
import api from '../api/axiosConfig';
import AnalyticsDialog from './AnalyticsDialog';
import { useAuth } from '../context/AuthContext';

const LeadsGrid = () => {
    const { user, logout } = useAuth();
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
    const [fields, setFields] = useState([]);
    const [activeMenu, setActiveMenu] = useState('leads');
    const [showUserMenu, setShowUserMenu] = useState(false);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(50);
    const [totalPages, setTotalPages] = useState(0);
    const [totalRecords, setTotalRecords] = useState(0);

    // Sorting state
    const [sortField, setSortField] = useState('');
    const [sortOrder, setSortOrder] = useState('asc'); // 'asc' or 'desc'

    // Filter state - will be dynamically populated
    const [filters, setFilters] = useState({});
    const [appliedFilters, setAppliedFilters] = useState({});

    // Fetch leads from API
    const fetchLeads = async () => {
        setLoading(true);
        setError(null);

        try {
            const params = {
                page: currentPage,
                limit: pageSize,
                ...(sortField && { sortBy: sortField, sortOrder }),
                ...appliedFilters
            };

            const response = await api.get('/api/leads', { params });

            // Parse the API response structure
            setLeads(response.data.data || []);
            setTotalRecords(response.data.pagination?.totalRecords || 0);
            setTotalPages(response.data.pagination?.totalPages || 1);
            setCurrentPage(response.data.pagination?.currentPage || 1);

            // Set fields from API response
            if (response.data.fields && response.data.fields.length > 0) {
                // Filter out fields we don't want to display
                const excludeFields = ['__v', 'updatedAt'];
                const displayFields = response.data.fields.filter(field => !excludeFields.includes(field));
                setFields(displayFields);

                // Initialize filters for all fields if not already initialized
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
    }, [currentPage, pageSize, sortField, sortOrder, appliedFilters]);

    // Handle sorting
    const handleSort = (field) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('asc');
        }
        setCurrentPage(1); // Reset to first page on sort
    };

    // Handle filter input change
    const handleFilterChange = (field, value) => {
        setFilters({ ...filters, [field]: value });
    };

    // Apply filters when Enter is pressed
    const applyFilters = () => {
        const activeFilters = Object.keys(filters).reduce((acc, key) => {
            if (filters[key]) {
                acc[key] = filters[key];
            }
            return acc;
        }, {});
        setAppliedFilters(activeFilters);
        setCurrentPage(1); // Reset to first page on filter
    };

    // Handle Enter key press in filter inputs
    const handleFilterKeyDown = (e) => {
        if (e.key === 'Enter') {
            applyFilters();
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
            return <span className="text-gray-400">⇅</span>;
        }
        return sortOrder === 'asc' ? <span>↑</span> : <span>↓</span>;
    };

    // Helper to format field names for display
    const formatFieldName = (field) => {
        // Convert camelCase to Title Case
        return field
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    };

    // Helper to format field values
    const formatFieldValue = (field, value) => {
        if (!value) return '-';

        // Format dates
        if (field === 'createdAt' || field.includes('Date') || field.includes('date')) {
            return new Date(value).toLocaleDateString();
        }

        return value;
    };

    // Calculate analytics data
    const getAnalyticsData = () => {
        const nameCount = {};
        const emailDomainCount = {};

        leads.forEach(lead => {
            // Name distribution (full name)
            const fullName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'unknown';
            nameCount[fullName] = (nameCount[fullName] || 0) + 1;

            // Email domain distribution
            if (lead.email) {
                const domain = lead.email.split('@')[1] || 'unknown';
                emailDomainCount[domain] = (emailDomainCount[domain] || 0) + 1;
            } else {
                emailDomainCount['unknown'] = (emailDomainCount['unknown'] || 0) + 1;
            }
        });

        return {
            nameData: Object.entries(nameCount)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => ({ name, count })),
            emailData: Object.entries(emailDomainCount)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => ({ name, count }))
        };
    };

    const analytics = getAnalyticsData();

    // Generate colors for pie chart
    const generateColors = (count) => {
        const colors = [
            '#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af',
            '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af',
            '#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f',
            '#10b981', '#059669', '#047857', '#065f46', '#064e3b'
        ];
        return Array.from({ length: count }, (_, i) => colors[i % colors.length]);
    };

    const calculatePieSlices = (data) => {
        const total = data.reduce((sum, item) => sum + item.count, 0);
        let currentAngle = 0;

        return data.map((item, index) => {
            const percentage = (item.count / total) * 100;
            const angle = (item.count / total) * 360;
            const slice = {
                ...item,
                percentage: percentage.toFixed(1),
                startAngle: currentAngle,
                endAngle: currentAngle + angle,
                color: generateColors(data.length)[index]
            };
            currentAngle += angle;
            return slice;
        });
    };

    return (
        <div className="min-h-screen bg-gray-100">
            {/* Navigation Menu */}
            <nav className="bg-white border-b border-gray-200">
                <div className="container mx-auto px-4">
                    <div className="flex items-center gap-8">
                        {/* Logo/Icon */}
                        <div className="py-3">
                            <img src="/botamation_logo.jpg" alt="Botamation Logo" className="w-16 h-16 object-contain" />
                        </div>

                        {/* Menu Items */}
                        <div className="flex items-center">
                            <button
                                onClick={() => setActiveMenu('leads')}
                                className={`px-6 py-4 text-sm font-medium transition-colors rounded-t-lg ${activeMenu === 'leads'
                                    ? 'bg-gray-200 text-gray-900'
                                    : 'bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                    Leads
                                </div>
                            </button>
                            <button
                                onClick={() => setActiveMenu('settings')}
                                className={`px-6 py-4 text-sm font-medium transition-colors rounded-t-lg ${activeMenu === 'settings'
                                    ? 'bg-gray-200 text-gray-900'
                                    : 'bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    Settings
                                </div>
                            </button>
                        </div>

                        {/* User Profile */}
                        <div className="ml-auto py-4 relative">
                            <button
                                onClick={() => setShowUserMenu(!showUserMenu)}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center text-white font-medium">
                                    {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
                                </div>
                                <span className="text-sm text-gray-700 hidden md:block">{user?.name || user?.email || 'User'}</span>
                                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>

                            {/* Dropdown Menu */}
                            {showUserMenu && (
                                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                                    <div className="px-4 py-2 border-b border-gray-100">
                                        <p className="text-sm font-medium text-gray-900">{user?.name || 'User'}</p>
                                        <p className="text-xs text-gray-500 truncate">{user?.email || ''}</p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setShowUserMenu(false);
                                            logout();
                                        }}
                                        className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                        </svg>
                                        Logout
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </nav>

            {/* Content Area */}
            <div className="container mx-auto px-4 py-8">
                {activeMenu === 'leads' ? (
                    <>


                        {/* Action Buttons */}
                        <div className="mb-4 flex justify-start gap-3">
                            {/* Clear Filter Button */}
                            <button
                                onClick={() => {
                                    const clearedFilters = {};
                                    fields.forEach(field => {
                                        clearedFilters[field] = '';
                                    });
                                    setFilters(clearedFilters);
                                    setAppliedFilters({});
                                }}
                                className="w-12 h-12 bg-white rounded-full shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center border border-gray-200 hover:border-gray-300"
                                title="Clear Filters"
                            >
                                <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                    <line x1="18" y1="6" x2="6" y2="18" strokeWidth={2} strokeLinecap="round" />
                                </svg>
                            </button>

                            {/* Analytics Button */}
                            <button
                                onClick={() => setIsAnalyticsOpen(true)}
                                className="w-12 h-12 bg-white rounded-full shadow-md hover:shadow-lg transition-all duration-200 flex items-center justify-center border border-gray-200 hover:border-gray-300"
                                title="Analytics"
                            >
                                <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                            </button>
                        </div>

                        {/* Analytics Dialog */}
                        <AnalyticsDialog
                            isOpen={isAnalyticsOpen}
                            onClose={() => setIsAnalyticsOpen(false)}
                        />


                        {/* Table Section */}
                        <div className="bg-white rounded-lg shadow-md overflow-hidden">
                            {error && (
                                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 m-4 rounded">
                                    Error: {error}
                                </div>
                            )}

                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200">
                                    <thead className="bg-gray-800">
                                        <tr>
                                            {fields.map((field) => (
                                                <th key={field} className="px-6 py-3 text-center text-xs font-medium text-white uppercase tracking-wider">
                                                    <div className="flex items-center gap-2 cursor-pointer hover:text-gray-300 mb-2" onClick={() => handleSort(field)}>
                                                        {formatFieldName(field)} {renderSortIcon(field)}
                                                    </div>
                                                    <input
                                                        type="text"
                                                        placeholder="Filter..."
                                                        value={filters[field] || ''}
                                                        onChange={(e) => handleFilterChange(field, e.target.value)}
                                                        onKeyDown={handleFilterKeyDown}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="px-2 py-1 text-sm border border-gray-600 bg-gray-800 text-white rounded w-full focus:ring-1 focus:ring-gray-500 focus:border-transparent placeholder-gray-400"
                                                    />
                                                </th>
                                            ))}
                                            <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                                                Actions
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {loading ? (
                                            <tr>
                                                <td colSpan={fields.length + 1} className="px-6 py-4 text-center">
                                                    <div className="flex justify-center items-center">
                                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                                        <span className="ml-3 text-gray-600">Loading...</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : leads.length === 0 ? (
                                            <tr>
                                                <td colSpan={fields.length + 1} className="px-6 py-4 text-center text-gray-500">
                                                    No leads found
                                                </td>
                                            </tr>
                                        ) : (
                                            leads.map((lead) => (
                                                <tr key={lead._id} className="hover:bg-gray-50">
                                                    {fields.map((field) => (
                                                        <td key={field} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {formatFieldValue(field, lead[field])}
                                                        </td>
                                                    ))}
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                        <div className="flex gap-3">
                                                            <button
                                                                className="text-blue-600 hover:text-blue-800 transition-colors"
                                                                title="Edit"
                                                            >
                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                className="text-red-600 hover:text-red-800 transition-colors"
                                                                title="Delete"
                                                            >
                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                                <div className="flex-1 flex justify-between sm:hidden">
                                    <button
                                        onClick={() => goToPage(currentPage - 1)}
                                        disabled={currentPage === 1}
                                        className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Previous
                                    </button>
                                    <button
                                        onClick={() => goToPage(currentPage + 1)}
                                        disabled={currentPage === totalPages}
                                        className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Next
                                    </button>
                                </div>
                                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-sm text-gray-700">
                                            Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to{' '}
                                            <span className="font-medium">
                                                {Math.min(currentPage * pageSize, totalRecords)}
                                            </span> of{' '}
                                            <span className="font-medium">{totalRecords}</span> results
                                        </p>
                                    </div>
                                    <div>
                                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                                            <button
                                                onClick={() => goToPage(currentPage - 1)}
                                                disabled={currentPage === 1}
                                                className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                Previous
                                            </button>
                                            {[...Array(totalPages)].map((_, index) => {
                                                const page = index + 1;
                                                // Show first page, last page, current page, and pages around current
                                                if (
                                                    page === 1 ||
                                                    page === totalPages ||
                                                    (page >= currentPage - 1 && page <= currentPage + 1)
                                                ) {
                                                    return (
                                                        <button
                                                            key={page}
                                                            onClick={() => goToPage(page)}
                                                            className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${currentPage === page
                                                                ? 'z-10 bg-gray-900 border-gray-900 text-white'
                                                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                                                                }`}
                                                        >
                                                            {page}
                                                        </button>
                                                    );
                                                } else if (page === currentPage - 2 || page === currentPage + 2) {
                                                    return (
                                                        <span key={page} className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                                            ...
                                                        </span>
                                                    );
                                                }
                                                return null;
                                            })}
                                            <button
                                                onClick={() => goToPage(currentPage + 1)}
                                                disabled={currentPage === totalPages}
                                                className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                Next
                                            </button>
                                        </nav>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </>
                ) : (
                    <div className="text-center py-20">
                        <h2 className="text-3xl font-bold text-gray-900 mb-4">Settings</h2>
                        <p className="text-gray-600">Settings page coming soon...</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LeadsGrid;

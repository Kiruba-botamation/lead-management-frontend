import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAccount } from '../context/AccountContext';
import ApiTab from './settings/ApiTab';
import CategoryTab from './settings/CategoryTab';
import DeleteAccountPage from './settings/DeleteAccountPage';
import AppNavbar from '../components/AppNavbar';

const TABS = [
    { id: 'category',      label: 'Category'       },
    { id: 'api',           label: 'API'             },
    { id: 'deleteAccount', label: 'Delete Account' },
];

const SettingsPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { acctId, acctNo } = useAccount();

    const [activeTab, setActiveTab] = useState('category');

    // Read ?acc= from URL for DeleteAccountPage
    const accountFromUrl = new URLSearchParams(location.search).get('acc') || acctNo || '';

    return (
        <div className="min-h-screen bg-gray-50">
            {/* ── Navbar ────────────────────────────────────────────────────── */}
            <AppNavbar activePage="settings" />

            {/* ── Page body ─────────────────────────────────────────────────── */}
            <div className="container mx-auto px-4 py-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    {/* Tab bar */}
                    <div className="border-b border-gray-200 px-6">
                        <nav className="flex gap-0 -mb-px">
                            {TABS.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`px-4 py-3 text-xs font-semibold border-b-2 transition-colors ${activeTab === tab.id
                                        ? 'border-indigo-600 text-indigo-700'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </nav>
                    </div>

                    {/* Tab content */}
                    <div className="p-6">
                        {activeTab === 'api' && (
                            <ApiTab acctId={acctId} />
                        )}
                        {activeTab === 'category' && (
                            <CategoryTab />
                        )}
                        {activeTab === 'deleteAccount' && (
                            <DeleteAccountPage
                                acctId={acctId}
                                accountFromUrl={accountFromUrl}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;

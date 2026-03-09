/**
 * API Key Management Tab
 * Fetch (masked/real), copy, and regenerate the account API key.
 */
import React, { useState, useEffect } from 'react';
import api from '../../api/axiosConfig';
import { useNotifications } from '../../components/Notifications';
import ConfirmationDialog from '../../components/ConfirmationDialog';

// Mask all characters except the last 4 (fixed-width mask so last 4 stay visible)
const maskToken = (t) => {
    if (!t || t.length <= 4) return t;
    return '•'.repeat(24) + t.slice(-4);
};

const ApiTab = ({ acctId: acctIdProp }) => {
    const resolvedAcctId = acctIdProp || localStorage.getItem('acctId') || '';
    const { showSuccess, showError, NotificationComponent } = useNotifications();

    const [token, setToken] = useState('');      // always stores real token
    const [loading, setLoading] = useState(false);
    const [showToken, setShowToken] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);

    // ── Fetch real token on mount ──────────────────────────────────────────────
    useEffect(() => {
        if (resolvedAcctId) fetchToken();
    }, [resolvedAcctId]); // eslint-disable-line react-hooks/exhaustive-deps

    const fetchToken = async () => {
        if (!resolvedAcctId) { showError('No account ID available.'); return; }
        setLoading(true);
        try {
            const response = await api.post('/api/accounts/token', {
                acctId: resolvedAcctId,
                masked: false,
            });
            setToken(response.data.apiKey || '');
        } catch (err) {
            showError(err.message || 'Error fetching token.');
        } finally {
            setLoading(false);
        }
    };

    const handleShowHide = () => setShowToken(v => !v);

    const handleCopy = async () => {
        try {
            if (!token) return;
            await navigator.clipboard.writeText(token);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        } catch (err) {
            showError('Failed to copy token.');
        }
    };

    const handleRegenerate = async () => {
        if (!resolvedAcctId) { showError('No account ID available.'); return; }
        setLoading(true);
        setShowConfirm(false);
        try {
            const response = await api.post('/api/accounts/token/regenerate', {
                acctId: resolvedAcctId,
            });
            if (response.status !== 200) throw new Error('Failed to regenerate token.');
            await fetchToken();
            showSuccess('API key regenerated successfully.');
        } catch (err) {
            showError(err.message || 'Error regenerating token.');
            setLoading(false);
        }
    };

    return (
        <div className="max-w-xl">
            <NotificationComponent />
            <h2 className="text-base font-bold text-gray-900 mb-1">API Key</h2>
            <p className="text-xs text-gray-500 mb-5">
                Use this key to authenticate requests to the Lead Management API.
                Keep it secret — do not share it publicly.
            </p>

            {/* Token input row */}
            <div className="flex items-center gap-2 mb-2">
                <div className="relative flex-1">
                    <input
                        type="text"
                        readOnly
                        value={loading ? 'Loading...' : (showToken ? token : maskToken(token))}
                        placeholder="No API key found"
                        className="w-full px-3 py-2 pr-8 text-sm font-mono border border-gray-300 rounded-lg bg-gray-50 text-gray-700 select-all focus:outline-none"
                    />
                </div>

                {/* Show / Hide */}
                <button
                    onClick={handleShowHide}
                    disabled={loading}
                    title={showToken ? 'Hide token' : 'Show token'}
                    className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors disabled:opacity-40"
                >
                    {showToken ? (
                        /* Eye-off */
                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                    ) : (
                        /* Eye */
                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                    )}
                </button>

                {/* Copy */}
                <button
                    onClick={handleCopy}
                    disabled={loading}
                    title="Copy token"
                    className={`p-2 rounded-lg border transition-colors disabled:opacity-40 ${copySuccess
                            ? 'border-green-400 bg-green-50'
                            : 'border-gray-300 bg-white hover:bg-gray-50'
                        }`}
                >
                    {copySuccess ? (
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    ) : (
                        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    )}
                </button>
            </div>

            {/* Inline error */}

            {/* Regenerate button */}
            <button
                onClick={() => setShowConfirm(true)}
                disabled={loading}
                className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-black hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Regenerate API Key
            </button>

            {/* Regenerate confirmation dialog */}
            <ConfirmationDialog
                isOpen={showConfirm}
                onConfirm={handleRegenerate}
                onCancel={() => setShowConfirm(false)}
                title="Regenerate API Key?"
                message="The current key will be permanently invalidated. Any integrations using the old key will stop working immediately."
                confirmText="Yes, Regenerate"
                cancelText="Cancel"
                variant="warning"
                isLoading={loading}
                loadingText="Regenerating..."
            />
        </div>
    );
};

export default ApiTab;

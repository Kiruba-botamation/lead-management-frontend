/**
 * API Key Management Tab
 * Fetch (masked/real), copy, and regenerate the account API key.
 * Masking is done server-side — only last 4 chars are visible when hidden.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../api/axiosConfig';
import { useNotifications } from '../../components/Notifications';
import ConfirmationDialog from '../../components/ConfirmationDialog';
import Tooltip from '../../components/Tooltip';
import Button from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

const ApiTab = ({ acctId: acctIdProp }) => {
    const resolvedAcctId = acctIdProp || localStorage.getItem('acctId') || '';
    const { showSuccess, showError } = useNotifications();

    const [token, setToken] = useState('');      // stores masked or real token depending on state
    const [loading, setLoading] = useState(false);
    const [showToken, setShowToken] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);
    const inputRef = useRef(null);

    // Keep a ref to the last-fetched real token so copy can be instant
    const cachedRealToken = useRef('');

    // Scroll input to end so the recognisable suffix is always visible
    useEffect(() => {
        if (inputRef.current && token) {
            inputRef.current.scrollLeft = inputRef.current.scrollWidth;
        }
    }, [token]);

    // Normalize masked token: server returns "****...****....cfb7"
    // Extract the real suffix after the dots and render a clean display value.
    const displayToken = (rawToken) => {
        if (!rawToken) return '';
        // Match trailing suffix after one or more dots at end of masked string
        const match = rawToken.match(/[.*]+\.{2,}([A-Za-z0-9]+)$/);
        if (match) {
            const suffix = match[1];
            return '•'.repeat(24) + suffix;
        }
        return rawToken;
    };

    // ── Fetch masked token on mount ────────────────────────────────────────────
    useEffect(() => {
        if (resolvedAcctId) fetchMaskedToken();
    }, [resolvedAcctId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fetch masked token from backend (last 4 visible, rest are *)
    const fetchMaskedToken = async () => {
        if (!resolvedAcctId) { showError('No account ID available.'); return; }
        setLoading(true);
        try {
            const response = await api.post('/api/ui/accounts/token', { masked: true }, { params: { acctId: resolvedAcctId } });
            setToken(response.data.apiKey || '');
            setShowToken(false);
        } catch (err) {
            showError(err.message || 'Error fetching token.');
        } finally {
            setLoading(false);
        }
    };

    // Fetch real token from backend (full key visible)
    const fetchRealToken = async () => {
        if (!resolvedAcctId) { showError('No account ID available.'); return; }
        setLoading(true);
        try {
            const response = await api.post('/api/ui/accounts/token', { masked: false }, { params: { acctId: resolvedAcctId } });
            const real = response.data.apiKey || '';
            setToken(real);
            setShowToken(true);
            cachedRealToken.current = real;
        } catch (err) {
            showError(err.message || 'Error fetching token.');
        } finally {
            setLoading(false);
        }
    };

    // Toggle show/hide by fetching the appropriate version from backend
    const handleShowHide = async () => {
        if (showToken) {
            await fetchMaskedToken();
        } else {
            await fetchRealToken();
        }
    };

    // ── Optimistic copy: use cached token if available, fetch in background ────
    const handleCopy = useCallback(async () => {
        if (!resolvedAcctId) { showError('No account ID available.'); return; }

        // Show success immediately for responsiveness
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);

        try {
            // If we already have the real token cached, copy instantly
            if (cachedRealToken.current) {
                await navigator.clipboard.writeText(cachedRealToken.current);
                // Also refresh in the background to keep cache fresh
                api.post('/api/ui/accounts/token', { masked: false }, { params: { acctId: resolvedAcctId } })
                    .then(r => { cachedRealToken.current = r.data.apiKey || cachedRealToken.current; })
                    .catch(() => { });
            } else {
                // No cache yet — fetch then copy
                const response = await api.post('/api/ui/accounts/token', { masked: false }, { params: { acctId: resolvedAcctId } });
                const realToken = response.data.apiKey || '';
                cachedRealToken.current = realToken;
                if (realToken) await navigator.clipboard.writeText(realToken);
            }
        } catch (err) {
            setCopySuccess(false);
            showError('Failed to copy token.');
        }
    }, [resolvedAcctId, showError]);

    const handleRegenerate = async () => {
        if (!resolvedAcctId) { showError('No account ID available.'); return; }
        setLoading(true);
        setShowConfirm(false);
        try {
            const response = await api.post('/api/ui/accounts/token/regenerate', null, { params: { acctId: resolvedAcctId } });
            if (response.status !== 200) throw new Error('Failed to regenerate token.');
            // After regeneration, show the real new key
            await fetchRealToken();
            showSuccess('API key regenerated successfully.');
        } catch (err) {
            showError(err.message || 'Error regenerating token.');
            setLoading(false);
        }
    };

    return (
        <div className="max-w-xl">
            <h2 className="text-base font-bold text-gray-900 mb-1">API Key</h2>
            <p className="text-xs text-gray-500 mb-5">
                Use this key to authenticate requests to the Lead Management API.
                Keep it secret — do not share it publicly.
            </p>

            {/* Token input row */}
            <div className="flex items-center gap-2 mb-2">
                <div className="relative flex-1">
                    <Input
                        ref={inputRef}
                        type="text"
                        readOnly
                        value={loading ? 'Loading...' : (showToken ? token : displayToken(token))}
                        placeholder="No API key found"
                        style={{ fontFamily: 'var(--font-mono)' }}
                    />
                </div>

                {/* Show / Hide */}
                <Tooltip content={showToken ? 'Hide token' : 'Show token'} placement="top">
                <Button
                    variant="secondary"
                    size="sm"
                    iconOnly
                    onClick={handleShowHide}
                    disabled={loading}
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
                </Button>
                </Tooltip>

                {/* Copy */}
                <div className="relative">
                <Tooltip content={copySuccess ? 'Copied!' : 'Copy token'} placement="top">
                <Button
                    variant="secondary"
                    size="sm"
                    iconOnly
                    onClick={handleCopy}
                    disabled={loading}
                >
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                </Button>
                </Tooltip>
                {copySuccess && (
                    <span className="absolute left-full top-1/2 -translate-y-1/2 ml-1.5 flex items-center gap-1 whitespace-nowrap pointer-events-none">
                        <svg className="w-3.5 h-3.5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-[10px] font-medium text-green-600">Copied</span>
                    </span>
                )}
                </div>
            </div>

            {/* Regenerate button */}
            <Button
                size="sm"
                onClick={() => setShowConfirm(true)}
                disabled={loading}
                style={{ marginTop: 'var(--space-4)' }}
            >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Regenerate API Key
            </Button>

            {/* API usage documentation lives under Collections → "Copy API Info",
                where it reflects each collection's exact field schema. */}

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

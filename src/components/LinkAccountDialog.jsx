/**
 * Link Account Dialog
 * User enters an Account Number, then clicks "Verify" to check it against the backend.
 * On success, links the account directly.
 */
import React, { useState, useEffect } from 'react';
import api from '../api/axiosConfig';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from './Notifications';
import { getAcctNoFromUrl } from '../utils/accountHelpers';
import Button from './ui/Button';

const LinkAccountDialog = ({ isOpen, onClose, onSave }) => {
    const { user, userDetails } = useAuth();
    const [acctNo, setAcctNo] = useState('');

    // Prefill the account number from the ?acc= URL param when the dialog opens
    // (e.g. a shared link to an account that isn't linked yet).
    useEffect(() => {
        if (!isOpen) return;
        const urlAcctNo = getAcctNoFromUrl();
        if (urlAcctNo) setAcctNo((prev) => prev || urlAcctNo);
    }, [isOpen]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [isLinked, setIsLinked] = useState(false);

    const { showWarning, NotificationComponent } = useNotifications();
    const showError = (msg) => setError(msg);
    const clearError = () => setError('');

    const checkAccountNo = async () => {
        clearError();

        if (!acctNo || acctNo.trim() === '') {
            showError('Please enter an Account Number.');
            return;
        }

        setIsLoading(true);

        try {
            const userId = user?.userId || localStorage.getItem('userId') || '';
            const userEmail = userDetails?.email || user?.email || '';
            const userPhone = userDetails?.phone || '';

            // Verify the account number against the lead-management backend.
            // email/phone seed the admin record's contact details from the user profile.
            const response = await api.post('/api/ui/accounts/verify', {
                acctNo: acctNo.trim(),
                userId,
                email: userEmail,
                phone: userPhone,
            });

            const data = response.data;

            if (data.success) {
                setIsLinked(true);
                if (onSave) {
                    onSave({
                        account: {
                            acctId: data.account?.acctId || data.account?._id || '',
                            acctNo: data.account?.acctNo || acctNo.trim(),
                            name: data.account?.name || '',
                            accountName: data.account?.name || '',
                            timezone: data.account?.timezone || '',
                        },
                    });
                }
            } else if (data.emailMismatch) {
                showWarning(data.message);
            } else {
                showError(data.message || 'Failed to verify account. Please check the account number.');
            }
        } catch (err) {
            const errData = err.response?.data;
            if (errData?.emailMismatch) {
                showWarning(errData.message);
            } else {
                showError(errData?.message || 'An error occurred while checking the account. Please try again.');
            }
            console.error('[LinkAccount] verifyAccount error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleClose = () => {
        setAcctNo('');
        setError('');
        setIsLoading(false);
        setIsLinked(false);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <>
            <NotificationComponent />
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center"
                onClick={handleClose}
            >
                {/* Dialog Panel */}
                <div
                    className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl shadow-indigo-500/10 w-full max-w-md mx-4 z-50 relative overflow-hidden border border-white/60"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Gradient header bar */}
                    <div className="px-6 pt-5 pb-4 border-b border-indigo-100/60" style={{ background: 'linear-gradient(135deg, #f8faff 0%, #eef2ff 100%)' }}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-500/30">
                                    <svg className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                    </svg>
                                </div>
                                <div>
                                    <h2 className="text-sm font-bold text-slate-800">Link Account</h2>
                                    <p className="text-[11px] text-slate-500 mt-0.5">
                                        Enter your Account Number to connect it to your profile.
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={handleClose}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    <div className="px-6 py-5">
                        {/* Error banner */}
                        {error && (
                            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs flex items-start gap-2">
                                <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {error}
                            </div>
                        )}

                        {isLinked ? (
                            <div className="text-center py-6">
                                <div className="w-14 h-14 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-500/30">
                                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <p className="text-sm font-bold text-slate-800">Account linked successfully!</p>
                                <p className="text-xs text-slate-500 mt-1">You can now access leads for this account.</p>
                            </div>
                        ) : (
                            <>
                                {/* Input */}
                                <div className="mb-5">
                                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                                        Account Number <span className="text-red-500">*</span>
                                    </label>
                                    <div className="relative rounded-lg bg-slate-200/70 focus-within:bg-gradient-to-r focus-within:from-indigo-500 focus-within:via-violet-400 focus-within:to-indigo-500 p-[1.5px] transition-all duration-300 shadow-sm focus-within:shadow-[0_0_12px_rgba(99,102,241,0.3)]">
                                        <input
                                            type="text"
                                            value={acctNo}
                                            onChange={(e) => { setAcctNo(e.target.value); clearError(); }}
                                            onKeyDown={(e) => e.key === 'Enter' && checkAccountNo()}
                                            placeholder="e.g. 543211"
                                            className="w-full px-3 py-2.5 text-sm bg-white/90 focus:bg-white text-slate-800 rounded-[7px] outline-none placeholder-slate-400 transition-all"
                                            disabled={isLoading}
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                {/* Actions */}
                                <div className="flex gap-2 justify-end">
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        scheme="primary"
                                        onClick={handleClose}
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        size="sm"
                                        onClick={checkAccountNo}
                                        disabled={isLoading || !acctNo.trim()}
                                        loading={isLoading}
                                    >
                                        {!isLoading && (
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        )}
                                        {isLoading ? 'Checking...' : 'Verify'}
                                    </Button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

        </>
    );
};

export default LinkAccountDialog;

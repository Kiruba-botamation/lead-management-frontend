/**
 * Link Account Dialog
 * User enters an Account Number, then clicks "Verify" to check it against the backend.
 * On success, links the account directly.
 */
import React, { useState } from 'react';
import api from '../api/axiosConfig';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from './Notifications';

const LinkAccountDialog = ({ isOpen, onClose, onSave }) => {
    const { user, userDetails } = useAuth();
    const [acctNo, setAcctNo] = useState('');
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

            // Verify the account number against the lead-management backend
            const response = await api.post('/api/ui/accounts/verify', {
                acctNo: acctNo.trim(),
                userId,
                email: userEmail,
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
                className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center"
                onClick={handleClose}
            >
                {/* Dialog Panel */}
                <div
                    className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 z-50 relative"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Link Account</h2>
                            <p className="text-xs text-gray-500 mt-0.5">
                                Enter your Account Number to link it to your profile.
                            </p>
                        </div>
                        <button
                            onClick={handleClose}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

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
                        <div className="text-center py-4">
                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <p className="text-sm font-semibold text-gray-900">Account linked successfully!</p>
                            <p className="text-xs text-gray-500 mt-1">You can now access leads for this account.</p>
                        </div>
                    ) : (
                        <>
                            {/* Input */}
                            <div className="mb-5">
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                                    Account Number <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={acctNo}
                                    onChange={(e) => { setAcctNo(e.target.value); clearError(); }}
                                    onKeyDown={(e) => e.key === 'Enter' && checkAccountNo()}
                                    placeholder="e.g. 543211"
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent transition-all outline-none"
                                    disabled={isLoading}
                                    autoFocus
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 justify-end">
                                <button
                                    onClick={handleClose}
                                    className="px-4 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={checkAccountNo}
                                    disabled={isLoading || !acctNo.trim()}
                                    className="px-4 py-2 text-xs font-semibold text-white bg-black hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                                >
                                    {isLoading ? (
                                        <>
                                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            Checking...
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            Verify
                                        </>
                                    )}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

        </>
    );
};

export default LinkAccountDialog;

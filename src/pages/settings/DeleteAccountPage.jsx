/**
 * Delete Account Tab
 * User must type their Account Number to confirm, then confirm a second dialog.
 * On success, refreshes account list and redirects to /leads.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axiosConfig';
import { useAuth } from '../../context/AuthContext';
import { useAccount } from '../../context/AccountContext';
import { useNotifications } from '../../components/Notifications';
import ConfirmationDialog from '../../components/ConfirmationDialog';
import LoadingMask from '../../components/LoadingMask';

const DeleteAccountPage = ({ acctId: acctIdProp, accountFromUrl }) => {
    const navigate = useNavigate();
    const { logout } = useAuth();
    const { fetchAccounts } = useAccount();
    const { showError, NotificationComponent } = useNotifications();

    const resolvedAcctId = acctIdProp || localStorage.getItem('acctId') || '';

    const [storedAcctNo, setStoredAcctNo] = useState('');
    const [typedAcctNo, setTypedAcctNo] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        setStoredAcctNo(accountFromUrl || '');
    }, [accountFromUrl]);

    const isAccountNoMatch =
        typedAcctNo.trim().toLowerCase() !== '' &&
        typedAcctNo.trim().toLowerCase() === storedAcctNo.trim().toLowerCase();

    const handleShowError = (msg) => {
        setError(msg);
        showError(msg);
    };

    const handleDeleteRequest = () => {
        setError('');
        if (!resolvedAcctId) {
            handleShowError('No Account ID found. Please select an account first.');
            return;
        }
        if (!isAccountNoMatch) {
            handleShowError('Account verification failed: the entered Account No. does not match your account.');
            return;
        }
        setIsConfirmOpen(true);
    };

    const handleDeleteConfirm = async () => {
        setError('');

        if (!isAccountNoMatch) {
            handleShowError('Account verification failed: the entered Account No. does not match your account.');
            setIsConfirmOpen(false);
            return;
        }

        const userId = localStorage.getItem('userId');
        if (!userId) {
            handleShowError('User ID not found. Please log in again.');
            setIsConfirmOpen(false);
            return;
        }

        setIsConfirmOpen(false);
        setIsDeleting(true);
        setIsLoading(true);

        try {
            const response = await api.delete(`/api/accounts/${resolvedAcctId}/user/${userId}`);

            if (!response.data?.success) {
                throw new Error(response.data?.message || 'Failed to delete account.');
            }

            // Immediately remove deleted account from localStorage
            const currentAcctId = localStorage.getItem('acctId');
            if (currentAcctId === resolvedAcctId) {
                localStorage.removeItem('acctId');
                localStorage.removeItem('acctNo');
                localStorage.removeItem('acctName');
            }

            // Refresh AccountContext and redirect
            let nextAcctNo = '';
            try {
                const resp = await api.get(`/api/accounts/user/${userId}`);
                const remaining = resp.data?.accounts || [];
                nextAcctNo = remaining[0]?.acctNo || '';
                if (remaining.length > 0) {
                    localStorage.setItem('acctId', remaining[0]?.acctId || remaining[0]?._id || '');
                    localStorage.setItem('acctNo', nextAcctNo);
                    localStorage.setItem('acctName', remaining[0]?.accountName || '');
                }
            } catch {
                // ignore, just navigate without acc
            }

            // Refresh context state so the deleted account disappears immediately
            await fetchAccounts();

            if (nextAcctNo) {
                navigate(`/leads?acc=${nextAcctNo}`, { replace: true });
            } else {
                navigate('/leads', { replace: true });
            }
        } catch (err) {
            handleShowError('Failed to delete account: ' + (err.message || 'Unknown error.'));
            setIsDeleting(false);
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-xl">
            <NotificationComponent />
            <h2 className="text-base font-bold text-gray-900 mb-1">Delete Account</h2>
            <p className="text-xs text-gray-500 mb-5">
                Permanently delete this account and all its associated data. This action cannot be undone.
            </p>

            {/* Warning banner */}
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
                <div className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                        <p className="text-xs font-semibold text-red-700">This action is irreversible.</p>
                        <p className="text-xs text-red-600 mt-0.5">
                            All leads, settings, and API keys for this account will be permanently removed.
                        </p>
                    </div>
                </div>
            </div>

            {/* Verification input */}
            <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Type your Account No. to confirm
                    {storedAcctNo && (
                        <span className="ml-1 font-normal text-gray-400">( {storedAcctNo} )</span>
                    )}
                </label>
                <input
                    type="text"
                    value={typedAcctNo}
                    onChange={(e) => { setTypedAcctNo(e.target.value); setError(''); }}
                    placeholder="Enter your Account No."
                    disabled={isDeleting}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-400 focus:border-transparent outline-none transition-all disabled:opacity-50"
                />

                {/* Live match feedback */}
                {typedAcctNo.trim() !== '' && (
                    isAccountNoMatch ? (
                        <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Account No. verified.
                        </p>
                    ) : (
                        <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Account No. does not match your account.
                        </p>
                    )
                )}
            </div>

            {/* Inline error */}
            {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs flex items-start gap-1.5">
                    <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                </div>
            )}

            {/* Delete button — only visible when verified */}
            {isAccountNoMatch && (
                <button
                    onClick={handleDeleteRequest}
                    disabled={isDeleting}
                    className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    {isDeleting ? 'Deleting...' : 'Delete Account'}
                </button>
            )}

            {/* Confirmation dialog */}
            <ConfirmationDialog
                isOpen={isConfirmOpen}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setIsConfirmOpen(false)}
                title="Confirm Account Deletion"
                message={`You are about to permanently delete account ${storedAcctNo}. This cannot be undone.`}
                confirmText="Yes, Delete Permanently"
                cancelText="Cancel"
                variant="danger"
                isLoading={isDeleting}
                loadingText="Deleting..."
                warningText="All leads, API keys, and account data will be permanently deleted."
            />

            {/* Full-screen loading overlay */}
            <div className="fixed inset-0 z-50" style={{ pointerEvents: isLoading ? 'auto' : 'none' }}>
                <LoadingMask
                    loading={isLoading}
                    title="Deleting account..."
                    message="Please wait while we process your request."
                />
            </div>
        </div>
    );
};

export default DeleteAccountPage;

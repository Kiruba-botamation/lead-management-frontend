/**
 * Step 2 — Account Verification Dialog
 * Pre-fills account number & name from Step 1. User confirms email, phone, timezone.
 * On submit, the parent (LinkAccountDialog) calls POST /api/ui/lead-management/accountLinkToUser.
 */
import React, { useState, useEffect } from 'react';

// Simple phone validation: 5–13 digits only
const isValidPhone = (phone) => /^\d{5,13}$/.test(phone.replace(/[\s\-+]/g, ''));

const AccountVerificationDialog = ({ isOpen, onClose, onSave, accountData }) => {
    const [form, setForm] = useState({
        acctNo: '',
        accountName: '',
        email: '',
        phoneNo: '',
        timezone: '',
    });
    const [error, setError] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Pre-fill from accountData whenever it changes
    useEffect(() => {
        if (accountData) {
            setForm({
                acctNo: accountData.acctNo || '',
                accountName: accountData.accountName || '',
                email: accountData.email || '',
                phoneNo: accountData.phoneNo || '',
                timezone: accountData.timezone || '',
            });
            setError('');
        }
    }, [accountData]);

    const showError = (msg) => setError(msg);
    const clearError = () => setError('');

    const handleChange = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        clearError();
    };

    const handleSubmit = async () => {
        clearError();

        // Validation
        if (!form.email.trim()) {
            showError('Email is required.');
            return;
        }
        if (!form.phoneNo.trim()) {
            showError('Phone Number is required.');
            return;
        }
        if (!isValidPhone(form.phoneNo.trim())) {
            showError('Phone number must be 5–13 digits (numbers only).');
            return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(form.email.trim())) {
            showError('Please enter a valid email address.');
            return;
        }

        setIsSaving(true);
        try {
            await onSave({ ...form });
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Confirm Account Details</h2>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Review the pre-filled fields and provide your contact details.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
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

                <div className="space-y-4">
                    {/* Account Number — read-only */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Account Number</label>
                        <input
                            type="text"
                            value={form.acctNo}
                            disabled
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                        />
                    </div>

                    {/* Account Name — read-only */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Account Name</label>
                        <input
                            type="text"
                            value={form.accountName}
                            disabled
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                        />
                    </div>

                    {/* Email — editable, required */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Email <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="email"
                            value={form.email}
                            onChange={(e) => handleChange('email', e.target.value)}
                            placeholder="your@email.com"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent transition-all outline-none"
                            disabled={isSaving}
                        />
                    </div>

                    {/* Phone Number — editable, required */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Phone Number <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="tel"
                            value={form.phoneNo}
                            onChange={(e) => handleChange('phoneNo', e.target.value)}
                            placeholder="e.g. 0123456789"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent transition-all outline-none"
                            disabled={isSaving}
                        />
                        <p className="text-[10px] text-gray-400 mt-1">5–13 digits, numbers only.</p>
                    </div>

                    {/* Timezone — optional */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Timezone <span className="text-gray-400 font-normal">(optional)</span></label>
                        <input
                            type="text"
                            value={form.timezone}
                            onChange={(e) => handleChange('timezone', e.target.value)}
                            placeholder="e.g. Asia/Kuala_Lumpur"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent transition-all outline-none"
                            disabled={isSaving}
                        />
                    </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 justify-end mt-6">
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="px-4 py-2 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                    >
                        Back
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSaving}
                        className="px-4 py-2 text-xs font-semibold text-white bg-black hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                        {isSaving ? (
                            <>
                                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Save &amp; Link Account
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AccountVerificationDialog;

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useAccount } from '../context/AccountContext';
import { authApi } from '../api/axiosConfig';
import { compressImage } from '../utils/imageCompression';
import { validateImageFile } from '../utils/fileValidation';
import { useNotifications } from '../components/Notifications';
import Button from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import AppNavbar from '../components/AppNavbar';

const ProfilePage = () => {
    const { user, userDetails, checkAuth, adminViewActive } = useAuth();
    const { acctId } = useAccount();
    const { showSuccess, showError } = useNotifications();

    const userId = user?.userId || '';

    // ── User data (fetched from GET /api/user/users/:userId) ──────────────────
    const [userData, setUserData] = useState({ name: '', email: '', phone: '', role: '', roleLabel: '' });
    const [userDataLoading, setUserDataLoading] = useState(false);

    // ── Email update form ──────────────────────────────────────────────────────
    const [newEmail, setNewEmail] = useState('');
    const [emailLoading, setEmailLoading] = useState(false);

    // ── Phone update form ─────────────────────────────────────────────────────
    const [newPhone, setNewPhone] = useState('');
    const [phoneLoading, setPhoneLoading] = useState(false);

    // ── Password form ─────────────────────────────────────────────────────────
    const [pwForm, setPwForm] = useState({ newPassword: '', confirmPassword: '' });
    const [pwLoading, setPwLoading] = useState(false);
    const [showPw, setShowPw] = useState({ new: false, confirm: false });

    // ── Profile picture ───────────────────────────────────────────────────────
    const [avatarPreview, setAvatarPreview] = useState('');
    const [avatarLoading, setAvatarLoading] = useState(false);
    const fileInputRef = useRef(null);

    // ── Fetch user details on mount ───────────────────────────────────────────
    const fetchUserData = async () => {
        if (!userId) return;
        setUserDataLoading(true);
        try {
            const res = await authApi.get(`/api/user/users/${userId}`);
            const u = res.data.user;
            setUserData({
                name: u.name || '',
                email: u.email || '',
                phone: u.phone || '',
                role: u.role || '',
                roleLabel: u.roleLabel || '',
            });
            setNewEmail(u.email || '');
            setNewPhone(u.phone || '');
            // Resolve relative profile image URLs
            const imgUrl = u.profileImageUrl || '';
            setAvatarPreview(imgUrl || '');
        } catch {
            // Fallback to AuthContext values
            const src = userDetails || user || {};
            setUserData({ name: src.name || '', email: src.email || '', phone: src.phone || '', role: '', roleLabel: '' });
            setNewEmail(src.email || '');
            setNewPhone(src.phone || '');
            setAvatarPreview(src.profileImageUrl || '');
        } finally {
            setUserDataLoading(false);
        }
    };

    useEffect(() => {
        // Skip server fetch when viewing as an admin — use the injected details instead
        if (adminViewActive) return;
        fetchUserData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, adminViewActive]);

    // ── Sync local display state when AuthContext userDetails changes ──────────
    // This fires when an admin is clicked in AdminTab, updating the view
    // without re-fetching from the server.
    useEffect(() => {
        if (!userDetails) return;
        setUserData((prev) => ({
            ...prev,
            ...(userDetails.name && { name: userDetails.name }),
            ...(userDetails.email && { email: userDetails.email }),
            ...(userDetails.phone && { phone: userDetails.phone }),
            ...(userDetails.role && { role: userDetails.role }),
        }));
        if (userDetails.email) setNewEmail(userDetails.email);
        if (userDetails.phone) setNewPhone(userDetails.phone);
        if (userDetails.profileImageUrl) {
            const img = userDetails.profileImageUrl;
            setAvatarPreview(img || '');
        }
    }, [userDetails]);

    // ── Handlers ──────────────────────────────────────────────────────────────

    // POST /api/user/updateEmail  →  { acctId, newEmail, userId }
    const handleUpdateEmail = async (e) => {
        e.preventDefault();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!newEmail) { showError('Email is required.'); return; }
        if (!emailRegex.test(newEmail)) { showError('Please enter a valid email address.'); return; }
        if (!userId) { showError('User ID not found.'); return; }
        setEmailLoading(true);
        try {
            await authApi.post('/api/user/updateEmail', { acctId, newEmail, userId });
            showSuccess('Email updated successfully.');
            setUserData(d => ({ ...d, email: newEmail }));
            await checkAuth();
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to update email. Please try again.');
        } finally {
            setEmailLoading(false);
        }
    };

    // POST /api/user/updatePhone  →  { acctId, newPhone, userId }
    const handleUpdatePhone = async (e) => {
        e.preventDefault();
        if (!newPhone.trim()) { showError('Phone number is required.'); return; }
        if (!userId) { showError('User ID not found.'); return; }
        setPhoneLoading(true);
        try {
            await authApi.post('/api/user/updatePhoneNumber', { userId, phone: newPhone.trim() });
            showSuccess('Phone number updated successfully.');
            setUserData(d => ({ ...d, phone: newPhone.trim() }));
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to update phone number. Please try again.');
        } finally {
            setPhoneLoading(false);
        }
    };

    // POST /api/user/changePassword  →  { acctId, newPassword, userId }
    const handlePasswordChange = async (e) => {
        e.preventDefault();
        if (pwForm.newPassword !== pwForm.confirmPassword) {
            showError('New passwords do not match.');
            return;
        }
        const strongPw = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;
        if (!strongPw.test(pwForm.newPassword)) {
            showError('Password must be at least 8 characters with uppercase, lowercase, digit, and special character.');
            return;
        }
        if (!userId) { showError('User ID not found.'); return; }
        setPwLoading(true);
        try {
            await authApi.post('/api/user/changePassword', { acctId, newPassword: pwForm.newPassword, userId });
            showSuccess('Password changed successfully.');
            setPwForm({ newPassword: '', confirmPassword: '' });
        } catch (err) {
            showError(err.response?.data?.message || 'Failed to change password. Please try again.');
        } finally {
            setPwLoading(false);
        }
    };

    // PUT /api/user/myprofileUpload/:userId  →  multipart/form-data (image, acctId, userId)
    const handleAvatarChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // Multi-layer security validation: extension allowlist, file size cap,
        // MIME type check, and magic byte verification to reject executables
        // or other malicious files regardless of how they are named.
        try {
            await validateImageFile(file);
        } catch (err) {
            showError(err.message);
            // Reset the input so the same file cannot be re-submitted silently
            e.target.value = '';
            return;
        }
        // Preview the original immediately (before compression)
        const reader = new FileReader();
        reader.onload = (ev) => setAvatarPreview(ev.target.result);
        reader.readAsDataURL(file);
        setAvatarLoading(true);
        try {
            // Compress to max 100 KB before upload
            const compressedFile = await compressImage(file, 100);
            const formData = new FormData();
            formData.append('image', compressedFile);
            formData.append('acctId', acctId || '');
            formData.append('userId', userId);
            const res = await authApi.put(`/api/user/myprofileUpload/${userId}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const imageUrl = res.data.data.imageUrl;
            if (imageUrl) {
                setAvatarPreview(`${imageUrl}?t=${Date.now()}`);
            } else {
                throw new Error('Failed to get uploaded image URL');
            }
            showSuccess('Profile photo updated successfully.');
            await checkAuth();
        } catch (err) {
            showError(err.response?.data?.message || err.message || 'Failed to upload image.');
        } finally {
            setAvatarLoading(false);
        }
    };

    const initials = (userData.name || user?.email || 'U').charAt(0).toUpperCase();

    return (
        <div className="min-h-screen bg-gray-50">
            {/* ── Navbar ───────────────────────────────────────────────────── */}
            <AppNavbar activePage={null} />
            {/* ── Page body ─────────────────────────────────────────────────── */}
            <div className="container mx-auto px-4 py-8 max-w-2xl">

                {/* ── Profile Picture ───────────────────────────────────────── */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                    <h2 className="text-sm font-bold text-gray-900 mb-4">Profile Picture</h2>
                    <div className="flex items-center gap-5">
                        <div className="relative">
                            {avatarPreview
                                ? <img src={avatarPreview} alt="Profile" className="w-20 h-20 rounded-full object-cover border-2 border-gray-200 shadow" />
                                : <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-2xl font-bold border-2 border-gray-200 shadow">{initials}</div>
                            }
                            {avatarLoading && (
                                <div className="absolute inset-0 rounded-full bg-black bg-opacity-40 flex items-center justify-center">
                                    <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                    </svg>
                                </div>
                            )}
                        </div>
                        <div>
                            {/* Only JPEG/PNG accepted — validated in handleAvatarChange */}
                            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={handleAvatarChange} />
                            <Button size="sm" loading={avatarLoading} onClick={() => fileInputRef.current?.click()} disabled={avatarLoading}>
                                Change Photo
                            </Button>
                            <p className="text-[11px] text-gray-400 mt-1.5">JPEG or PNG only</p>
                        </div>
                    </div>
                </div>

                {/* ── Personal Information (display only) ───────────────────── */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                    <h2 className="text-sm font-bold text-gray-900 mb-1">Personal Information</h2>
                    <p className="text-xs text-gray-500 mb-4">Your account details from the server.</p>
                    {userDataLoading ? (
                        <div className="flex items-center gap-2 py-4">
                            <svg className="w-4 h-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                            <span className="text-xs text-gray-400">Loading...</span>
                        </div>
                    ) : (
                        <dl className="space-y-3">
                            {[
                                { label: 'Full Name', value: userData.name },
                                { label: 'Phone Number', value: userData.phone },
                                { label: 'Role', value: userData.roleLabel || userData.role },
                            ].map(({ label, value }) => (
                                <div key={label} className="flex items-start gap-3">
                                    <dt className="w-28 text-[11px] font-semibold text-gray-500 pt-0.5 shrink-0">{label}</dt>
                                    <dd className="text-xs text-gray-900">{value || <span className="text-gray-400">—</span>}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </div>

                {/* ── Update Email ───────────────────────────────────────────── */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                    <h2 className="text-sm font-bold text-gray-900 mb-1">Update Email</h2>
                    <p className="text-xs text-gray-500 mb-4">Change the email address associated with your account.</p>
                    <form onSubmit={handleUpdateEmail} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Email Address</label>
                            <Input
                                type="email"
                                value={newEmail}
                                onChange={e => setNewEmail(e.target.value)}
                                placeholder="you@example.com"
                            />
                        </div>

                        <Button type="submit" size="sm" loading={emailLoading} disabled={emailLoading}>
                            Update Email
                        </Button>
                    </form>
                </div>

                {/* ── Update Phone Number ───────────────────────────────────── */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                    <h2 className="text-sm font-bold text-gray-900 mb-1">Update Phone Number</h2>
                    <p className="text-xs text-gray-500 mb-4">Change the phone number associated with your account.</p>
                    <form onSubmit={handleUpdatePhone} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Phone Number</label>
                            <Input
                                type="tel"
                                value={newPhone}
                                onChange={e => setNewPhone(e.target.value)}
                                placeholder="+1 234 567 8900"
                            />
                        </div>

                        <Button type="submit" size="sm" loading={phoneLoading} disabled={phoneLoading}>
                            Update Phone
                        </Button>
                    </form>
                </div>

                {/* ── Change Password ────────────────────────────────────────── */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-sm font-bold text-gray-900 mb-1">Change Password</h2>
                    <p className="text-xs text-gray-500 mb-4">Must be at least 8 characters with uppercase, lowercase, digit &amp; special character.</p>
                    <form onSubmit={handlePasswordChange} className="space-y-4">
                        {[
                            { key: 'newPassword', label: 'New Password' },
                            { key: 'confirmPassword', label: 'Confirm New Password' },
                        ].map(({ key, label }) => (
                            <div key={key}>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
                                <Input
                                    type={showPw[key] ? 'text' : 'password'}
                                    value={pwForm[key]}
                                    onChange={e => setPwForm(f => ({ ...f, [key]: e.target.value }))}
                                    placeholder="••••••••"
                                    trailingIcon={
                                        <button type="button" onClick={() => setShowPw(s => ({ ...s, [key]: !s[key] }))}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-subtle)', display: 'flex', alignItems: 'center' }}>
                                            {showPw[key]
                                                ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                                : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                            }
                                        </button>
                                    }
                                />
                            </div>
                        ))}

                        <Button type="submit" size="sm" loading={pwLoading} disabled={pwLoading}>
                            Change Password
                        </Button>
                    </form>
                </div>

            </div>
        </div>
    );
};

export default ProfilePage;

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAccount } from '../context/AccountContext';
import { authApi } from '../api/axiosConfig';
import { compressImage } from '../utils/imageCompression';

const ProfilePage = () => {
    const navigate = useNavigate();
    const { user, userDetails, logout, checkAuth } = useAuth();
    const {
        acctId, acctNo, acctName, accounts,
        isAccountLinked, accountsLoaded,
        setIsLinkDialogOpen, switchAccount,
    } = useAccount();

    const [showUserMenu, setShowUserMenu] = useState(false);
    const [showAccountMenu, setShowAccountMenu] = useState(false);
    const accountMenuRef = useRef(null);
    const userMenuRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (accountMenuRef.current && !accountMenuRef.current.contains(e.target)) setShowAccountMenu(false);
            if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const userId = localStorage.getItem('userId') || user?.userId || user?.id || '';

    // ── User data (fetched from GET /api/user/users/:userId) ──────────────────
    const [userData, setUserData] = useState({ name: '', email: '', phone: '', role: '', roleLabel: '' });
    const [userDataLoading, setUserDataLoading] = useState(false);

    // ── Email update form ──────────────────────────────────────────────────────
    const [newEmail, setNewEmail] = useState('');
    const [emailLoading, setEmailLoading] = useState(false);
    const [emailSuccess, setEmailSuccess] = useState('');
    const [emailError, setEmailError] = useState('');

    // ── Password form ─────────────────────────────────────────────────────────
    const [pwForm, setPwForm] = useState({ newPassword: '', confirmPassword: '' });
    const [pwLoading, setPwLoading] = useState(false);
    const [pwSuccess, setPwSuccess] = useState('');
    const [pwError, setPwError] = useState('');
    const [showPw, setShowPw] = useState({ new: false, confirm: false });

    // ── Profile picture ───────────────────────────────────────────────────────
    const [avatarPreview, setAvatarPreview] = useState('');
    const [avatarLoading, setAvatarLoading] = useState(false);
    const [avatarError, setAvatarError] = useState('');
    const [avatarSuccess, setAvatarSuccess] = useState('');
    const fileInputRef = useRef(null);

    // ── Fetch user details on mount ───────────────────────────────────────────
    const fetchUserData = async () => {
        if (!userId) return;
        setUserDataLoading(true);
        try {
            const res = await authApi.get(`/api/user/users/${userId}`);
            const u = res.data?.user || res.data || {};
            setUserData({
                name: u.name || '',
                email: u.email || '',
                phone: u.phone || '',
                role: u.role || '',
                roleLabel: u.roleLabel || '',
            });
            setNewEmail(u.email || '');
            // Resolve relative profile image URLs
            const imgUrl = u.profileImageUrl || '';
            setAvatarPreview(imgUrl.startsWith('/') ? `http://localhost:8080${imgUrl}` : imgUrl);
        } catch {
            // Fallback to AuthContext values
            const src = userDetails || user || {};
            setUserData({ name: src.name || '', email: src.email || '', phone: src.phone || '', role: '', roleLabel: '' });
            setNewEmail(src.email || '');
            setAvatarPreview(src.profileImageUrl || '');
        } finally {
            setUserDataLoading(false);
        }
    };

    useEffect(() => {
        fetchUserData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    // ── Handlers ──────────────────────────────────────────────────────────────

    // POST /api/user/updateEmail  →  { acctId, newEmail, userId }
    const handleUpdateEmail = async (e) => {
        e.preventDefault();
        setEmailError('');
        setEmailSuccess('');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!newEmail) { setEmailError('Email is required.'); return; }
        if (!emailRegex.test(newEmail)) { setEmailError('Please enter a valid email address.'); return; }
        if (!userId) { setEmailError('User ID not found.'); return; }
        setEmailLoading(true);
        try {
            await authApi.post('/api/user/updateEmail', { acctId, newEmail, userId });
            setEmailSuccess('Email updated successfully.');
            setUserData(d => ({ ...d, email: newEmail }));
            await checkAuth();
        } catch (err) {
            setEmailError(err.response?.data?.message || 'Failed to update email. Please try again.');
        } finally {
            setEmailLoading(false);
        }
    };

    // POST /api/user/changePassword  →  { acctId, newPassword, userId }
    const handlePasswordChange = async (e) => {
        e.preventDefault();
        setPwError('');
        setPwSuccess('');
        if (pwForm.newPassword !== pwForm.confirmPassword) {
            setPwError('New passwords do not match.');
            return;
        }
        const strongPw = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;
        if (!strongPw.test(pwForm.newPassword)) {
            setPwError('Password must be at least 8 characters with uppercase, lowercase, digit, and special character.');
            return;
        }
        if (!userId) { setPwError('User ID not found.'); return; }
        setPwLoading(true);
        try {
            await authApi.post('/api/user/changePassword', { acctId, newPassword: pwForm.newPassword, userId });
            setPwSuccess('Password changed successfully.');
            setPwForm({ newPassword: '', confirmPassword: '' });
        } catch (err) {
            setPwError(err.response?.data?.message || 'Failed to change password. Please try again.');
        } finally {
            setPwLoading(false);
        }
    };

    // PUT /api/user/myprofileUpload/:userId  →  multipart/form-data (image, acctId, userId)
    const handleAvatarChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setAvatarError('');
        setAvatarSuccess('');
        if (!['image/jpeg', 'image/png'].includes(file.type)) {
            setAvatarError('Only JPEG or PNG files are allowed!');
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
            const imageUrl = res.data?.data?.imageUrl || res.data?.fileUrl || res.data?.imageUrl || '';
            if (imageUrl) {
                const resolved = imageUrl.startsWith('/') ? `http://localhost:8080${imageUrl}` : imageUrl;
                setAvatarPreview(`${resolved}?t=${Date.now()}`);
            } else {
                throw new Error('Failed to get uploaded image URL');
            }
            setAvatarSuccess('Profile photo updated successfully.');
            await checkAuth();
        } catch (err) {
            setAvatarError(err.response?.data?.message || err.message || 'Failed to upload image.');
        } finally {
            setAvatarLoading(false);
        }
    };

    const initials = (userData.name || user?.email || 'U').charAt(0).toUpperCase();

    return (
        <div className="min-h-screen bg-gray-50">
            {/* ── Navbar ───────────────────────────────────────────────────── */}
            <nav className="bg-black border-b border-gray-800 shadow-lg">
                <div className="container mx-auto px-4">
                    <div className="flex items-center gap-4">
                        {/* Logo */}
                        <div className="py-2">
                            <img src="/botamation_logo.jpg" alt="Logo" className="w-10 h-10 object-contain rounded-lg shadow-lg" />
                        </div>

                        {/* Nav tabs */}
                        <div className="flex items-center gap-1">
                            <button onClick={() => navigate('/leads')} className="px-3 py-2 text-xs font-semibold transition-all duration-300 rounded-t-lg relative text-gray-400 hover:bg-gray-900 hover:text-white">
                                <div className="flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                    Leads
                                </div>
                            </button>
                            <button onClick={() => navigate('/settings')} className="px-3 py-2 text-xs font-semibold transition-all duration-300 rounded-t-lg relative text-gray-400 hover:bg-gray-900 hover:text-white">
                                <div className="flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    Settings
                                </div>
                            </button>
                        </div>

                        {/* Right side */}
                        <div className="ml-auto py-2 flex items-center gap-2">

                            {/* Account dropdown */}
                            {accountsLoaded && (
                                <div className="relative" ref={accountMenuRef}>
                                    {isAccountLinked && acctNo ? (
                                        <>
                                            <button
                                                onClick={() => { setShowAccountMenu(v => !v); setShowUserMenu(false); }}
                                                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900 hover:bg-gray-800 transition-all duration-300 border border-gray-700"
                                            >
                                                <div className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0"></div>
                                                <span className="text-xs font-medium text-white max-w-[180px] truncate hidden md:block">{acctName || acctNo}</span>
                                                <svg className={`w-3 h-3 text-gray-400 transition-transform duration-300 ${showAccountMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </button>
                                            {showAccountMenu && (
                                                <div className="absolute right-0 mt-1 w-full bg-white rounded-lg shadow-2xl border border-gray-200 py-1 z-50">
                                                    <p className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Linked Accounts</p>
                                                    {accounts.map((acc) => (
                                                        <button key={acc.acctNo} onClick={() => { switchAccount(acc); setShowAccountMenu(false); }}
                                                            className={`w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-2 ${acc.acctNo === acctNo ? 'bg-gray-50 font-semibold text-gray-900' : 'text-gray-700 hover:bg-gray-50'}`}
                                                        >
                                                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${acc.acctNo === acctNo ? 'bg-green-400' : 'bg-gray-300'}`}></div>
                                                            <div className="flex flex-col min-w-0">
                                                                <span className="truncate">{acc.accountName || acc.acctNo}</span>
                                                                {acc.accountName && <span className="text-[10px] text-gray-400 truncate">{acc.acctNo}</span>}
                                                            </div>
                                                            {acc.acctNo === acctNo && (
                                                                <svg className="w-3 h-3 text-green-500 ml-auto flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                </svg>
                                                            )}
                                                        </button>
                                                    ))}
                                                    <div className="border-t border-gray-100 mt-1 pt-1">
                                                        <button onClick={() => { setIsLinkDialogOpen(true); setShowAccountMenu(false); }}
                                                            className="w-full px-3 py-2 text-left text-xs text-gray-500 hover:bg-gray-50 transition-colors flex items-center gap-2">
                                                            <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                            </svg>
                                                            Link another account
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <button onClick={() => setIsLinkDialogOpen(true)}
                                            className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 transition-all duration-300 border border-yellow-400 text-black">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                            </svg>
                                            <span className="text-xs font-medium hidden md:block">Link Account</span>
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* User Profile */}
                            <div className="relative" ref={userMenuRef}>
                                <button
                                    onClick={() => { setShowUserMenu(v => !v); setShowAccountMenu(false); }}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-900 hover:bg-gray-800 transition-all duration-300 border border-gray-700"
                                >
                                    {avatarPreview
                                        ? <img src={avatarPreview} alt="avatar" className="w-6 h-6 rounded-full object-cover border border-gray-600" />
                                        : <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-white text-xs font-bold shadow-lg border border-gray-600">{initials}</div>
                                    }
                                    <span className="text-xs font-medium text-white hidden md:block">{userData.name || user?.email || 'User'}</span>
                                    <svg className={`w-3 h-3 text-gray-400 transition-transform duration-300 ${showUserMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                                {showUserMenu && (
                                    <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-2xl border border-gray-200 py-1 z-50">
                                        <div className="px-3 py-2 border-b border-gray-100">
                                            <p className="text-xs font-semibold text-gray-900">{userData.name || 'User'}</p>
                                            <p className="text-[10px] text-gray-500 truncate mt-0.5">{userData.email || ''}</p>
                                        </div>
                                        <button onClick={() => { setShowUserMenu(false); navigate('/profile'); }}
                                            className="w-full px-3 py-2 text-left text-xs font-medium text-gray-900 hover:bg-gray-100 transition-colors flex items-center gap-1.5 bg-gray-50">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                            My Profile
                                        </button>
                                        <button onClick={() => { setShowUserMenu(false); logout(); }}
                                            className="w-full px-3 py-2 text-left text-xs font-medium text-gray-900 hover:bg-gray-100 transition-colors flex items-center gap-1.5">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                            </svg>
                                            Logout
                                        </button>
                                    </div>
                                )}
                            </div>

                        </div>
                    </div>
                </div>
            </nav>

            {/* ── Page body ─────────────────────────────────────────────────── */}
            <div className="container mx-auto px-4 py-8 max-w-2xl">

                {/* ── Profile Picture ───────────────────────────────────────── */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
                    <h2 className="text-sm font-bold text-gray-900 mb-4">Profile Picture</h2>
                    <div className="flex items-center gap-5">
                        <div className="relative">
                            {avatarPreview
                                ? <img src={avatarPreview} alt="Profile" className="w-20 h-20 rounded-full object-cover border-2 border-gray-200 shadow" />
                                : <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-white text-2xl font-bold border-2 border-gray-200 shadow">{initials}</div>
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
                            <button onClick={() => fileInputRef.current?.click()} disabled={avatarLoading}
                                className="px-4 py-2 text-xs font-semibold bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50">
                                {avatarLoading ? 'Uploading...' : 'Change Photo'}
                            </button>
                            <p className="text-[11px] text-gray-400 mt-1.5">JPEG or PNG only</p>
                            {avatarError && <p className="text-xs text-red-600 mt-1">{avatarError}</p>}
                            {avatarSuccess && <p className="text-xs text-green-600 mt-1">{avatarSuccess}</p>}
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
                            <input
                                type="email"
                                value={newEmail}
                                onChange={e => setNewEmail(e.target.value)}
                                placeholder="you@example.com"
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                            />
                        </div>

                        {emailError && (
                            <p className="text-xs text-red-600 flex items-center gap-1">
                                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {emailError}
                            </p>
                        )}
                        {emailSuccess && (
                            <p className="text-xs text-green-600 flex items-center gap-1">
                                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                {emailSuccess}
                            </p>
                        )}

                        <button type="submit" disabled={emailLoading}
                            className="px-5 py-2 text-xs font-semibold bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
                            {emailLoading ? (
                                <>
                                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                    </svg>
                                    Updating...
                                </>
                            ) : 'Update Email'}
                        </button>
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
                                <div className="relative">
                                    <input
                                        type={showPw[key] ? 'text' : 'password'}
                                        value={pwForm[key]}
                                        onChange={e => setPwForm(f => ({ ...f, [key]: e.target.value }))}
                                        placeholder="••••••••"
                                        className="w-full px-3 py-2 pr-9 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
                                    />
                                    <button type="button" onClick={() => setShowPw(s => ({ ...s, [key]: !s[key] }))}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                        {showPw[key]
                                            ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                            : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                        }
                                    </button>
                                </div>
                            </div>
                        ))}

                        {pwError && (
                            <p className="text-xs text-red-600 flex items-center gap-1">
                                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {pwError}
                            </p>
                        )}
                        {pwSuccess && (
                            <p className="text-xs text-green-600 flex items-center gap-1">
                                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                {pwSuccess}
                            </p>
                        )}

                        <button type="submit" disabled={pwLoading}
                            className="px-5 py-2 text-xs font-semibold bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5">
                            {pwLoading ? (
                                <>
                                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                    </svg>
                                    Updating...
                                </>
                            ) : 'Change Password'}
                        </button>
                    </form>
                </div>

            </div>
        </div>
    );
};

export default ProfilePage;

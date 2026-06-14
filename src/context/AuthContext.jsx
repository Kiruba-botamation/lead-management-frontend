import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import api, { AUTH_SERVICE_URL, authApi } from '../api/axiosConfig';
import {
    normalizeUserData,
    logAuthEvent,
    getCurrentServiceUrl,
    redirectToSSOLogin,
} from '../utils/authHelpers';

const AuthContext = createContext(null);

// ── localStorage helpers ──────────────────────────────────────────────────────
const LS_CHATBOT_ADMIN = 'chatbotAdmin'; // JSON: { name, profileImageUrl, chatbotAdminId }
const LS_ADMIN_ID      = 'adminId';

export function loadChatbotAdminFromStorage() {
    try {
        const raw = localStorage.getItem(LS_CHATBOT_ADMIN);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function saveChatbotAdminToStorage(obj) {
    try { localStorage.setItem(LS_CHATBOT_ADMIN, JSON.stringify(obj)); } catch { /* ignore */ }
}

/**
 * Fetch the account_admins list for `acctId`, find the record matching
 * `email`, and persist the chatbot admin identity to localStorage + state.
 *
 * Call this on: login, page refresh, account switch, admin list refresh.
 *
 * @param {string}   acctId
 * @param {string}   email           - logged-in user's email
 * @param {function} setChatbotAdmin - state setter from AuthContext
 * @param {function} setAdminId      - state setter from AuthContext
 * @returns {object|null}            - the chatbotAdmin data object, or null
 */
export async function resolveChatbotAdmin(acctId, email, setChatbotAdmin, setAdminId) {
    if (!acctId || !email) return null;
    try {
        const res = await api.get('/api/ui/admins/list', { params: { acctId, limit: 200 } });
        const raw = res.data;
        const adminList = Array.isArray(raw) ? raw : (raw.admins || raw.data || []);

        const userEmail    = email.trim().toLowerCase();
        const matchedAdmin = adminList.find(
            a => (a.email || '').trim().toLowerCase() === userEmail
        );

        if (!matchedAdmin?._id) return null;

        // Persist account_admins._id
        localStorage.setItem(LS_ADMIN_ID, matchedAdmin._id);
        setAdminId?.(matchedAdmin._id);

        // Build display name
        const name = [matchedAdmin.firstName || '', matchedAdmin.lastName || '']
            .filter(Boolean).join(' ') || matchedAdmin.email || '';

        const data = {
            name,
            profileImageUrl: matchedAdmin.profileImage || '',
            chatbotAdminId:  matchedAdmin.chatbotAdminId || '',
        };

        saveChatbotAdminToStorage(data);
        setChatbotAdmin?.(data);
        return data;
    } catch (err) {
        console.warn('[SSO] resolveChatbotAdmin error:', err.message);
        return null;
    }
}

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);      // Raw user from SSO token
    const [userDetails, setUserDetails] = useState(null);      // Full user profile from auth DB
    const [loading, setLoading] = useState(true);      // Auth check in progress
    const [authenticated, setAuthenticated] = useState(false); // Is session valid?
    const [adminViewActive, setAdminViewActive] = useState(false); // True when viewing as an admin
    const [adminId, setAdminId] = useState(null);      // account_admins._id for the logged-in user
    /**
     * chatbotAdmin — the account_admins record for the logged-in user.
     * Persisted to localStorage so it's available instantly on next page load
     * before the async admins/list fetch completes.
     * Shape: { name, profileImageUrl, chatbotAdminId }
     */
    const [chatbotAdmin, setChatbotAdmin] = useState(() => loadChatbotAdminFromStorage());

    // Prevents duplicate checks in React StrictMode
    const authCheckedRef = useRef(false);
    const authCheckingRef = useRef(false);

    useEffect(() => {
        if (authCheckedRef.current || authCheckingRef.current) return;
        authCheckedRef.current = true;
        authCheckingRef.current = true;
        checkAuth();
    }, []);

    const checkAuth = async () => {
        let redirectingTo401 = false;
        try {
            setLoading(true);

            // ── Core SSO auth check ──────────────────────────────────────────
            // Backend reads the HTTP-only JWT cookie and returns the user.
            // If cookie is missing or expired, it returns 401 (interceptor redirects).
            const response = await api.get('/api/ui/sso/auth');

            if (response.data.success || response.data.user) {
                const rawUser = response.data.user || response.data.data || {};
                const userData = normalizeUserData(rawUser);

                setAuthenticated(true);
                setUser(rawUser);
                logAuthEvent('Auth check passed', { userId: userData.userId });

                // NOTE: chatbotAdmin resolution (admins/list lookup) is triggered by
                // LeadsGrid whenever acctId becomes available or changes. This is because
                // acctId no longer lives in the JWT — it comes from the account switcher.
                // On first load, loadChatbotAdminFromStorage() provides instant fallback.

                // ── Optional: Fetch full user profile from auth backend ──────
                if (userData.userId) {
                    try {
                        const profileRes = await authApi.get(`/api/user/users/${userData.userId}`);
                        if (profileRes.data?.success && profileRes.data?.user) {
                            const profile = profileRes.data.user;
                            setUserDetails({
                                name: profile.name || '',
                                phone: profile.phone || '',
                                email: profile.email || '',
                                timezone: profile.timezone || '',
                                role: profile.role,
                                roleLabel: profile.roleLabel,
                                profileImageUrl: profile.profileImageUrl || '',
                            });
                            // Persist email so it's available on next page load before the
                            // async profile fetch completes (e.g. analytics admin matching).
                            if (profile.email) {
                                localStorage.setItem('userEmail', profile.email.trim().toLowerCase());
                            }
                        }
                    } catch (profileError) {
                        console.warn('[SSO] Could not fetch user profile:', profileError.message);
                    }
                }
            } else {
                setAuthenticated(false);
                setUser(null);
            }
        } catch (error) {
            if (error.response?.status === 401) {
                // 401 → the axios interceptor is already redirecting to SSO login.
                // Keep loading=true so ProtectedRoute shows the spinner instead
                // of also triggering a competing redirect with a different URL.
                console.log('[SSO] Auth check returned 401 — interceptor is redirecting');
                redirectingTo401 = true;
            } else {
                // Any other error: mark as unauthenticated
                setAuthenticated(false);
                setUser(null);
            }
        } finally {
            if (!redirectingTo401) {
                setLoading(false);
            }
            authCheckingRef.current = false;
        }
    };

    const logout = async () => {
        // 1. Clear local state immediately
        setAuthenticated(false);
        setUser(null);
        setUserDetails(null);
        setAdminId(null);
        setChatbotAdmin(null);

        // 2. Tell the backend to clear the server-side cookie
        try {
            await api.post('/api/ui/sso/logout');
        } catch (e) {
            console.warn('[SSO] Server logout failed, continuing with client cleanup');
        }

        // 3. Clear all local storage
        localStorage.clear();
        sessionStorage.clear();

        // 4. Redirect to SSO login page
        const redirectParam = encodeURIComponent(getCurrentServiceUrl());
        window.location.href = `${AUTH_SERVICE_URL}/login?redirect=${redirectParam}`;
    };

    const redirectToLogin = () => {
        redirectToSSOLogin(getCurrentServiceUrl());
    };

    return (
        <AuthContext.Provider value={{
            user,
            setUser,
            userDetails,
            setUserDetails,
            adminId,
            setAdminId,
            chatbotAdmin,    // { name, profileImageUrl, chatbotAdminId } — persisted to localStorage
            setChatbotAdmin,
            adminViewActive,
            setAdminViewActive,
            authenticated,
            loading,
            logout,
            checkAuth,
            redirectToLogin,
        }}>
            {children}
        </AuthContext.Provider>
    );
};

// Custom hook — use this in any component to access auth state
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within <AuthProvider>');
    }
    return context;
};

export default AuthContext;

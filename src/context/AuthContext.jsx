import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import api, { AUTH_SERVICE_URL, authApi } from '../api/axiosConfig';
import {
    normalizeUserData,
    logAuthEvent,
    getCurrentServiceUrl,
    redirectToSSOLogin,
} from '../utils/authHelpers';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);      // Raw user from SSO token
    const [userDetails, setUserDetails] = useState(null);      // Full user profile from auth DB
    const [loading, setLoading] = useState(true);      // Auth check in progress
    const [authenticated, setAuthenticated] = useState(false); // Is session valid?

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
            // 401 is handled by the axios interceptor (auto-redirect to SSO login)
            // Any other error: mark as unauthenticated
            if (error.response?.status !== 401) {
                setAuthenticated(false);
                setUser(null);
            }
        } finally {
            setLoading(false);
            authCheckingRef.current = false;
        }
    };

    const logout = async () => {
        // 1. Clear local state immediately
        setAuthenticated(false);
        setUser(null);
        setUserDetails(null);

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
            userDetails,
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

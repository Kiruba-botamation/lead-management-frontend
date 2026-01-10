import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import api, { AUTH_SERVICE_URL } from '../api/axiosConfig';
import {
    normalizeUserData,
    logAuthEvent,
    getCurrentServiceUrl,
    getAuthServiceUrl
} from '../utils/authHelpers';

const AuthContext = createContext(null);

// Track if we're already redirecting (module level to survive re-renders)
let isRedirectingToLogin = false;

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [authenticated, setAuthenticated] = useState(false);
    const [authChecked, setAuthChecked] = useState(false);

    // Check authentication on mount - only once
    useEffect(() => {
        if (!authChecked) {
            checkAuth();
        }
    }, [authChecked]);

    const checkAuth = async () => {
        // Don't check if already redirecting
        if (isRedirectingToLogin) {
            return;
        }

        try {
            setLoading(true);

            // Call backend's SSO auth verification endpoint
            const response = await api.get('/api/ui/sso/auth');

            if (response.data.success || response.data.user) {
                const userData = normalizeUserData(response.data.user || response.data.data || {});
                setAuthenticated(true);
                setUser(response.data.user || response.data.data);
            } else {
                setAuthenticated(false);
                setUser(null);
            }
        } catch (error) {
            setAuthenticated(false);
            setUser(null);
        } finally {
            setLoading(false);
            setAuthChecked(true);
        }
    };

    const logout = useCallback(async () => {
        if (isRedirectingToLogin) return;
        isRedirectingToLogin = true;

        try {
            await api.post(`${AUTH_SERVICE_URL}/api/auth/logout`);
        } catch (error) {
            // Ignore logout errors
        }

        // Clear local state
        setAuthenticated(false);
        setUser(null);
        localStorage.clear();

        // Redirect to auth service login page
        const currentServiceUrl = getCurrentServiceUrl();
        const authServiceUrl = getAuthServiceUrl();
        window.location.href = `${authServiceUrl}/login?redirect=${encodeURIComponent(currentServiceUrl)}`;
    }, []);

    const redirectToLogin = useCallback(() => {
        // Prevent multiple redirects
        if (isRedirectingToLogin) {
            return;
        }
        isRedirectingToLogin = true;

        const currentUrl = window.location.href;
        const authServiceUrl = getAuthServiceUrl();
        const loginUrl = `${authServiceUrl}/login?redirect=${encodeURIComponent(currentUrl)}`;

        window.location.href = loginUrl;
    }, []);

    const value = {
        user,
        authenticated,
        loading,
        authChecked,
        logout,
        checkAuth,
        redirectToLogin
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

// Custom hook
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

export default AuthContext;

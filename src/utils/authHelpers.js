/**
 * SSO Authentication Helpers
 * Utility functions for SSO authentication operations
 */

/**
 * Returns the auth service (SSO login page) URL — auth frontend, port 3000.
 */
export const getAuthServiceUrl = () => {
    return import.meta.env.VITE_AUTH_URL || 'http://localhost:3000';
};

export const getCurrentServiceUrl = () => {
    return window.location.origin;
};

export const getApiBaseUrl = () => {
    return import.meta.env.VITE_BACKEND_URL || '';
};

export const isProduction = () => {
    return import.meta.env.VITE_ENV === 'production';
};

/**
 * Redirect to SSO login page.
 * The auth service will redirect back to redirectUrl after successful login.
 * @param {string} redirectUrl - Where to return after login (defaults to current app URL)
 */
export const redirectToSSOLogin = (redirectUrl) => {
    const targetUrl = redirectUrl || getCurrentServiceUrl();
    const authServiceUrl = getAuthServiceUrl();

    if (!authServiceUrl) {
        console.error('VITE_AUTH_URL is not set');
        return;
    }

    const loginUrl = `${authServiceUrl}/login?redirect=${encodeURIComponent(targetUrl)}`;
    console.log('[SSO] Redirecting to login:', loginUrl);
    window.location.href = loginUrl;
};

/**
 * Redirect to SSO logout, then return to this app.
 */
export const redirectToSSOLogout = () => {
    const authServiceUrl = getAuthServiceUrl();
    const currentServiceUrl = getCurrentServiceUrl();

    if (!authServiceUrl) {
        console.error('VITE_AUTH_URL is not set');
        return;
    }

    const logoutUrl = `${authServiceUrl}/api/auth/logout?redirect=${encodeURIComponent(currentServiceUrl)}`;
    console.log('[SSO] Redirecting to logout:', logoutUrl);
    window.location.href = logoutUrl;
};

/** Normalize the canonical user shape returned by SSO. */
export const normalizeUserData = (userData = {}) => {
    return {
        userId: userData.userId || null,
        email: userData.email || null,
        name: userData.name || '',
        profileImageUrl: userData.profileImageUrl || '',
        acctId: userData.acctId || null,
        acctNo: userData.acctNo || null,
        role: userData.role || null,
    };
};

/**
 * Log auth events (only in non-production)
 */
export const logAuthEvent = (event, data = {}) => {
    if (!isProduction()) {
        console.log(`[SSO Auth] ${event}:`, data);
    }
};

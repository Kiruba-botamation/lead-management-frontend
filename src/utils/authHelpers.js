/**
 * SSO Authentication Helpers
 * Utility functions for SSO authentication operations
 */

export const getAuthServiceUrl = () => {
    return import.meta.env.VITE_AUTH_SERVICE_URL || 'http://localhost:3001';
};

export const getCurrentServiceUrl = () => {
    return import.meta.env.VITE_CURRENT_SERVICE_URL || window.location.origin;
};

export const getApiBaseUrl = () => {
    const host = import.meta.env.VITE_API_HOST || 'http://localhost';
    const port = import.meta.env.VITE_API_PORT || '';
    return port ? `${host}:${port}` : host;
};

export const isProduction = () => {
    return import.meta.env.VITE_ENV === 'production';
};

/**
 * Redirect to SSO login page
 * @param {string} redirectUrl - Optional URL to return to after login (defaults to current URL)
 */
export const redirectToSSOLogin = (redirectUrl) => {
    const targetUrl = redirectUrl || window.location.href;
    const authServiceUrl = getAuthServiceUrl();
    const loginUrl = `${authServiceUrl}/login?redirect=${encodeURIComponent(targetUrl)}`;
    console.log('Redirecting to SSO login:', loginUrl);
    window.location.href = loginUrl;
};

/**
 * Redirect to SSO logout
 */
export const redirectToSSOLogout = () => {
    const authServiceUrl = getAuthServiceUrl();
    const currentServiceUrl = getCurrentServiceUrl();
    const logoutUrl = `${authServiceUrl}/api/auth/logout?redirect=${encodeURIComponent(currentServiceUrl)}`;
    console.log('Redirecting to SSO logout:', logoutUrl);
    window.location.href = logoutUrl;
};

/**
 * Normalize user data and store in localStorage for quick access
 */
export const normalizeUserData = (userData) => {
    const normalized = {
        userId: userData.userId || userData.id || userData._id || null,
        email: userData.email || null,
        name: userData.name || '',
        profileImageUrl: userData.profileImageUrl || ''
    };

    // Store user info in localStorage for quick access (not tokens!)
    localStorage.setItem('userName', normalized.name);
    localStorage.setItem('userEmail', normalized.email || '');
    localStorage.setItem('userId', normalized.userId || '');

    return normalized;
};

/**
 * Log auth events (only in non-production)
 */
export const logAuthEvent = (event, data = {}) => {
    if (!isProduction()) {
        console.log(`[SSO Auth] ${event}:`, data);
    }
};

/**
 * Account Linking Helpers
 * Utilities for reading/writing the active account from URL, localStorage,
 * and for resolving the active account after SSO login.
 */

// ─── URL Utilities ─────────────────────────────────────────────────────────────

/**
 * Reads the ?acc= query parameter from a URL search string.
 * @param {string} search - window.location.search
 * @returns {string|null}
 */
export const getAcctNoFromUrl = (search = window.location.search) => {
    const params = new URLSearchParams(search);
    return params.get('acc') || null;
};

/**
 * Reads acctNo from localStorage.
 * @returns {string|null}
 */
export const getAcctNoFromLocalStorage = () => {
    return localStorage.getItem('acctNo') || null;
};

/**
 * Reads acctId from localStorage.
 * @returns {string|null}
 */
export const getAcctIdFromLocalStorage = () => {
    return localStorage.getItem('acctId') || null;
};

/**
 * Persists acctNo (and optionally acctId) to localStorage.
 * @param {string} acctNo
 * @param {string} [acctId]
 */
export const setAcctInLocalStorage = (acctNo, acctId) => {
    if (acctNo) localStorage.setItem('acctNo', acctNo);
    if (acctId) localStorage.setItem('acctId', acctId);
};

/**
 * Returns the active acctNo using the resolution priority:
 *   1. ?acc= URL param   (highest)
 *   2. localStorage acctNo
 *   3. null              (no account linked)
 *
 * @param {string} [search] - window.location.search (defaults to current)
 * @returns {string|null}
 */
export const resolveActiveAcctNo = (search = window.location.search) => {
    return getAcctNoFromUrl(search) || getAcctNoFromLocalStorage() || null;
};

/**
 * Updates the browser URL with the ?acc= param without a page reload.
 * @param {string} acctNo
 * @param {Function} navigate - react-router navigate function
 * @param {object} location   - react-router location object
 */
export const updateUrlWithAcctNo = (acctNo, navigate, location) => {
    const params = new URLSearchParams(location.search);
    params.set('acc', acctNo);
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
};

// ─── Account List Utilities ────────────────────────────────────────────────────

/**
 * Deduplicates and normalises an array of account objects returned from the backend.
 * @param {Array} accountsList
 * @returns {Array}
 */
export const cleanupAccounts = (accountsList = []) => {
    const seen = new Set();
    return accountsList.filter((acc) => {
        const key = acc.acctNo || acc.acctId;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

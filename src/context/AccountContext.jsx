import React, {
    createContext,
    useState,
    useEffect,
    useContext,
    useCallback,
    useMemo,
    useRef,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axiosConfig';
import { useAuth, resolveChatbotAdmin } from './AuthContext';
import { NotificationViewport, useNotifications } from '../components/Notifications';
import {
    cleanupAccounts,
    setAcctInLocalStorage,
    updateUrlWithAcctNo,
    resolveActiveAcctNo,
    getAcctNoFromUrl,
} from '../utils/accountHelpers';

const AccountContext = createContext(null);

export const AccountProvider = ({ children }) => {
    const {
        user, userDetails, authenticated, loading: authLoading,
        setChatbotAdmin, setAdminId, setAccessLevel, setAdminResolved,
    } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // ── Account list state ─────────────────────────────────────────────────────
    const [accounts, setAccounts] = useState([]);
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [acctNo, setAcctNo] = useState('');
    const [acctId, setAcctId] = useState('');
    const [acctName, setAcctName] = useState('');

    // ── Loading / status flags ─────────────────────────────────────────────────
    const [accountsLoaded, setAccountsLoaded] = useState(false);
    const [accountsLoading, setAccountsLoading] = useState(false);
    const [isAccountLinked, setIsAccountLinked] = useState(true); // optimistic

    // ── Link-account dialog control ────────────────────────────────────────────
    const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);

    // ── Refresh trigger ────────────────────────────────────────────────────────
    const [accountsRefreshKey, setAccountsRefreshKey] = useState(0);

    // ── Notifications ──────────────────────────────────────────────────────────
    const { showSuccess } = useNotifications();
    const accountsRequestRef = useRef({ generation: 0, controller: null });
    const linkDialogTimerRef = useRef(null);

    // Apply an account object as the selected/active account
    const applySelectedAccount = useCallback((account) => {
        setSelectedAccount(account);
        setAcctNo(account.acctNo || '');
        setAcctId(account.acctId || '');
        setAcctName(account.accountName || '');
        setAcctInLocalStorage(account.acctNo, account.acctId);
    }, []);

    // ── Fetch linked accounts from backend ────────────────────────────────────
    const fetchAccounts = useCallback(async () => {
        const userId = user?.userId || localStorage.getItem('userId');
        if (!userId) return;

        accountsRequestRef.current.controller?.abort();
        const controller = new AbortController();
        const generation = accountsRequestRef.current.generation + 1;
        accountsRequestRef.current = { generation, controller };
        setAccountsLoading(true);

        try {
            const response = await api.get(
                `/api/ui/accounts/user/${userId}`,
                { signal: controller.signal }
            );
            if (generation !== accountsRequestRef.current.generation) return;

            if (
                response.data?.success &&
                Array.isArray(response.data.accounts)
            ) {
                const cleaned = cleanupAccounts(response.data.accounts);
                setAccounts(cleaned);

                if (cleaned.length === 0) {
                    // No linked accounts — trigger link dialog after brief delay
                    setIsAccountLinked(false);
                    setAcctNo('');
                    setAcctId('');
                    setAcctName('');
                    setSelectedAccount(null);
                    clearTimeout(linkDialogTimerRef.current);
                    linkDialogTimerRef.current = setTimeout(() => setIsLinkDialogOpen(true), 400);
                } else {
                    setIsAccountLinked(true);
                    // Resolve active account: URL param → localStorage → first in list
                    const urlAcctNo = getAcctNoFromUrl(location.search);
                    const activeNo = resolveActiveAcctNo(location.search);
                    const active =
                        cleaned.find((a) => a.acctNo === activeNo) || cleaned[0];

                    applySelectedAccount(active);
                    // Always update URL if the ?acc= param is missing or doesn't match
                    if (!urlAcctNo || urlAcctNo !== active.acctNo) {
                        updateUrlWithAcctNo(active.acctNo, navigate, location);
                    }
                }
            } else {
                setIsAccountLinked(false);
            }
        } catch (err) {
            if (controller.signal.aborted || generation !== accountsRequestRef.current.generation) return;
            console.warn('[AccountContext] Failed to fetch accounts:', err.message);
            setIsAccountLinked(false);
            setAcctNo('');
            setAcctId('');
            setAcctName('');
            setSelectedAccount(null);
            clearTimeout(linkDialogTimerRef.current);
            linkDialogTimerRef.current = setTimeout(() => setIsLinkDialogOpen(true), 400);
        } finally {
            if (generation === accountsRequestRef.current.generation) {
                setAccountsLoading(false);
                setAccountsLoaded(true);
            }
        }
    }, [user, location.search, location.pathname, navigate, applySelectedAccount]);

    useEffect(() => () => {
        accountsRequestRef.current.controller?.abort();
        clearTimeout(linkDialogTimerRef.current);
    }, []);

    // Run fetch after SSO auth completes
    useEffect(() => {
        if (!authLoading && authenticated) {
            fetchAccounts();
        }
    }, [authLoading, authenticated, accountsRefreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Resolve the current user's admin identity + access level for this account ──
    // Runs app-wide (every page) once acctId is known, so route guards and the
    // navbar can gate Admin/Settings on accessLevel. Also pushes the user's
    // current email/phone onto their admin record (contact sync).
    useEffect(() => {
        const userId = user?.userId || localStorage.getItem('userId') || '';
        if (!acctId || !userId) return;

        const controller = new AbortController();
        let cancelled = false;
        setAdminResolved(false);
        (async () => {
            const data = await resolveChatbotAdmin(acctId, userId, setChatbotAdmin, setAdminId, controller.signal);
            if (cancelled) return;
            setAccessLevel(data?.accessLevel ?? null);
            setAdminResolved(true);

            // Contact sync — keep email/phone on the admin record current with the profile
            const email = userDetails?.email || localStorage.getItem('userEmail') || '';
            const phone = userDetails?.phone || '';
            if (data && (email || phone)) {
                api.post('/api/ui/admins/contact', { acctId, email, phone }, { signal: controller.signal }).catch(() => { /* non-fatal */ });
            }
        })();

        return () => { cancelled = true; controller.abort(); };
    }, [acctId, user, userDetails]); // eslint-disable-line react-hooks/exhaustive-deps

    // When accounts have loaded but there is no active account, mark the admin
    // lookup resolved (non-admin) so route guards don't hang on the spinner.
    useEffect(() => {
        if (accountsLoaded && !acctId) {
            setAccessLevel(null);
            setAdminResolved(true);
        }
    }, [accountsLoaded, acctId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Re-apply ?acc= param whenever the pathname changes ────────────────────
    // Ensures the acc number stays in the URL when navigating between pages.
    useEffect(() => {
        if (acctNo && !getAcctNoFromUrl(location.search)) {
            updateUrlWithAcctNo(acctNo, navigate, location);
        }
    }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Switch active account ──────────────────────────────────────────────────
    const switchAccount = useCallback((account) => {
        applySelectedAccount(account);
        updateUrlWithAcctNo(account.acctNo, navigate, location);
    }, [applySelectedAccount, navigate, location]);

    // ── Called by LinkAccountDialog after a successful link ────────────────────
    const handleAccountLinked = useCallback((formData) => {
        const account = formData.account;

        if (account.timezone) {
            localStorage.setItem('timezone', account.timezone);
        }

        const newAccount = {
            acctId: account.acctId || '',
            acctNo: account.acctNo,
            accountName: account.accountName || account.name,
            canCreateCalendar: true,
            role: 'Super Admin',
            timezone: account.timezone || '',
        };

        setAccounts((prev) => [...prev, newAccount]);
        applySelectedAccount(newAccount);
        setIsAccountLinked(true);
        setIsLinkDialogOpen(false);
        updateUrlWithAcctNo(newAccount.acctNo, navigate, location);
        setAccountsRefreshKey((k) => k + 1);
        showSuccess('Account linked successfully!');
    }, [applySelectedAccount, navigate, location, showSuccess]);

    const contextValue = useMemo(() => ({
        accounts,
        selectedAccount,
        acctNo,
        acctId,
        acctName,
        accountsLoaded,
        accountsLoading,
        isAccountLinked,
        isLinkDialogOpen,
        setIsLinkDialogOpen,
        fetchAccounts,
        switchAccount,
        handleAccountLinked,
    }), [
        accounts, selectedAccount, acctNo, acctId, acctName, accountsLoaded,
        accountsLoading, isAccountLinked, isLinkDialogOpen, fetchAccounts,
        switchAccount, handleAccountLinked,
    ]);

    return (
        <AccountContext.Provider
            value={contextValue}
        >
            <NotificationViewport />
            {children}
        </AccountContext.Provider>
    );
};

export const useAccount = () => {
    const context = useContext(AccountContext);
    if (!context) {
        throw new Error('useAccount must be used within <AccountProvider>');
    }
    return context;
};

export default AccountContext;

import React, {
    createContext,
    useState,
    useEffect,
    useContext,
    useCallback,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axiosConfig';
import { useAuth } from './AuthContext';
import { useNotifications } from '../components/Notifications';
import {
    cleanupAccounts,
    setAcctInLocalStorage,
    updateUrlWithAcctNo,
    resolveActiveAcctNo,
    getAcctNoFromUrl,
} from '../utils/accountHelpers';

const AccountContext = createContext(null);

export const AccountProvider = ({ children }) => {
    const { user, authenticated, loading: authLoading } = useAuth();
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
    const { showSuccess, NotificationComponent } = useNotifications();

    // ── Fetch linked accounts from backend ────────────────────────────────────
    const fetchAccounts = useCallback(async () => {
        const userId = user?.userId || localStorage.getItem('userId');
        if (!userId) return;

        setAccountsLoading(true);

        try {
            const response = await api.get(
                `/api/accounts/user/${userId}`
            );

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
                    setTimeout(() => setIsLinkDialogOpen(true), 400);
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
            console.warn('[AccountContext] Failed to fetch accounts:', err.message);
            setIsAccountLinked(false);
        } finally {
            setAccountsLoading(false);
            setAccountsLoaded(true);
        }
    }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

    // Apply an account object as the selected/active account
    const applySelectedAccount = (account) => {
        setSelectedAccount(account);
        setAcctNo(account.acctNo || '');
        setAcctId(account.acctId || '');
        setAcctName(account.accountName || '');
        setAcctInLocalStorage(account.acctNo, account.acctId);
    };

    // Run fetch after SSO auth completes
    useEffect(() => {
        if (!authLoading && authenticated) {
            fetchAccounts();
        }
    }, [authLoading, authenticated, accountsRefreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Re-apply ?acc= param whenever the pathname changes ────────────────────
    // Ensures the acc number stays in the URL when navigating between pages.
    useEffect(() => {
        if (acctNo && !getAcctNoFromUrl(location.search)) {
            updateUrlWithAcctNo(acctNo, navigate, location);
        }
    }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Switch active account ──────────────────────────────────────────────────
    const switchAccount = (account) => {
        applySelectedAccount(account);
        updateUrlWithAcctNo(account.acctNo, navigate, location);
    };

    // ── Called by LinkAccountDialog after a successful link ────────────────────
    const handleAccountLinked = (formData) => {
        const account = formData.account;

        if (account.timezone) {
            localStorage.setItem('timezone', account.timezone);
        }

        const newAccount = {
            acctId: account.acctId || `acc_${Date.now()}`,
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
    };

    return (
        <AccountContext.Provider
            value={{
                // State
                accounts,
                selectedAccount,
                acctNo,
                acctId,
                acctName,
                accountsLoaded,
                accountsLoading,
                isAccountLinked,
                // Dialog control
                isLinkDialogOpen,
                setIsLinkDialogOpen,
                // Actions
                fetchAccounts,
                switchAccount,
                handleAccountLinked,
            }}
        >
            <NotificationComponent />
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

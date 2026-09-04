/**
 * AppNavbar
 * Shared top-navigation bar used by every page.
 * Consumes design-system tokens via the Header component family
 * and the Dropdown / DropdownItem components.
 */
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Header,
    HeaderStart,
    HeaderEnd,
    HeaderBrand,
    HeaderNav,
    HeaderNavLink,
} from './ui/Header';
import { Dropdown, DropdownItem, DropdownSeparator } from './ui/Dropdown';
import BrandLogo from './BrandLogo';
import AccountCombobox from './AccountCombobox';
import NotificationBell from './NotificationBell';
import ReminderCalendar from './ReminderCalendar';
import { useAuth } from '../context/AuthContext';
import { useAccount } from '../context/AccountContext';

/* ── Nav link icon helpers ─────────────────────────────────────────── */

const IconVisualize = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
);

const IconLeads = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);

const IconAdmin = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const IconSettings = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const IconProfile = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
);

const IconLogout = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
);

/* ── Main component ────────────────────────────────────────────────── */

/**
 * @param {string}   activePage    – one of: 'visualize' | 'leads' | 'admin' | 'settings' | ''
 * @param {function} onAccountOpen – callback fired when AccountCombobox opens
 *                                   (so sibling dropdowns can close)
 * @param {number}   firedCount    – unread fired-reminder count for the bell badge
 * @param {function} setFiredCount – setter from useReminderStream to reset the badge
 */
export default function AppNavbar({ activePage = '', onAccountOpen, firedCount = 0, setFiredCount }) {
    const navigate = useNavigate();
    const { user, userDetails, logout, accessLevel } = useAuth();
    const isSuperadmin = accessLevel === 'superadmin';
    const isAdmin = accessLevel === 'superadmin' || accessLevel === 'admin';
    const {
        acctNo, acctId, acctName, accounts,
        isAccountLinked, accountsLoaded,
        setIsLinkDialogOpen, switchAccount,
    } = useAccount();

    const [showUserMenu, setShowUserMenu] = useState(false);
    const userMenuRef = useRef(null);

    // Close user menu when clicking outside
    useEffect(() => {
        if (!showUserMenu) return;
        const handler = (e) => {
            if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
                setShowUserMenu(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showUserMenu]);

    const displayName = userDetails?.name || user?.name || user?.email || 'User';
    const email = user?.email || '';
    const imgUrl = userDetails?.profileImageUrl || '';
    const initials = displayName.charAt(0).toUpperCase();

    const userMenuTrigger = (
        <button
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-1-5) var(--space-2)',
                borderRadius: 'var(--radius-lg)',
                background: 'rgba(100, 116, 139, 0.40)',
                border: '1px solid rgba(100, 116, 139, 0.55)',
                cursor: 'pointer',
                color: 'var(--color-white)',
                transition: 'background var(--transition-fast)',
            }}
        >
            {imgUrl
                ? <img src={imgUrl} alt="avatar" loading="lazy" decoding="async"
                    style={{ width: '1.5rem', height: '1.5rem', borderRadius: 'var(--radius-full)', objectFit: 'cover', flexShrink: 0 }} />
                : <div style={{
                    width: '1.5rem', height: '1.5rem',
                    borderRadius: 'var(--radius-full)',
                    background: 'var(--gradient-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)',
                    color: 'var(--color-white)', flexShrink: 0,
                }}>
                    {initials}
                </div>
            }
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)' }}
                className="hidden md:block">
                {displayName}
            </span>
            <svg
                style={{
                    width: '0.75rem', height: '0.75rem',
                    color: 'var(--color-gray-300)',
                    transition: 'transform var(--transition-fast)',
                    transform: showUserMenu ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
        </button>
    );

    return (
        <Header variant="dark" split style={{ flexShrink: 0 }}>
            {/* ── Left: logo + nav links ───────────────────────────── */}
            <HeaderStart>
                <HeaderBrand as="div">
                    <BrandLogo />
                </HeaderBrand>

                <HeaderNav>
                    <HeaderNavLink
                        as="button"
                        active={activePage === 'visualize'}
                        onClick={() => activePage !== 'visualize' && navigate('/analytics')}
                    >
                        <IconVisualize /> Visualize
                    </HeaderNavLink>

                    <HeaderNavLink
                        as="button"
                        active={activePage === 'leads'}
                        onClick={() => activePage !== 'leads' && navigate('/leads')}
                    >
                        <IconLeads /> Leads
                    </HeaderNavLink>

                    {/* Admin tab is visible to any admin level; Settings is superadmin-only */}
                    {isAdmin && (
                        <HeaderNavLink
                            as="button"
                            active={activePage === 'admin'}
                            onClick={() => activePage !== 'admin' && navigate('/admin')}
                        >
                            <IconAdmin /> Admin
                        </HeaderNavLink>
                    )}
                    {isSuperadmin && (
                        <HeaderNavLink
                            as="button"
                            active={activePage === 'settings'}
                            onClick={() => activePage !== 'settings' && navigate('/settings')}
                        >
                            <IconSettings /> Settings
                        </HeaderNavLink>
                    )}
                </HeaderNav>
            </HeaderStart>

            {/* ── Right: calendar + notification bell + account switcher + user menu ── */}
            <HeaderEnd>
                <ReminderCalendar />
                <NotificationBell firedCount={firedCount} setFiredCount={setFiredCount} />

                <AccountCombobox
                    accounts={accounts}
                    acctNo={acctNo}
                    acctName={acctName}
                    isAccountLinked={isAccountLinked}
                    accountsLoaded={accountsLoaded}
                    switchAccount={switchAccount}
                    setIsLinkDialogOpen={setIsLinkDialogOpen}
                    onOpen={() => {
                        setShowUserMenu(false);
                        onAccountOpen?.();
                    }}
                />

                <Dropdown
                    trigger={userMenuTrigger}
                    align="right"
                >
                    {/* Header: name + email */}
                    <div style={{
                        padding: 'var(--space-2) var(--space-3)',
                        borderBottom: '1px solid var(--color-border)',
                    }}>
                        <p style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text)', margin: 0 }}>
                            {displayName}
                        </p>
                        <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-text-subtle)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {email}
                        </p>
                    </div>

                    <DropdownItem
                        icon={<IconProfile />}
                        onClick={() => navigate('/profile')}
                    >
                        My Profile
                    </DropdownItem>

                    <DropdownSeparator />

                    <DropdownItem
                        icon={<IconLogout />}
                        onClick={() => logout()}
                    >
                        Logout
                    </DropdownItem>
                </Dropdown>
            </HeaderEnd>
        </Header>
    );
}

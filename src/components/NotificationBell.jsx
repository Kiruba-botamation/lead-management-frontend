/**
 * NotificationBell
 *
 * Loads 10 fired reminders at a time.
 * Scrolling to the bottom of the list loads the next page.
 * Clicking an item marks it read and navigates to the lead.
 * × dismisses a single item. "Clear all" dismisses all.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate }  from 'react-router-dom';
import { remindersApi } from '../api/remindersApi';
import {
    SOUND_MOODS,
    getSoundSettings,
    saveSoundSettings,
    playNotificationSound,
    unlockNotificationSound,
} from '../utils/notificationSound';

const PAGE_SIZE = 10;

function formatScheduledAt(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('en-IN', {
        day: '2-digit', month: 'short',
        hour: '2-digit', minute: '2-digit', hour12: true,
    });
}

export default function NotificationBell({ firedCount = 0, setFiredCount }) {
    const navigate     = useNavigate();
    // adminId is account_admins._id stored in localStorage by resolveChatbotAdmin.
    // Read once on mount — stable for the component lifetime (re-mounts on account switch).
    const adminId      = localStorage.getItem('adminId') || '';
    const [isOpen,     setIsOpen]     = useState(false);
    const [reminders,  setReminders]  = useState([]);
    const [loading,    setLoading]    = useState(false);
    const [loadingMore,setLoadingMore]= useState(false);
    const [page,       setPage]       = useState(1);
    const [hasMore,    setHasMore]    = useState(false);
    const [soundSettings, setSoundSettings] = useState(getSoundSettings);
    const [soundPanelOpen, setSoundPanelOpen] = useState(false);
    const dropdownRef  = useRef(null);
    const listRef      = useRef(null);

    // Update sound preferences (mute / mood) and persist them. A short preview
    // plays on change (also a user gesture, which unlocks audio for later cues).
    const updateSound = (patch, { preview = false } = {}) => {
        const next = saveSoundSettings(patch);
        setSoundSettings(next);
        if (preview && next.enabled) {
            unlockNotificationSound();
            playNotificationSound(next);
        }
    };

    const unreadCount = reminders.filter(r => !r.notificationRead).length;

    useEffect(() => { setFiredCount?.(unreadCount); }, [unreadCount]); // eslint-disable-line

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen]);

    // Fetch page 1
    const fetchFirst = useCallback(async () => {
        setLoading(true);
        try {
            const res = await remindersApi.getFired(1, PAGE_SIZE, adminId);
            setReminders(res.data?.data || []);
            setHasMore(res.data?.hasMore || false);
            setPage(1);
        } catch { /* non-fatal */ }
        finally { setLoading(false); }
    }, [adminId]);

    // Fetch next page and append
    const fetchMore = useCallback(async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        try {
            const nextPage = page + 1;
            const res = await remindersApi.getFired(nextPage, PAGE_SIZE, adminId);
            setReminders(prev => [...prev, ...(res.data?.data || [])]);
            setHasMore(res.data?.hasMore || false);
            setPage(nextPage);
        } catch { /* non-fatal */ }
        finally { setLoadingMore(false); }
    }, [page, hasMore, loadingMore, adminId]);

    // Infinite scroll — detect when list reaches bottom
    const handleListScroll = useCallback(() => {
        const el = listRef.current;
        if (!el || loadingMore || !hasMore) return;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) fetchMore();
    }, [fetchMore, loadingMore, hasMore]);

    const handleOpen   = () => { setIsOpen(true); fetchFirst(); };
    const handleToggle = () => { if (isOpen) setIsOpen(false); else handleOpen(); };

    // Click item → mark read + navigate
    const handleItemClick = async (rem) => {
        setIsOpen(false);
        navigate(`/leads?openLead=${rem.leadId}&tab=reminders`);
        if (!rem.notificationRead) {
            setReminders(prev => prev.map(r => r._id === rem._id ? { ...r, notificationRead: true } : r));
            try { await remindersApi.markRead([rem._id], adminId); } catch { /* non-fatal */ }
        }
    };

    // × dismiss single item
    const handleDismiss = async (e, rem) => {
        e.stopPropagation();
        setReminders(prev => prev.filter(r => r._id !== rem._id));
        try { await remindersApi.dismissFired(rem._id, adminId); } catch {
            setReminders(prev => [rem, ...prev]);
        }
    };

    // Clear all
    const handleClearAll = async () => {
        const snapshot = reminders;
        setReminders([]);
        setHasMore(false);
        try { await Promise.all(snapshot.map(r => remindersApi.dismissFired(r._id, adminId))); }
        catch { setReminders(snapshot); }
    };

    return (
        <div style={{ position: 'relative' }} ref={dropdownRef}>
            {/* Bell button */}
            <button
                onClick={handleToggle}
                title="Notifications"
                style={{
                    position: 'relative', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', width: '2rem', height: '2rem',
                    borderRadius: 'var(--radius-lg)',
                    background: isOpen ? 'rgba(100,116,139,0.55)' : 'rgba(100,116,139,0.30)',
                    border: '1px solid rgba(100,116,139,0.45)',
                    cursor: 'pointer', color: 'var(--color-white)',
                    transition: 'background var(--transition-fast)', flexShrink: 0,
                }}
            >
                <svg
                    width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    className={firedCount > 0 ? 'animate-bell-swing' : undefined}
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {firedCount > 0 && (
                    <span style={{
                        position: 'absolute', top: '-4px', right: '-4px',
                        minWidth: '1rem', height: '1rem', padding: '0 3px',
                        background: '#ef4444', color: '#fff', fontSize: '9px',
                        fontWeight: 700, borderRadius: '9999px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        lineHeight: 1, boxShadow: '0 0 0 2px rgba(30,41,59,0.7)',
                    }}>
                        {firedCount > 99 ? '99+' : firedCount}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                    width: '22rem', maxWidth: 'calc(100vw - 1rem)',
                    height: '28rem',                   /* fixed height */
                    display: 'flex', flexDirection: 'column',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-xl)',
                    boxShadow: 'var(--shadow-2xl)', zIndex: 9000, overflow: 'hidden',
                }}>
                    {/* Header */}
                    <div style={{
                        padding: 'var(--space-2-5) var(--space-3)',
                        borderBottom: '1px solid var(--color-border)',
                        display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between', flexShrink: 0,
                    }}>
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text)' }}>
                            Reminders
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {unreadCount > 0 && (
                                <span style={{
                                    fontSize: '9px', fontWeight: 700,
                                    color: '#6d28d9', background: '#ede9fe',
                                    borderRadius: '9999px', padding: '1px 7px',
                                }}>
                                    {unreadCount} unread
                                </span>
                            )}
                            {/* Sound settings toggle */}
                            <button
                                onClick={() => setSoundPanelOpen(o => !o)}
                                title="Notification sound"
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    width: '22px', height: '22px', borderRadius: '6px',
                                    border: '1px solid var(--color-border)',
                                    background: soundPanelOpen ? 'var(--color-bg-subtle)' : 'transparent',
                                    color: soundSettings.enabled ? '#6d28d9' : 'var(--color-text-muted)',
                                    cursor: 'pointer', padding: 0,
                                }}
                            >
                                {soundSettings.enabled ? (
                                    <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M11 5L6 9H2v6h4l5 4V5z" />
                                    </svg>
                                ) : (
                                    <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Sound settings panel */}
                    {soundPanelOpen && (
                        <div style={{
                            padding: 'var(--space-2-5) var(--space-3)',
                            borderBottom: '1px solid var(--color-border)',
                            background: 'var(--color-bg-subtle)', flexShrink: 0,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontSize: 'var(--text-2xs)', fontWeight: 600, color: 'var(--color-text)' }}>
                                    Notification sound
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{
                                        fontSize: '10px', fontWeight: 700,
                                        color: soundSettings.enabled ? '#15803d' : '#b91c1c',
                                    }}>
                                        {soundSettings.enabled ? 'On' : 'Off'}
                                    </span>
                                    {/* Toggle switch — makes "you can turn this off" visually obvious */}
                                    <button
                                        role="switch"
                                        aria-checked={soundSettings.enabled}
                                        aria-label="Toggle notification sound"
                                        title={soundSettings.enabled ? 'Sound on — click to mute' : 'Sound off — click to enable'}
                                        onClick={() => updateSound({ enabled: !soundSettings.enabled }, { preview: !soundSettings.enabled })}
                                        style={{
                                            position: 'relative', width: '38px', height: '20px',
                                            borderRadius: '9999px', cursor: 'pointer', padding: 0,
                                            border: 'none', flexShrink: 0,
                                            background: soundSettings.enabled ? '#7c3aed' : '#cbd5e1',
                                            transition: 'background var(--transition-fast)',
                                        }}
                                    >
                                        <span style={{
                                            position: 'absolute', top: '2px',
                                            left: soundSettings.enabled ? '20px' : '2px',
                                            width: '16px', height: '16px', borderRadius: '50%',
                                            background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.35)',
                                            transition: 'left var(--transition-fast)',
                                        }} />
                                    </button>
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', opacity: soundSettings.enabled ? 1 : 0.45, pointerEvents: soundSettings.enabled ? 'auto' : 'none' }}>
                                {SOUND_MOODS.map(m => {
                                    const active = soundSettings.mood === m.id;
                                    return (
                                        <button
                                            key={m.id}
                                            onClick={() => updateSound({ mood: m.id }, { preview: true })}
                                            title={`Preview ${m.label}`}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: '4px',
                                                fontSize: '10px', fontWeight: 600, padding: '3px 8px',
                                                borderRadius: '8px', cursor: 'pointer',
                                                border: `1px solid ${active ? '#7c3aed' : 'var(--color-border)'}`,
                                                background: active ? '#ede9fe' : 'var(--color-surface)',
                                                color: active ? '#6d28d9' : 'var(--color-text)',
                                            }}
                                        >
                                            <span>{m.emoji}</span>{m.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <p style={{ margin: '7px 0 0', fontSize: '9px', color: 'var(--color-text-muted)' }}>
                                Pick a tone to preview it. Turn sound off to silence alerts — the unread count and bell still show.
                            </p>
                        </div>
                    )}

                    {/* Scrollable list */}
                    <div
                        ref={listRef}
                        onScroll={handleListScroll}
                        style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}
                    >
                        {loading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '1.5rem' }}>
                                <div className="animate-spin rounded-full h-5 w-5 border-2 border-violet-500 border-t-transparent" />
                            </div>
                        ) : reminders.length === 0 ? (
                            <div style={{ padding: 'var(--space-6) var(--space-4)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
                                <svg style={{ width: '2rem', height: '2rem', opacity: 0.3, margin: '0 auto 0.5rem' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                                All caught up
                            </div>
                        ) : (
                            <>
                                {reminders.map((rem) => {
                                    const isUnread = !rem.notificationRead;
                                    return (
                                        <div
                                            key={rem._id}
                                            onClick={() => handleItemClick(rem)}
                                            style={{
                                                position: 'relative',
                                                padding: 'var(--space-2-5) var(--space-3)',
                                                paddingRight: '2rem',
                                                borderBottom: '1px solid var(--color-border)',
                                                cursor: 'pointer',
                                                background: isUnread ? 'rgba(109,40,217,0.03)' : 'transparent',
                                                transition: 'background var(--transition-fast)',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-subtle)'}
                                            onMouseLeave={e => e.currentTarget.style.background = isUnread ? 'rgba(109,40,217,0.03)' : 'transparent'}
                                        >
                                            {/* × dismiss */}
                                            <button
                                                onClick={(e) => handleDismiss(e, rem)}
                                                title="Remove"
                                                style={{
                                                    position: 'absolute', top: '8px', right: '8px',
                                                    width: '16px', height: '16px',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    background: 'none', border: 'none', cursor: 'pointer',
                                                    color: 'var(--color-text-muted)', borderRadius: '3px', padding: 0,
                                                }}
                                                onMouseEnter={e => { e.stopPropagation(); e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.background = '#fee2e2'; }}
                                                onMouseLeave={e => { e.stopPropagation(); e.currentTarget.style.color = 'var(--color-text-muted)'; e.currentTarget.style.background = 'none'; }}
                                            >
                                                <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>

                                            {/* Badge + time */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1-5)', marginBottom: 'var(--space-1)' }}>
                                                <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6d28d9', background: '#ede9fe', borderRadius: '4px', padding: '1px 5px', flexShrink: 0 }}>
                                                    Reminder
                                                </span>
                                                <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)' }}>
                                                    {formatScheduledAt(rem.scheduledAt)}
                                                </span>
                                                {rem.collectionName && (
                                                    <span
                                                        style={{
                                                            fontSize: '9px', fontWeight: 700, color: '#0369a1',
                                                            background: '#e0f2fe', border: '1px solid #bae6fd',
                                                            borderRadius: '9999px', padding: '1px 6px', flexShrink: 0,
                                                            maxWidth: '45%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                        }}
                                                        title={`Collection: ${rem.collectionName}`}
                                                    >
                                                        {rem.collectionName}
                                                    </span>
                                                )}
                                                {isUnread && (
                                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#7c3aed', flexShrink: 0, marginLeft: 'auto' }} />
                                                )}
                                            </div>

                                            {rem.leadSnapshot?.name && (
                                                <p style={{ margin: '0 0 2px', fontSize: 'var(--text-xs)', fontWeight: isUnread ? 'var(--font-semibold)' : 'var(--font-normal)', color: 'var(--color-text)' }}>
                                                    {rem.leadSnapshot.name}
                                                </p>
                                            )}
                                            {rem.leadSnapshot?.phone && (
                                                <p style={{ margin: '0 0 2px', fontSize: 'var(--text-2xs)', color: 'var(--color-text-subtle)' }}>
                                                    {rem.leadSnapshot.phone}
                                                </p>
                                            )}
                                            <p style={{
                                                margin: 0, fontSize: 'var(--text-xs)',
                                                fontWeight: isUnread ? 'var(--font-medium)' : 'var(--font-normal)',
                                                color: isUnread ? 'var(--color-gray-700)' : 'var(--color-gray-500)',
                                                overflow: 'hidden', display: '-webkit-box',
                                                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                            }}>
                                                {rem.description}
                                            </p>
                                            <p style={{ margin: '3px 0 0', fontSize: '10px', color: '#7c3aed', fontWeight: 500 }}>
                                                Open lead →
                                            </p>
                                        </div>
                                    );
                                })}

                                {/* Load more spinner */}
                                {loadingMore && (
                                    <div style={{ display: 'flex', justifyContent: 'center', padding: '0.75rem' }}>
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-violet-400 border-t-transparent" />
                                    </div>
                                )}

                                {/* End of list indicator */}
                                {!hasMore && reminders.length > PAGE_SIZE && (
                                    <p style={{ textAlign: 'center', fontSize: 'var(--text-2xs)', color: 'var(--color-text-muted)', padding: 'var(--space-2)' }}>
                                        No more notifications
                                    </p>
                                )}
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    {reminders.length > 0 && (
                        <div style={{
                            padding: 'var(--space-2) var(--space-3)',
                            borderTop: '1px solid var(--color-border)',
                            flexShrink: 0, background: 'var(--color-bg-subtle)',
                            display: 'flex', justifyContent: 'flex-end',
                        }}>
                            <button onClick={handleClearAll} className="btn btn--secondary btn--scheme-danger btn--sm">
                                Clear all
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

import React, { useState, useRef, useEffect, useCallback } from 'react';
import api from '../api/axiosConfig';
import UITooltip from './Tooltip';

const STORAGE_KEY_PREFIX = 'ai_chat_session_';
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── Sparkle icon ─────────────────────────────────────────────────────────────
const SparkleIcon = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l2.4 7.2L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z" fill="currentColor" stroke="none" opacity="0.9" />
        <path d="M5 3l.8 2.2L8 6l-2.2.8L5 9l-.8-2.2L2 6l2.2-.8L5 3z" fill="currentColor" stroke="none" opacity="0.6" />
        <path d="M19 15l.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6.6-1.8z" fill="currentColor" stroke="none" opacity="0.5" />
    </svg>
);

// ── Chart type icon map ───────────────────────────────────────────────────────
const chartTypeIcons = {
    pie: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.21 15.89A10 10 0 118 2.83" /><path d="M22 12A10 10 0 0012 2v10z" />
        </svg>
    ),
    bar: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="12" width="4" height="9" rx="1" /><rect x="10" y="6" width="4" height="15" rx="1" /><rect x="17" y="2" width="4" height="19" rx="1" />
        </svg>
    ),
    line: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="22 12 18 8 14 12 10 8 6 12 2 8" />
        </svg>
    ),
    heatmap: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
    ),
    number: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 12h10M12 7v10" /><circle cx="12" cy="12" r="9" />
        </svg>
    ),
};

// ── Typing indicator ──────────────────────────────────────────────────────────
const TypingIndicator = () => (
    <div className="flex items-end gap-2 mb-3">
        <div
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}
        >
            <SparkleIcon className="w-3.5 h-3.5 text-white" />
        </div>
        <div
            className="px-4 py-3 rounded-2xl rounded-bl-sm"
            style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)' }}
        >
            <div className="flex gap-1 items-center h-4">
                {[0, 1, 2].map(i => (
                    <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                            background: 'var(--color-text-muted)',
                            animation: `aiChatBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
                        }}
                    />
                ))}
            </div>
        </div>
    </div>
);

// ── Chart preview card ────────────────────────────────────────────────────────
const ChartPreviewCard = ({ chart, index, onAdd, added }) => {
    const chartIcon = chartTypeIcons[chart.chartType?.value] || chartTypeIcons.bar;
    const category = chart.chartCategory?.categoryName || 'All';
    const preset = chart._datePreset || 'thismonth';
    const isEdit = chart.editChartId != null;
    const presetLabels = {
        today: 'Today', yesterday: 'Yesterday', thisweek: 'This Week',
        lastweek: 'Last Week', thismonth: 'This Month', lastmonth: 'Last Month',
        alltime: 'All Time', last_n: `Last ${chart._lastNDays || '?'} Days`,
        custom: chart.dateFilterFrom ? `${chart.dateFilterFrom} → ${chart.dateFilterTo}` : 'Custom',
    };
    const xLabel = chart.xAxis?.label || chart.xAxis?.value || '—';
    const yLabel = chart.yAxis?.label || chart.yAxis?.value || '—';
    const aggLabel = chart.aggregation?.label || chart.aggregation?.value || '—';

    return (
        <div
            className="rounded-xl overflow-hidden transition-all duration-200"
            style={{
                border: added
                    ? '1.5px solid var(--color-success)'
                    : isEdit
                        ? '1.5px solid #f59e0b'
                        : '1px solid var(--color-border)',
                background: added ? 'rgba(5, 150, 105, 0.04)' : 'var(--color-surface)',
                opacity: added ? 0.8 : 1,
            }}
        >
            {/* Card header */}
            <div
                className="flex items-center gap-2 px-3 py-2.5"
                style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-subtle)' }}
            >
                <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #4f46e544, #7c3aed33)', color: '#4f46e5' }}
                >
                    {chartIcon}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold truncate" style={{ color: 'var(--color-text)' }}>
                            {chart.chartName || `Chart ${index + 1}`}
                        </p>
                        {isEdit && (
                            <span
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                                style={{ background: '#fef3c7', color: '#92400e' }}
                            >
                                EDIT
                            </span>
                        )}
                    </div>
                    <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                        {chart.chartType?.label} · {category}
                    </p>
                </div>
            </div>

            {/* Card body */}
            <div className="px-3 py-2 space-y-1">
                <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--color-text-subtle)' }}>
                    <span className="font-medium" style={{ color: 'var(--color-text)' }}>X:</span>
                    <span>{xLabel}</span>
                    <span className="mx-1">·</span>
                    <span className="font-medium" style={{ color: 'var(--color-text)' }}>Y:</span>
                    <span>{yLabel}</span>
                    <span className="mx-1">·</span>
                    <span>{aggLabel}</span>
                </div>
                <div className="text-[11px]" style={{ color: 'var(--color-text-subtle)' }}>
                    <span
                        className="inline-block px-1.5 py-0.5 rounded-md text-[10px] font-medium"
                        style={{ background: '#4f46e510', color: '#4f46e5' }}
                    >
                        {presetLabels[preset] || preset}
                    </span>
                </div>
            </div>

            {/* Add/Apply button */}
            <div className="px-3 pb-3">
                <button
                    onClick={() => !added && onAdd(chart)}
                    disabled={added}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200"
                    style={added ? {
                        background: 'rgba(5, 150, 105, 0.1)',
                        color: 'var(--color-success)',
                        cursor: 'default',
                    } : {
                        background: 'linear-gradient(to right, #4f46e5, #7c3aed)',
                        color: 'white',
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)',
                    }}
                >
                    {added ? (
                        <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                            {isEdit ? 'Applied' : 'Added to Dashboard'}
                        </>
                    ) : (
                        <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {isEdit
                                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                }
                            </svg>
                            {isEdit ? 'Apply Changes' : 'Add to Dashboard'}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

// ── Message bubble ────────────────────────────────────────────────────────────
const MessageBubble = ({ msg, onAddChart, addedChartIds, onRetry }) => {
    const isUser = msg.role === 'user';
    const isAI = msg.role === 'assistant';

    if (isUser) {
        return (
            <div className="flex justify-end mb-3">
                <div
                    className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-sm text-sm"
                    style={{
                        background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                        color: 'white',
                        wordBreak: 'break-word',
                    }}
                >
                    {msg.text}
                </div>
            </div>
        );
    }

    if (isAI) {
        return (
            <div className="flex items-start gap-2 mb-3">
                {/* AI avatar */}
                <div
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}
                >
                    <SparkleIcon className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                    {/* Message text — hidden for error messages (they get their own styled box) */}
                    {!msg.error && (
                        <div
                            className="inline-block max-w-full px-4 py-2.5 rounded-2xl rounded-tl-sm text-sm mb-2"
                            style={{
                                background: 'var(--color-bg-subtle)',
                                border: '1px solid var(--color-border)',
                                color: 'var(--color-text)',
                                wordBreak: 'break-word',
                                whiteSpace: 'pre-wrap',
                            }}
                        >
                            {msg.text}
                        </div>
                    )}

                    {/* Quick reply pills */}
                    {msg.quickReplies?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {msg.quickReplies.map((reply, i) => (
                                <button
                                    key={i}
                                    onClick={() => msg.onQuickReply?.(reply)}
                                    disabled={msg.quickRepliesUsed}
                                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150"
                                    style={msg.quickRepliesUsed ? {
                                        border: '1px solid var(--color-border)',
                                        color: 'var(--color-text-muted)',
                                        cursor: 'default',
                                        background: 'transparent',
                                    } : {
                                        border: '1px solid var(--color-interactive)',
                                        color: 'var(--color-interactive)',
                                        background: 'transparent',
                                        cursor: 'pointer',
                                    }}
                                    onMouseEnter={e => {
                                        if (!msg.quickRepliesUsed) {
                                            e.currentTarget.style.background = 'var(--color-interactive)';
                                            e.currentTarget.style.color = 'white';
                                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(79,70,229,0.3)';
                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                        }
                                    }}
                                    onMouseLeave={e => {
                                        if (!msg.quickRepliesUsed) {
                                            e.currentTarget.style.background = 'transparent';
                                            e.currentTarget.style.color = 'var(--color-interactive)';
                                            e.currentTarget.style.boxShadow = 'none';
                                            e.currentTarget.style.transform = 'translateY(0)';
                                        }
                                    }}
                                >
                                    {reply}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Chart preview cards */}
                    {msg.charts?.length > 0 && (
                        <div className="space-y-2 mt-1">
                            {msg.charts.map((chart, i) => (
                                <ChartPreviewCard
                                    key={`${msg.id}-chart-${i}`}
                                    chart={chart}
                                    index={i}
                                    onAdd={onAddChart}
                                    added={addedChartIds.has(`${msg.id}-${i}`)}
                                />
                            ))}
                            {msg.charts.length > 1 && (() => {
                                const allAdded = msg.charts.every((_, i) => addedChartIds.has(`${msg.id}-${i}`));
                                return (
                                    <button
                                        onClick={() => msg.charts.forEach((c, i) => {
                                            if (!addedChartIds.has(`${msg.id}-${i}`)) onAddChart(c, msg.id, i);
                                        })}
                                        disabled={allAdded}
                                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 mt-1"
                                        style={allAdded ? {
                                            border: '1px solid var(--color-border)',
                                            color: 'var(--color-text-muted)',
                                            background: 'transparent',
                                            cursor: 'default',
                                            opacity: 0.5,
                                        } : {
                                            border: '1px solid var(--color-interactive)',
                                            color: 'var(--color-interactive)',
                                            background: 'transparent',
                                        }}
                                    >
                                        {allAdded ? (
                                            <>
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                                All {msg.charts.length} Charts Added
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                </svg>
                                                Add All {msg.charts.length} Charts
                                            </>
                                        )}
                                    </button>
                                );
                            })()}
                        </div>
                    )}

                    {/* Error state with retry */}
                    {msg.error && (
                        <div
                            className="px-3 py-2.5 rounded-xl text-xs"
                            style={{ background: 'rgba(220, 38, 38, 0.06)', border: '1px solid rgba(220, 38, 38, 0.18)' }}
                        >
                            <p style={{ color: 'var(--color-danger)' }}>{msg.text}</p>
                            {onRetry && (
                                <button
                                    onClick={onRetry}
                                    className="mt-2 flex items-center gap-1 text-[11px] font-semibold transition-opacity hover:opacity-80"
                                    style={{ color: 'var(--color-danger)' }}
                                >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Try Again
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return null;
};

// ── Resume prompt banner ──────────────────────────────────────────────────────
const ResumePrompt = ({ onContinue, onStartFresh, messageCount, ago }) => (
    <div
        className="mx-4 mt-4 rounded-xl p-3 flex flex-col gap-2.5"
        style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)' }}
    >
        <div className="flex items-start gap-2">
            <div
                className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{ background: 'linear-gradient(135deg, #4f46e544, #7c3aed33)', color: '#4f46e5' }}
            >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
            </div>
            <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>
                    Previous conversation found
                </p>
                <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    {messageCount} message{messageCount !== 1 ? 's' : ''} · {ago}
                </p>
            </div>
        </div>
        <div className="flex gap-2">
            <button
                onClick={onContinue}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
                style={{
                    background: 'linear-gradient(to right, #4f46e5, #7c3aed)',
                    color: 'white',
                    boxShadow: '0 2px 8px rgba(79,70,229,0.25)',
                }}
            >
                Continue
            </button>
            <button
                onClick={onStartFresh}
                className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150"
                style={{
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-muted)',
                    background: 'transparent',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-subtle)'; e.currentTarget.style.color = 'var(--color-text)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-muted)'; }}
            >
                Start Fresh
            </button>
        </div>
    </div>
);

// ── localStorage helpers ──────────────────────────────────────────────────────
function saveSession(acctId, messages, history) {
    try {
        const serialisable = messages.map(m => ({ ...m, onQuickReply: undefined }));
        localStorage.setItem(
            `${STORAGE_KEY_PREFIX}${acctId}`,
            JSON.stringify({ messages: serialisable, history, savedAt: Date.now() })
        );
    } catch (_) { /* storage full or unavailable — fail silently */ }
}

function loadSession(acctId) {
    try {
        const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${acctId}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.savedAt || Date.now() - parsed.savedAt > SESSION_TTL_MS) {
            localStorage.removeItem(`${STORAGE_KEY_PREFIX}${acctId}`);
            return null;
        }
        return parsed;
    } catch (_) { return null; }
}

function clearSession(acctId) {
    try { localStorage.removeItem(`${STORAGE_KEY_PREFIX}${acctId}`); } catch (_) { }
}

function formatAgo(savedAt) {
    const diff = Math.floor((Date.now() - savedAt) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    return `${Math.floor(diff / 3600)} hr ago`;
}

// ── Edit intent detection ─────────────────────────────────────────────────────
// Returns { chartId, chartName } if the message clearly targets one existing chart,
// or null if it doesn't look like an edit / is ambiguous.
function detectEditIntent(msgText, currentCharts) {
    if (!currentCharts?.length) return null;
    const EDIT_KEYWORDS = /\b(change|update|modify|convert|turn|make|set|rename|edit|switch|fix|transform|replace|adjust|alter)\b/i;
    if (!EDIT_KEYWORDS.test(msgText)) return null;

    const lower = msgText.toLowerCase();

    // ── Edge case: only one chart on the dashboard ────────────────────────────
    if (currentCharts.length === 1) {
        return { chartId: currentCharts[0].id, chartName: currentCharts[0].chartName };
    }

    // ── Strategy 1: match by chart type mention ──────────────────────────────
    // e.g. "change the pie chart to number" → find the pie chart
    const TYPE_MENTIONS = {
        pie: ['pie'],
        bar: ['bar'],
        line: ['line'],
        number: ['number', 'kpi', 'metric'],
        heatmap: ['heatmap', 'heat map', 'heat-map'],
    };
    for (const [typeValue, aliases] of Object.entries(TYPE_MENTIONS)) {
        if (aliases.some(alias => lower.includes(alias))) {
            const matches = currentCharts.filter(c => c.chartType?.value === typeValue);
            if (matches.length === 1) {
                return { chartId: matches[0].id, chartName: matches[0].chartName };
            }
            // Multiple charts of the same type — fall through to name matching
        }
    }

    // ── Strategy 2: match by chart name words ────────────────────────────────
    const scored = currentCharts.map(c => {
        const name = (c.chartName || '').toLowerCase();
        const words = name.split(/\s+/).filter(w => w.length > 3);
        if (!words.length) return { chart: c, score: 0 };
        const matchCount = words.filter(w => lower.includes(w)).length;
        const score = matchCount / words.length; // fraction of name-words found in message
        return { chart: c, score };
    }).filter(s => s.score > 0);

    if (scored.length === 0) return null;
    scored.sort((a, b) => b.score - a.score);

    // Only inject hint if top match is unambiguous (score ≥ 0.5 and clearly ahead of runner-up)
    const best = scored[0];
    const runnerUp = scored[1];
    if (best.score < 0.5) return null;
    if (runnerUp && best.score - runnerUp.score < 0.3) return null; // ambiguous

    return { chartId: best.chart.id, chartName: best.chart.chartName };
}

// ── Main AiAnalyticsChat component ────────────────────────────────────────────
/**
 * @param {{ isOpen: boolean, onClose: () => void, acctId: string, currentCharts: object[], onAddCharts: (charts: object[]) => void }} props
 */
const AiAnalyticsChat = ({ isOpen, onClose, acctId, categories = [], currentCharts = [], onAddCharts }) => {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [addedChartIds, setAddedChartIds] = useState(new Set());
    const [resumeSession, setResumeSession] = useState(null); // { messages, history, savedAt }
    const [categoryFields, setCategoryFields] = useState({}); // { [categoryId]: ['field1', ...] }
    const messageIdRef = useRef(0);
    const scrollRef = useRef(null);
    const inputRef = useRef(null);
    const historyRef = useRef([]);
    const lastUserMessageRef = useRef(''); // for retry

    // Fetch fields for all categories to use in welcome message examples
    useEffect(() => {
        if (!acctId || categories.length === 0) return;
        // Fetch fields per category using the new category fields endpoint
        Promise.all(
            categories.map(cat =>
                api.get(`/api/ui/leads/categories/${cat._id}/fields`, { params: { acctId } })
                    .then(res => ({ categoryId: cat._id, fields: res.data?.data?.fields || [] }))
                    .catch(() => ({ categoryId: cat._id, fields: [] }))
            )
        ).then(results => {
            const fields = {};
            results.forEach(({ categoryId, fields: catFields }) => {
                // Store labels (human-readable) for welcome message
                fields[categoryId] = catFields.map(f => f.label).filter(Boolean);
            });
            setCategoryFields(fields);
        });
    }, [acctId, categories]); // eslint-disable-line react-hooks/exhaustive-deps

    // Lock body scroll when panel is open to prevent double scrollbar
    useEffect(() => {
        document.body.style.overflow = isOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [isOpen]);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    // Focus input when panel opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 150);
        }
    }, [isOpen]);

    // On open: check for a saved session to resume
    useEffect(() => {
        if (!isOpen || !acctId) return;
        if (messages.length > 0 || resumeSession) return; // already initialised

        const saved = loadSession(acctId);
        if (saved?.messages?.some(m => m.role === 'user')) {
            setResumeSession(saved);
        } else {
            showWelcome();
        }
    }, [isOpen, acctId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Re-render the welcome message with category context once categories/fields arrive
    useEffect(() => {
        if (!isOpen || categories.length === 0) return;
        // Only update if we're still showing just the initial welcome (no user interaction yet)
        if (messages.length === 1 && messages[0].role === 'assistant' && !resumeSession) {
            showWelcome();
        }
    }, [categories, categoryFields]); // eslint-disable-line react-hooks/exhaustive-deps

    // Save session to localStorage whenever messages change
    useEffect(() => {
        if (!acctId || messages.length === 0) return;
        saveSession(acctId, messages, historyRef.current);
    }, [messages, acctId]);

    const showWelcome = () => {
        const welcomeId = ++messageIdRef.current;

        let text;
        let quickReplies;

        if (categories && categories.length > 0) {
            const names = categories.map(c => c.categoryName);
            const primary = names[0];
            const primaryId = categories[0]._id;
            const second = names[1] || names[0];

            // categoryFields now stores labels directly (no conversion needed)
            const primaryLabels = (categoryFields[primaryId] || []).filter(Boolean);
            const field1 = primaryLabels[0] || null;
            const field2 = primaryLabels[1] || null;

            // Build example bullets using real field labels where available
            const bullets = [
                `"Show me daily ${primary} leads this month"`,
                field1
                    ? `"Breakdown of ${primary} leads by ${field1}"`
                    : `"Breakdown of ${second} leads over the last 7 days"`,
                field2
                    ? `"How many ${primary} leads per ${field2}?"`
                    : names.length > 1
                        ? `"Compare ${primary} vs ${second} leads this week"`
                        : `"Top performing days for ${primary} leads"`,
            ];

            text = `Hi! I'm your AI analytics assistant.\n\nI can see you have ${
                names.length === 1
                    ? `**${primary}**`
                    : names.map(n => `**${n}**`).join(', ')
            } categor${names.length === 1 ? 'y' : 'ies'} set up. Here are some things you can ask:\n\n${bullets.map(b => `• ${b}`).join('\n')}`;

            quickReplies = [
                `Daily ${primary} trend`,
                field1 ? `${primary} leads by ${field1}` : `${primary} leads this month`,
                field2 ? `${primary} leads by ${field2}` : names.length > 1 ? `${second} leads trend` : `${primary} leads this week`,
                names.length > 1 ? `Compare ${primary} vs ${second}` : `Top days for ${primary}`,
            ];
        } else {
            text = "Hi! I'm your AI analytics assistant. Tell me what you'd like to visualize — for example:\n\n• \"Show me daily leads this month\"\n• \"Breakdown of leads by status\"\n• \"How many leads per trainer?\"";
            quickReplies = ['Daily leads trend', 'Leads by status', 'Leads by trainer', 'Top lead sources'];
        }

        setMessages([{
            id: welcomeId,
            role: 'assistant',
            text,
            quickReplies,
            onQuickReply: (reply) => sendMessage(reply),
        }]);
    };

    const handleContinueSession = () => {
        if (!resumeSession) return;
        const restored = resumeSession.messages.map(m => ({
            ...m,
            onQuickReply: m.quickReplies?.length && !m.quickRepliesUsed
                ? (reply) => sendMessage(reply)
                : undefined,
        }));
        const maxId = Math.max(...restored.map(m => m.id || 0), 0);
        messageIdRef.current = maxId;
        historyRef.current = resumeSession.history || [];
        setMessages(restored);
        setResumeSession(null);
    };

    const handleStartFresh = () => {
        clearSession(acctId);
        setResumeSession(null);
        historyRef.current = [];
        messageIdRef.current = 0;
        setAddedChartIds(new Set());
        setMessages([]);
        setTimeout(() => showWelcome(), 0);
    };

    const nextMsgId = () => ++messageIdRef.current;

    const sendMessage = useCallback(async (text) => {
        const msgText = (typeof text === 'string' ? text : input).trim();
        if (!msgText || loading) return;

        setInput('');
        lastUserMessageRef.current = msgText; // save for retry

        // Mark all existing quick reply groups as used
        setMessages(prev => prev.map(m => ({ ...m, quickRepliesUsed: true })));

        const userMsgId = nextMsgId();
        setMessages(prev => [...prev, { id: userMsgId, role: 'user', text: msgText }]);

        setLoading(true);

        try {
            // Summarise current charts for context (strip heavy/irrelevant fields)
            const chartContext = currentCharts.map(c => ({
                id: c.id,
                chartName: c.chartName,
                chartType: c.chartType,
                xAxis: c.xAxis,
                yAxis: c.yAxis,
                aggregation: c.aggregation,
                _datePreset: c._datePreset,
                chartCategory: c.chartCategory,
                chartWidth: c.chartWidth,
                chartHeight: c.chartHeight,
                showLegend: c.showLegend,
                showDataLabels: c.showDataLabels,
                barOrientation: c.barOrientation,
                dateGranularity: c.dateGranularity,
            }));

            // Client-side edit intent detection — inject a hint so Gemini sets editChartId correctly
            const editHint = detectEditIntent(msgText, currentCharts);
            const messageToSend = editHint
                ? `${msgText}\n\n[SYSTEM HINT: The user appears to be editing the existing chart named "${editHint.chartName}" (id: ${editHint.chartId}). You MUST set editChartId: ${editHint.chartId} in your response.]`
                : msgText;

            const response = await api.post('/api/ui/analytics/ai/chat', {
                message: messageToSend,
                history: historyRef.current,
                acctId,
                currentCharts: chartContext,
            });

            const data = response.data?.data;
            if (!data) throw new Error('Empty response from AI service');

            historyRef.current = [
                ...historyRef.current,
                { role: 'user', text: msgText },
                { role: 'assistant', text: data.message },
            ];

            const aiMsgId = nextMsgId();

            if (data.type === 'followUp') {
                setMessages(prev => [...prev, {
                    id: aiMsgId,
                    role: 'assistant',
                    text: data.message,
                    quickReplies: data.quickReplies || [],
                    quickRepliesUsed: false,
                    onQuickReply: (reply) => sendMessage(reply),
                }]);
            } else if (data.type === 'charts') {
                // Client-side edit detection fallback — if AI forgot to set editChartId
                // but returned a chart whose name matches (or is contained within) an existing dashboard chart, treat it as an edit.
                const resolvedCharts = (data.charts || []).map(chart => {
                    if (chart.editChartId != null) return chart; // AI already set it
                    const aiName = (chart.chartName || '').toLowerCase().trim();
                    const match = currentCharts.find(existing => {
                        const existingName = (existing.chartName || '').toLowerCase().trim();
                        if (!existingName || !aiName) return false;
                        // Exact match
                        if (existingName === aiName) return true;
                        // Word-level: all significant words of the existing name appear in the AI name
                        const words = existingName.split(/\s+/).filter(w => w.length > 3);
                        return words.length > 0 && words.every(w => aiName.includes(w));
                    });
                    return match ? { ...chart, editChartId: match.id } : chart;
                });
                setMessages(prev => [...prev, {
                    id: aiMsgId,
                    role: 'assistant',
                    text: data.message,
                    charts: resolvedCharts,
                }]);
            } else {
                throw new Error('Unexpected response type from AI');
            }
        } catch (err) {
            console.error('[AiAnalyticsChat] Error:', err);
            const errMsgId = nextMsgId();
            const errText = err.response?.data?.message || 'Something went wrong. Please try again.';
            setMessages(prev => [...prev, {
                id: errMsgId,
                role: 'assistant',
                text: errText,
                error: true,
            }]);
        } finally {
            setLoading(false);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [input, loading, acctId, currentCharts]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleAddChart = useCallback((chart, msgId, chartIdx) => {
        const key = msgId !== undefined ? `${msgId}-${chartIdx}` : null;
        if (key) {
            setAddedChartIds(prev => {
                const next = new Set(prev);
                next.add(key);
                return next;
            });
        }
        onAddCharts([chart]);
    }, [onAddCharts]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    // Close without resetting — conversation persists in memory + localStorage
    const handleClose = () => onClose();

    return (
        <>
            {/* ── Backdrop ── */}
            <div
                onClick={handleClose}
                className="fixed inset-0 z-[240] transition-opacity duration-300"
                style={{
                    background: 'rgba(0,0,0,0.25)',
                    backdropFilter: 'blur(2px)',
                    opacity: isOpen ? 1 : 0,
                    pointerEvents: isOpen ? 'auto' : 'none',
                }}
            />

            {/* ── Slide-in Panel ── */}
            <div
                className="fixed top-0 right-0 h-full z-[250] flex flex-col"
                style={{
                    width: 400,
                    maxWidth: '100vw',
                    background: 'var(--color-surface)',
                    borderLeft: '1px solid var(--color-border)',
                    boxShadow: '-8px 0 32px rgba(0,0,0,0.12)',
                    transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
                    transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
            >
                {/* ── Header ── */}
                <div
                    className="flex items-center gap-3 px-4 py-3.5 flex-shrink-0"
                    style={{
                        borderBottom: '1px solid var(--color-border)',
                        background: 'linear-gradient(135deg, #4f46e508, #7c3aed08)',
                    }}
                >
                    <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}
                    >
                        <SparkleIcon className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                            AI Analytics Assistant
                        </h2>
                        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                            Create or edit charts with natural language
                        </p>
                    </div>
                    <div className="flex items-center gap-1">
                        {messages.length > 0 && (
                            <UITooltip content="Clear conversation" placement="bottom">
                                <button
                                    onClick={handleStartFresh}
                                    className="group relative w-8 h-8 flex items-center justify-center bg-transparent rounded-lg hover:bg-red-50 transition-all duration-300 hover:scale-110 border border-gray-300 hover:border-red-400 focus:ring-1 focus:ring-red-300"
                                >
                                    <svg className="w-4 h-4 text-gray-600 group-hover:text-red-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </UITooltip>
                        )}
                        <UITooltip content="Close" placement="bottom">
                            <button
                                onClick={handleClose}
                                className="group relative w-8 h-8 flex items-center justify-center bg-transparent rounded-lg hover:bg-gray-100 transition-all duration-200 border border-gray-300 hover:border-gray-400 focus:ring-1 focus:ring-gray-300"
                            >
                                <svg className="w-4 h-4 text-gray-600 group-hover:text-gray-800 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </UITooltip>
                    </div>
                </div>

                {/* ── Resume prompt ── */}
                {resumeSession && (
                    <ResumePrompt
                        messageCount={resumeSession.messages.length}
                        ago={formatAgo(resumeSession.savedAt)}
                        onContinue={handleContinueSession}
                        onStartFresh={handleStartFresh}
                    />
                )}

                {/* ── Message thread ── */}
                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto px-4 py-4"
                    style={{ scrollBehavior: 'smooth' }}
                >
                    <style>{`
                        @keyframes aiChatBounce {
                            0%, 60%, 100% { transform: translateY(0); }
                            30% { transform: translateY(-5px); }
                        }
                    `}</style>

                    {messages.map(msg => (
                        <MessageBubble
                            key={msg.id}
                            msg={msg}
                            onAddChart={(chart) => {
                                const chartIdx = msg.charts ? msg.charts.indexOf(chart) : 0;
                                handleAddChart(chart, msg.id, chartIdx);
                            }}
                            addedChartIds={addedChartIds}
                            onRetry={msg.error ? () => {
                                // Remove the error message, then resend the last user message
                                setMessages(prev => prev.filter(m => m.id !== msg.id));
                                sendMessage(lastUserMessageRef.current);
                            } : null}
                        />
                    ))}

                    {loading && <TypingIndicator />}
                </div>

                {/* ── Input bar ── */}
                <div
                    className="flex-shrink-0 px-4 py-3"
                    style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
                >
                    <div
                        className="flex items-end gap-2 rounded-xl px-3 py-2"
                        style={{
                            border: '1.5px solid var(--color-border)',
                            background: 'var(--color-bg)',
                            transition: 'border-color 0.15s',
                        }}
                        onFocusCapture={e => e.currentTarget.style.borderColor = 'var(--color-interactive)'}
                        onBlurCapture={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                    >
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Create or edit a chart..."
                            rows={1}
                            disabled={loading}
                            className="flex-1 resize-none bg-transparent text-sm outline-none min-h-[24px] max-h-[120px]"
                            style={{
                                color: 'var(--color-text)',
                                lineHeight: '1.5',
                                fontFamily: 'inherit',
                                overflow: 'hidden',
                            }}
                            onInput={e => {
                                e.target.style.height = 'auto';
                                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                                e.target.style.overflow = e.target.scrollHeight > 120 ? 'auto' : 'hidden';
                            }}
                        />
                        <button
                            onClick={() => sendMessage()}
                            disabled={!input.trim() || loading}
                            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-150"
                            style={input.trim() && !loading ? {
                                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                                color: 'white',
                                boxShadow: '0 2px 8px rgba(79, 70, 229, 0.35)',
                                transform: 'scale(1)',
                            } : {
                                background: 'var(--color-bg-subtle)',
                                color: 'var(--color-text-muted)',
                                cursor: 'not-allowed',
                            }}
                            onMouseEnter={e => { if (input.trim() && !loading) e.currentTarget.style.transform = 'scale(1.08)'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                        >
                            {loading ? (
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                                </svg>
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                            )}
                        </button>
                    </div>
                    <p className="text-[10px] text-center mt-1.5" style={{ color: 'var(--color-text-muted)' }}>
                        Press Enter to send · Shift+Enter for new line
                    </p>
                </div>
            </div>
        </>
    );
};

export default AiAnalyticsChat;

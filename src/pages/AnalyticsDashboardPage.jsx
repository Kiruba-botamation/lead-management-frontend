import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../api/axiosConfig';
import { useAccount } from '../context/AccountContext';
import { useAuth } from '../context/AuthContext';
import { resolveActiveAcctNo, getAcctIdFromLocalStorage } from '../utils/accountHelpers';
import { Combobox } from '../components/ui/Combobox';
import {
    PieChart, Pie, Cell, Sector, BarChart, Bar, AreaChart, Area, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, ResponsiveContainer, Customized
} from 'recharts';
import LoadingMask from '../components/LoadingMask';
import DeleteConfirmation from '../components/DeleteConfirmation';
import UITooltip from '../components/Tooltip';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import Button from '../components/ui/Button';
import AiAnalyticsChat from '../components/AiAnalyticsChat';
import AppNavbar from '../components/AppNavbar';

// ── Controlled dimension input for width/height ──
const DimensionInput = ({ value, onCommit, min, max, className }) => {
    const [val, setVal] = useState(value);
    useEffect(() => { setVal(value); }, [value]);
    const handleBlur = () => {
        let num = parseInt(val, 10);
        if (isNaN(num)) num = value;
        num = Math.max(min, Math.min(max, num));
        setVal(num);
        if (num !== value) onCommit(num);
    };
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') e.target.blur();
    };
    return (
        <input
            type="number"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={`appearance-none [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${className}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        />
    );
};

// ── Controlled label-rename input — defined outside component to keep stable reference ──
const LabelInput = ({ initialValue, placeholder, onCommit }) => {
    const [val, setVal] = useState(initialValue);
    useEffect(() => { setVal(initialValue); }, [initialValue]);
    return (
        <input
            type="text"
            value={val}
            placeholder={placeholder}
            className="ds-input ds-input--sm"
            onChange={(e) => {
                setVal(e.target.value);
                onCommit(e.target.value || placeholder);
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
        />
    );
};

const AnalyticsDashboardPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { acctNo, acctId, accountsLoaded } = useAccount();
    const { userDetails, user: rawUser } = useAuth();
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(false);
    const [chartsReady, setChartsReady] = useState(false);
    const [collectionFieldsCache, setCollectionFieldsCache] = useState({});
    const fieldsFetchPromisesRef = useRef({});

    // Collection state
    const [collections, setCollections] = useState([]);
    const [collectionLoading, setCollectionLoading] = useState(false);

    // Header smart-hide state
    const [headerVisible, setHeaderVisible] = useState(true);
    const lastScrollY = useRef(0);
    const inactivityTimer = useRef(null);

    // Global navbar height — so the analytics sub-header pins right below it (both are sticky)
    const navWrapRef = useRef(null);
    const [navHeight, setNavHeight] = useState(0);
    useEffect(() => {
        const el = navWrapRef.current;
        if (!el) return;
        const measure = () => setNavHeight(el.offsetHeight);
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        window.addEventListener('resize', measure);
        return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
    }, []);

    // View As — admin selector
    const [viewAsAdmins, setViewAsAdmins] = useState([]);
    const [viewAsAdmin, setViewAsAdmin] = useState(null);
    const [viewAsOpen, setViewAsOpen] = useState(false);
    const [viewAsAvatarError, setViewAsAvatarError] = useState(false);
    const [viewingAs, setViewingAs] = useState(null); // set by admins effect after email match
    const viewAsRef = useRef(null);

    const VIEW_AS_IMAGE_KEYS = ['profileImage', 'profileImageUrl', 'avatar', 'photo', 'image'];
    const VIEW_AS_AVATAR_COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0284c7'];
    const getAdminDisplayName = (a) => {
        if (!a) return '';
        if (a.firstName && a.lastName) return `${a.firstName} ${a.lastName}`;
        if (a.firstName) return a.firstName;
        const k = Object.keys(a).find(key => ['name', 'fullName', 'username', 'displayName'].includes(key));
        return k ? a[k] : 'Admin';
    };
    const getAdminAvatar = (a) => {
        if (!a) return null;
        const k = Object.keys(a).find(key => VIEW_AS_IMAGE_KEYS.map(s => s.toLowerCase()).includes(key.toLowerCase()));
        return k ? a[k] : null;
    };
    const getAdminInitials = (a) => {
        const name = getAdminDisplayName(a);
        const parts = name.trim().split(' ');
        return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
    };
    const getAdminColor = (a) => VIEW_AS_AVATAR_COLORS[(getAdminDisplayName(a).charCodeAt(0) || 0) % VIEW_AS_AVATAR_COLORS.length];

    useEffect(() => {
        const resetInactivityTimer = () => {
            if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
            inactivityTimer.current = setTimeout(() => setHeaderVisible(false), 3000);
        };

        const handleScroll = () => {
            const currentY = window.scrollY;
            if (currentY <= 0) {
                setHeaderVisible(true);
                if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
                lastScrollY.current = 0;
                return;
            }
            if (currentY < lastScrollY.current) {
                // scrolling up — show header and arm inactivity timer
                setHeaderVisible(true);
                resetInactivityTimer();
            } else {
                // scrolling down — hide header immediately
                setHeaderVisible(false);
                if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
            }
            lastScrollY.current = currentY;
        };

        const handleScrollEnd = () => resetInactivityTimer();

        const handleMouseMove = (e) => {
            if (e.clientY < 60) {
                setHeaderVisible(true);
                if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('scrollend', handleScrollEnd, { passive: true });
        window.addEventListener('mousemove', handleMouseMove, { passive: true });
        return () => {
            window.removeEventListener('scroll', handleScroll);
            window.removeEventListener('scrollend', handleScrollEnd);
            window.removeEventListener('mousemove', handleMouseMove);
            if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
        };
    }, []);

    // Chart types
    const chartTypes = [
        { value: 'pie', label: 'Pie Chart' },
        { value: 'bar', label: 'Bar Chart' },
        { value: 'line', label: 'Line Chart' },
        { value: 'heatmap', label: 'Heat Map' },
        { value: 'number', label: 'Number' }
    ];

    // Helper to format field names
    const formatFieldName = (field) => {
        return field
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    };

    // Columns are derived dynamically per chart below

    // Aggregation types
    const aggregationTypes = [
        { value: 'count', label: 'Count' },
        { value: 'sum', label: 'Sum' }
    ];
    const aggregationTypesNumber = [
        { value: 'count', label: 'Count' },
        { value: 'sum', label: 'Sum' },
        { value: 'avg', label: 'Average' }
    ];

    const DATE_GRANULARITY_OPTIONS = [
        { value: 'hour', label: 'Hourly' },
        { value: 'day', label: 'Daily' },
        { value: 'month', label: 'Monthly' },
        { value: 'year', label: 'Yearly' },
    ];

    // Fields that represent timestamps and should trigger date granularity bucketing
    const DATE_AXIS_FIELDS = ['createdAt', 'updatedAt'];

    const getTodayISO = () => {
        const d = new Date(); d.setHours(0, 0, 0, 0);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    // Default chart configuration
    const defaultChartConfig = {
        chartType: null,
        xAxis: null,
        yAxis: null,
        zAxis: null,
        aggregation: null,
        chartMode: null,
        dateFilterFrom: getTodayISO(),
        dateFilterTo: getTodayISO(),
        _datePreset: 'today',
        chartWidth: 'half',
        chartHeight: 320,
        chartWidthPx: null,
        chartName: '',
        barOrientation: 'vertical',
        chartColor: null,
        autoRefreshMins: null,
        chartCollection: null,
        dateGranularity: 'day',
        showLegend: true,
        showDataLabels: true,
        numberSplitCount: 0,
        fieldLabels: {},
    };

    const STORAGE_KEY = 'analyticsDashboard_charts';

    // Read the full nested store: { acctId: { viewingAsUserId: { filters: [...] } } }
    const readStore = () => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
        } catch {
            return {};
        }
    };

    const loadCharts = (acct, viewingAsUserId) => {
        try {
            const store = readStore();
            const acctKey = acct || 'default';
            const viewingKey = viewingAsUserId || 'default';
            const acctData = store[acctKey] || {};
            const viewingData = acctData[viewingKey] || {};
            return viewingData.filters || [];
        } catch {
            return [];
        }
    };

    const saveCharts = (acct, viewingAsUserId, chartsData) => {
        try {
            const store = readStore();
            const acctKey = acct || 'default';
            const viewingKey = viewingAsUserId || 'default';
            const chartsToSave = chartsData.map(chart => ({
                id: chart.id,
                chartType: chart.chartType,
                xAxis: chart.xAxis,
                yAxis: chart.yAxis,
                aggregation: chart.aggregation,
                dateFilterFrom: chart.dateFilterFrom,
                dateFilterTo: chart.dateFilterTo,
                _datePreset: chart._datePreset || 'today',
                _lastNDays: chart._lastNDays,
                _showLastN: chart._showLastN,
                _showCustom: chart._showCustom,
                chartWidth: chart.chartWidth,
                chartHeight: chart.chartHeight,
                chartWidthPx: chart.chartWidthPx ?? null,
                chartName: chart.chartName || '',
                barOrientation: chart.barOrientation || 'vertical',
                chartColor: chart.chartColor || null,
                autoRefreshMins: chart.autoRefreshMins ?? null,
                zAxis: chart.zAxis || null,
                chartMode: chart.chartMode || null,
                chartCollection: chart.chartCollection || null,
                fieldLabels: chart.fieldLabels || {},
                numberSplitCount: chart.numberSplitCount ?? 0,
                dateGranularity: chart.dateGranularity || 'day',
                showLegend: chart.showLegend ?? true,
                showDataLabels: chart.showDataLabels ?? true
            }));
            store[acctKey] = store[acctKey] || {};
            store[acctKey][viewingKey] = { filters: chartsToSave };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        } catch {
            // ignore storage errors
        }
    };

    // Re-compute dateFrom/dateTo for a given preset as of right now.
    // Called on restore so relative presets (today, thisweek, …) always reflect
    // the current date rather than the stale date stored in localStorage.
    const resolveDatesForPreset = (preset, lastNDays = 7) => {
        const toISO = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const todayStr = toISO(today);

        switch (preset) {
            case 'today':
                return { dateFilterFrom: todayStr, dateFilterTo: todayStr };
            case 'yesterday': {
                const yest = new Date(today); yest.setDate(yest.getDate() - 1);
                const y = toISO(yest);
                return { dateFilterFrom: y, dateFilterTo: y };
            }
            case 'alltime':
                return { dateFilterFrom: '', dateFilterTo: '' };
            case 'thisweek': {
                const mon = new Date(today);
                mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
                return { dateFilterFrom: toISO(mon), dateFilterTo: todayStr };
            }
            case 'lastweek': {
                const monThis = new Date(today);
                monThis.setDate(today.getDate() - ((today.getDay() + 6) % 7));
                const monLast = new Date(monThis); monLast.setDate(monThis.getDate() - 7);
                const sunLast = new Date(monLast); sunLast.setDate(monLast.getDate() + 6);
                return { dateFilterFrom: toISO(monLast), dateFilterTo: toISO(sunLast) };
            }
            case 'thismonth': {
                const first = new Date(today.getFullYear(), today.getMonth(), 1);
                return { dateFilterFrom: toISO(first), dateFilterTo: todayStr };
            }
            case 'lastmonth': {
                const firstLast = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                const lastLast = new Date(today.getFullYear(), today.getMonth(), 0);
                return { dateFilterFrom: toISO(firstLast), dateFilterTo: toISO(lastLast) };
            }
            case 'last_n': {
                const d = new Date(today); d.setDate(d.getDate() - lastNDays);
                return { dateFilterFrom: toISO(d), dateFilterTo: todayStr };
            }
            case 'custom':
            default:
                return null; // keep saved dates as-is
        }
    };

    const normalizeChart = (entry) => {
        const todayISO = getTodayISO();
        const preset = entry._datePreset || 'today';
        const resolvedDates = resolveDatesForPreset(preset, entry._lastNDays || 7);
        return {
            ...defaultChartConfig,
            ...entry,
            id: entry.id,
            _datePreset: preset,
            // For relative presets, always recompute from today so stale saved dates are never used
            dateFilterFrom: resolvedDates ? resolvedDates.dateFilterFrom : (entry.dateFilterFrom || todayISO),
            dateFilterTo: resolvedDates ? resolvedDates.dateFilterTo : (entry.dateFilterTo || todayISO),
        };
    };

    // State for charts — local to account
    const [charts, setCharts] = useState([]);
    const [chartRequestSignatures, setChartRequestSignatures] = useState({});
    const [nextChartId, setNextChartId] = useState(1);
    const [chartDataCache, setChartDataCache] = useState({});
    const [chartLoadingState, setChartLoadingState] = useState({});
    // Auto-refresh: per-chart countdown seconds remaining
    const [autoRefreshCountdown, setAutoRefreshCountdown] = useState({});
    const autoRefreshIntervalsRef = React.useRef({});
    const chartsForTimerRef = React.useRef([]);
    const acctIdRef = React.useRef(acctId);
    const viewingAsRef = React.useRef(null);
    const skipViewingAsEffectRef = React.useRef(false); // set by handleViewAsChange when it already loaded charts, to prevent the viewingAs useEffect from doing duplicate work
    const adminsLoadedForAcctRef = React.useRef(null); // prevents the admins effect from running more than once per account
    const draggedIdRef = React.useRef(null);
    const [dragOverId, setDragOverId] = useState(null);
    const [isDraggingAny, setIsDraggingAny] = useState(false);
    const [pendingDeleteId, setPendingDeleteId] = useState(null);
    const scrollIntervalRef = React.useRef(null);
    const isResizingRef = React.useRef(false);
    const [dragHeights, setDragHeights] = useState({});
    const [dragWidths, setDragWidths] = useState({});

    // Pending (draft) chart configs — changes inside the slider that haven't been applied yet
    const [pendingChartConfigs, setPendingChartConfigs] = useState({});
    const [updateSuccess, setUpdateSuccess] = useState({});
    // Tracks charts mid-submit (between button click and chartLoadingState going true) to prevent flash
    const [submittingCharts, setSubmittingCharts] = useState({});
    // Ref to track charts whose "Update Chart" fetch is in-flight (for auto-hide after load)
    const userFetchInFlightRef = React.useRef({});

    const updatePendingConfig = (chartId, field, value) => {
        setPendingChartConfigs(prev => ({
            ...prev,
            [chartId]: { ...(prev[chartId] || {}), [field]: value },
        }));
    };

    const updatePendingConfigBatch = (chartId, updates) => {
        setPendingChartConfigs(prev => ({
            ...prev,
            [chartId]: { ...(prev[chartId] || {}), ...updates },
        }));
    };

    const clearPendingConfig = (chartId) => {
        setPendingChartConfigs(prev => {
            const n = { ...prev };
            delete n[chartId];
            return n;
        });
    };

    // Merged config: charts state + pending draft overrides
    const getMergedConfig = (chartConfig) => ({
        ...chartConfig,
        ...(pendingChartConfigs[chartConfig.id] || {}),
    });

    // Filter panel visibility — per-chart, proximity-based
    const [filterVisible, setFilterVisible] = useState({});
    const [filterHideCountState, setFilterHideCountState] = useState({});
    const [filterPanelPos, setFilterPanelPos] = useState({});
    const filterHideCountRef = React.useRef({});
    const cardRefs = React.useRef({});

    // Compute and store the fixed position for a chart's slider panel
    const updateFilterPanelPos = React.useCallback((chartId) => {
        const card = cardRefs.current[chartId];
        if (!card) return;
        const rect = card.getBoundingClientRect();
        setFilterPanelPos(prev => ({
            ...prev,
            [chartId]: { top: rect.top + 36, left: rect.left, width: rect.width },
        }));
    }, []);

    // Keep panel position in sync while any panel is open (resize / scroll)
    React.useEffect(() => {
        const handler = () => {
            setFilterVisible(prev => {
                const openIds = Object.keys(prev);
                if (!openIds.length) return prev;
                openIds.forEach(id => updateFilterPanelPos(Number(id)));
                return prev;
            });
        };
        window.addEventListener('resize', handler);
        window.addEventListener('scroll', handler, true);

        const observer = new ResizeObserver((entries) => {
            setFilterVisible(prev => {
                const openIds = Object.keys(prev);
                if (!openIds.length) return prev;
                let changed = false;
                for (const entry of entries) {
                    const idStr = entry.target.dataset.chartId;
                    if (idStr && prev[idStr]) {
                        changed = true;
                        break;
                    }
                }
                if (changed) {
                    openIds.forEach(id => updateFilterPanelPos(Number(id)));
                }
                return prev;
            });
        });

        Object.values(cardRefs.current).forEach(el => {
            if (el) observer.observe(el);
        });

        return () => {
            window.removeEventListener('resize', handler);
            window.removeEventListener('scroll', handler, true);
            observer.disconnect();
        };
    }, [updateFilterPanelPos, charts.length]);

    const hideFilter = (chartId) => {
        // Animate out first, then remount (to reset dropdowns) after transition finishes
        setFilterVisible(prev => { const n = { ...prev }; delete n[chartId]; return n; });
        setTimeout(() => {
            filterHideCountRef.current[chartId] = (filterHideCountRef.current[chartId] || 0) + 1;
            setFilterHideCountState(prev => ({ ...prev, [chartId]: filterHideCountRef.current[chartId] }));
        }, 320);
    };

    // Auto-hide slider after a user-initiated "Update Chart" fetch completes successfully
    React.useEffect(() => {
        const inFlight = userFetchInFlightRef.current;
        Object.keys(inFlight).forEach(id => {
            const chartId = Number(id);
            // Once loading starts, clear the submitting bridge state
            if (inFlight[chartId] && chartLoadingState[chartId] === true) {
                setSubmittingCharts(prev => { const n = { ...prev }; delete n[chartId]; return n; });
            }
            // chartLoadingState[chartId] becoming false (or undefined) means it finished
            if (inFlight[chartId] && chartLoadingState[chartId] === false) {
                delete inFlight[chartId];
                setSubmittingCharts(prev => { const n = { ...prev }; delete n[chartId]; return n; });
                setUpdateSuccess(prev => ({ ...prev, [chartId]: true }));
                setTimeout(() => {
                    setUpdateSuccess(prev => { const n = { ...prev }; delete n[chartId]; return n; });
                    hideFilter(chartId);
                }, 800);
            }
        });
    }, [chartLoadingState]); // eslint-disable-line react-hooks/exhaustive-deps

    // direction: 'y' | 'x' | 'both'
    const startResize = (e, id, currentHeight, currentWidth, direction = 'y') => {
        e.preventDefault();
        e.stopPropagation();
        isResizingRef.current = true;
        const startY = e.clientY;
        const startX = e.clientX;
        const startH = currentHeight;
        const startW = currentWidth;
        const onMove = (mv) => {
            if (direction === 'y' || direction === 'both') {
                const newH = Math.max(120, Math.min(1200, startH + (mv.clientY - startY)));
                setDragHeights(prev => ({ ...prev, [id]: newH }));
            }
            if (direction === 'x' || direction === 'both') {
                const newW = Math.max(200, Math.min(2400, startW + (mv.clientX - startX)));
                setDragWidths(prev => ({ ...prev, [id]: newW }));
            }
        };
        const onUp = (up) => {
            isResizingRef.current = false;
            if (direction === 'y' || direction === 'both') {
                const finalH = Math.max(120, Math.min(1200, startH + (up.clientY - startY)));
                updateChartConfig(id, 'chartHeight', finalH);
                setDragHeights(prev => { const n = { ...prev }; delete n[id]; return n; });
            }
            if (direction === 'x' || direction === 'both') {
                const finalW = Math.max(200, Math.min(2400, startW + (up.clientX - startX)));
                updateChartConfig(id, 'chartWidthPx', finalW);
                setDragWidths(prev => { const n = { ...prev }; delete n[id]; return n; });
            }
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    const stopAutoScroll = () => {
        if (scrollIntervalRef.current) {
            clearInterval(scrollIntervalRef.current);
            scrollIntervalRef.current = null;
        }
    };

    const handleDragOverScroll = (clientY) => {
        stopAutoScroll();
        const zone = 80;
        const speed = 12;
        if (clientY < zone) {
            scrollIntervalRef.current = setInterval(() => window.scrollBy(0, -speed), 16);
        } else if (clientY > window.innerHeight - zone) {
            scrollIntervalRef.current = setInterval(() => window.scrollBy(0, speed), 16);
        }
    };

    // Refs to coordinate per-account save without spurious writes on load
    const skipSaveRef = React.useRef(false);
    // chartsRef lets fetchFieldsData always see the latest charts without being a dep
    const chartsRef = React.useRef(charts);
    // fieldsFetchIdRef cancels stale fetchFieldsData completions
    const fieldsFetchIdRef = React.useRef(0);

    // Reset all data-related fields when collection changes
    const resetChartDataFields = (chartId) => {
        const todayISO = getTodayISO();
        setCharts(prev => prev.map(chart => {
            if (chart.id === chartId) {
                return {
                    ...chart,
                    chartType: null,
                    xAxis: null,
                    yAxis: null,
                    zAxis: null,
                    aggregation: null,
                    chartMode: null,
                    dateFilterFrom: todayISO,
                    dateFilterTo: todayISO,
                    _datePreset: 'today',
                    _showCustom: false,
                    _showLastN: false,
                    _lastNDays: 2,
                    chartColor: null,
                    autoRefreshMins: null,
                    barOrientation: 'vertical',
                };
            }
            return chart;
        }));
    };

    const isChartConfigured = (chartConfig) => {
        const isNumber = chartConfig.chartType?.value === 'number';
        return isNumber
            ? !!(chartConfig.yAxis && chartConfig.aggregation)
            : !!(chartConfig.xAxis && chartConfig.yAxis && chartConfig.aggregation);
    };

    const getChartRequestPayload = (chartConfig) => {
        if (!acctIdRef.current || !isChartConfigured(chartConfig)) return null;

        const isNumber = chartConfig.chartType?.value === 'number';
        const xAxisField = isNumber ? chartConfig.yAxis.value : chartConfig.xAxis?.value;
        const isDateAxis = xAxisField === 'createdAt' || xAxisField === 'updatedAt';
        const payload = {
            xAxis: xAxisField,
            yAxis: chartConfig.yAxis.value,
            aggregation: chartConfig.aggregation.value === 'average' ? 'avg' : chartConfig.aggregation.value,
            acctId: acctIdRef.current,
            ...(chartConfig.chartCollection?._id || chartConfig.chartCollection
                ? { collectionId: chartConfig.chartCollection?._id || chartConfig.chartCollection }
                : {}),
            ...((chartConfig.chartMode === 'grouped' || chartConfig.chartMode === 'stacked') && chartConfig.zAxis
                ? { zAxis: chartConfig.zAxis.value }
                : {}),
            ...(chartConfig.dateFilterFrom ? { dateFrom: chartConfig.dateFilterFrom } : {}),
            ...(chartConfig.dateFilterTo ? { dateTo: chartConfig.dateFilterTo } : {}),
            ...(isDateAxis ? { dateGranularity: chartConfig.dateGranularity || 'day' } : {})
        };

        return payload;
    };

    const getChartRequestSignature = (chartConfig) => {
        const payload = getChartRequestPayload(chartConfig);
        return payload ? JSON.stringify(payload) : null;
    };

    const isChartRequestDirty = (chartConfig) => {
        const signature = getChartRequestSignature(chartConfig);
        return !!signature && chartRequestSignatures[chartConfig.id] !== signature;
    };

    // Returns true if any display-only fields in pendingChartConfigs differ from committed chartConfig
    const isDisplayDirty = (committedConfig) => {
        const pending = pendingChartConfigs[committedConfig.id];
        if (!pending) return false;
        const displayFields = ['showLegend', 'showDataLabels', 'chartColor', 'barOrientation', 'numberSplitCount', 'autoRefreshMins', 'fieldLabels', 'chartMode', 'chartType'];
        return displayFields.some(f => {
            if (!(f in pending)) return false;
            return JSON.stringify(pending[f]) !== JSON.stringify(committedConfig[f]);
        });
    };

    // Either the data query changed or display settings changed
    const isChartDirty = (mergedCfg, committedCfg) =>
        isChartRequestDirty(mergedCfg) || isDisplayDirty(committedCfg);

    // Update individual chart config
    const updateChartConfig = (chartId, field, value) => {
        setCharts(prev => prev.map(chart => {
            if (chart.id === chartId) {
                let updatedChart = { ...chart, [field]: value };
                // When collection changes: reset axis/aggregation fields and fetch new collection fields
                if (field === 'chartCollection') {
                    const todayISO = getTodayISO();
                    const catId = value?._id || value;
                    if (catId) fetchFieldsForCollection(catId);
                    // Reset dependent fields so X/Y axis options reflect the new collection
                    updatedChart = {
                        ...updatedChart,
                        chartType: null,
                        xAxis: null,
                        yAxis: null,
                        zAxis: null,
                        aggregation: null,
                        chartMode: null,
                        dateFilterFrom: todayISO,
                        dateFilterTo: todayISO,
                        _datePreset: 'today',
                        _showCustom: false,
                        _showLastN: false,
                        _lastNDays: 2,
                        chartColor: null,
                        autoRefreshMins: null,
                        barOrientation: 'vertical',
                    };
                }
                return updatedChart;
            }
            return chart;
        }));
        setHasUnsavedChanges(true);
    };

    // Update multiple fields at once — triggers at most one API call
    const updateChartConfigBatch = (chartId, updates) => {
        setCharts(prev => prev.map(chart => {
            if (chart.id === chartId) {
                return { ...chart, ...updates };
            }
            return chart;
        }));
        setHasUnsavedChanges(true);
    };

    // Fetch chart data from backend API
    // silent=true skips the per-chart loading mask (used by auto-refresh)
    const fetchChartDataFromBackend = async (chartId, chartConfig, silent = false, markClean = false) => {
        const currentAcctId = acctIdRef.current;
        const isNumber = chartConfig.chartType?.value === 'number';
        if (isNumber ? (!chartConfig.yAxis || !chartConfig.aggregation) : (!chartConfig.xAxis || !chartConfig.yAxis || !chartConfig.aggregation)) {
            return;
        }

        const requestSignature = getChartRequestSignature(chartConfig);
        if (markClean && requestSignature) {
            setChartRequestSignatures(prev => ({ ...prev, [chartId]: requestSignature }));
        }
        if (!silent) setChartLoadingState(prev => ({ ...prev, [chartId]: true }));
        try {
            const xAxisValue = isNumber ? chartConfig.yAxis.value : chartConfig.xAxis.value;
            const isDateAxis = xAxisValue === 'createdAt' || xAxisValue === 'updatedAt';
            // Use the chart's own collection if set
            const effectiveCollectionId = chartConfig.chartCollection?._id || chartConfig.chartCollection || null;
            const params = {
                xAxis: xAxisValue,
                yAxis: chartConfig.yAxis.value,
                aggregation: chartConfig.aggregation.value === 'average' ? 'avg' : chartConfig.aggregation.value,
                ...(currentAcctId && { acctId: currentAcctId }),
                ...(effectiveCollectionId && { collectionId: effectiveCollectionId }),
                ...((chartConfig.chartMode === 'grouped' || chartConfig.chartMode === 'stacked') && chartConfig.zAxis ? { zAxis: chartConfig.zAxis.value } : {}),
                ...(chartConfig.dateFilterFrom && { dateFrom: chartConfig.dateFilterFrom }),
                ...(chartConfig.dateFilterTo && { dateTo: chartConfig.dateFilterTo }),
                ...(isDateAxis ? { dateGranularity: chartConfig.dateGranularity || 'day' } : {}),
                ...(viewingAsRef.current && { viewingAs: viewingAsRef.current })
            };

            const response = await api.post('/api/ui/analytics/chart-data', params);
            const data = response.data.data || [];
            // For date-axis charts sort chronologically; otherwise sort by value descending
            if (isDateAxis) {
                data.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
            } else {
                data.sort((a, b) => b.value - a.value);
            }

            setChartDataCache(prev => ({
                ...prev,
                [chartId]: data
            }));
        } catch (err) {
            console.error('Error fetching chart data:', err);
            setChartDataCache(prev => ({
                ...prev,
                [chartId]: []
            }));
            // Clear in-flight flag on error so slider stays open (auto-hide only on success)
            delete userFetchInFlightRef.current[chartId];
        } finally {
            if (!silent) setChartLoadingState(prev => ({ ...prev, [chartId]: false }));
        }
    };

    // Handle charts generated by the AI assistant — appends to existing dashboard
    const handleAiChartsGenerated = (aiChartConfigs) => {
        if (!aiChartConfigs?.length) return;
        const todayISO = getTodayISO();

        // Separate edits (have editChartId) from new charts
        const edits = aiChartConfigs.filter(cfg => cfg.editChartId != null);
        const additions = aiChartConfigs.filter(cfg => cfg.editChartId == null);

        // Capture the newly-assigned IDs in a closure variable so the setTimeout
        // below can reference them by identity rather than by positional slice,
        // which is unreliable when multiple charts are added in quick succession.
        let capturedAddedIds = [];

        setCharts(prev => {
            let updated = prev;

            // Apply edits — merge AI config over the existing chart
            if (edits.length > 0) {
                updated = updated.map(existing => {
                    const edit = edits.find(e => e.editChartId === existing.id);
                    if (!edit) return existing;
                    const { editChartId: _, ...editFields } = edit;
                    return {
                        ...existing,
                        ...editFields,
                        id: existing.id, // never change id
                        ...(editFields._datePreset && editFields._datePreset !== 'custom'
                            ? resolveDatesForPreset(editFields._datePreset, editFields._lastNDays)
                            : editFields._datePreset === 'custom'
                                ? { dateFilterFrom: editFields.dateFilterFrom || todayISO, dateFilterTo: editFields.dateFilterTo || todayISO }
                                : {}),
                        chartCollection: editFields.chartCollection
                            ? { _id: editFields.chartCollection._id, collectionName: editFields.chartCollection.collectionName }
                            : existing.chartCollection,
                    };
                });
            }

            // Append new charts — capture their IDs in the closure
            if (additions.length > 0) {
                const maxId = updated.length > 0 ? Math.max(...updated.map(c => c.id)) : 0;
                capturedAddedIds = additions.map((_, i) => maxId + 1 + i);
                const newCharts = additions.map((cfg, i) => ({
                    ...defaultChartConfig,
                    ...cfg,
                    id: capturedAddedIds[i],
                    ...(cfg._datePreset && cfg._datePreset !== 'custom'
                        ? resolveDatesForPreset(cfg._datePreset, cfg._lastNDays)
                        : { dateFilterFrom: cfg.dateFilterFrom || todayISO, dateFilterTo: cfg.dateFilterTo || todayISO }),
                    chartCollection: cfg.chartCollection
                        ? { _id: cfg.chartCollection._id, collectionName: cfg.chartCollection.collectionName }
                        : null,
                }));
                updated = [...updated, ...newCharts];
                setNextChartId(maxId + 1 + additions.length);
            }

            saveCharts(acctId, viewingAs, updated);
            return updated;
        });
        setHasUnsavedChanges(true);

        // Fetch fields + chart data after state settles.
        // Use capturedAddedIds (populated inside the updater above) rather than
        // a positional slice of `current`, which is wrong when charts are added
        // one-at-a-time via individual "Add to Dashboard" clicks.
        setTimeout(() => {
            setCharts(current => {
                const affectedIds = new Set([
                    ...edits.map(e => e.editChartId),
                    ...capturedAddedIds,
                ]);
                const affectedCharts = current.filter(c => affectedIds.has(c.id));
                const usedCatIds = [...new Set(affectedCharts.map(c => c.chartCollection?._id).filter(Boolean))];
                usedCatIds.forEach(catId => fetchFieldsForCollection(catId));
                affectedCharts.forEach(chart => {
                    const isNum = chart.chartType?.value === 'number';
                    const ready = isNum
                        ? !!(chart.yAxis && chart.aggregation)
                        : !!(chart.xAxis && chart.yAxis && chart.aggregation);
                    if (ready) fetchChartDataFromBackend(chart.id, chart, true);
                });
                return current; // no state change — side-effect only
            });
        }, 50);
    };


    // Add new chart
    const addChart = () => {
        const todayISO = getTodayISO();
        const newChart = {
            ...defaultChartConfig,
            id: nextChartId,
            dateFilterFrom: todayISO,
            dateFilterTo: todayISO
        };
        setCharts(prev => [...prev, newChart]);
        setChartRequestSignatures(prev => ({ ...prev, [nextChartId]: getChartRequestSignature(newChart) }));
        setNextChartId(prev => prev + 1);
        setHasUnsavedChanges(true);
    };

    // Remove chart
    const removeChart = (chartId) => {
        setCharts(prev => prev.filter(chart => chart.id !== chartId));
        setChartRequestSignatures(prev => {
            const next = { ...prev };
            delete next[chartId];
            return next;
        });
        setHasUnsavedChanges(true);
    };

    // Schema sync / save
    const [schemaSyncing, setSchemaSyncing] = useState(false);
    const [schemaSaving, setSchemaSaving] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [schemaSavedOnce, setSchemaSavedOnce] = useState(false);
    const [saveWarningOpen, setSaveWarningOpen] = useState(false);
    // AI chart assistant panel
    const [aiChatOpen, setAiChatOpen] = useState(false);
    // Admin-switch unsaved-changes guard
    const [switchAdminWarningOpen, setSwitchAdminWarningOpen] = useState(false);
    const [pendingViewAsAdmin, setPendingViewAsAdmin] = useState(null);
    // Pull-overwrite warning (same admin, unsaved changes)
    const [pullOverwriteWarningOpen, setPullOverwriteWarningOpen] = useState(false);

    // Fetch schema from backend, save to localStorage, and load charts.
    // Called when localStorage has no charts for the current viewingAs user.
    const handleSchemaSync = async (acctIdOverride, viewingAsOverride) => {
        const targetAcctId = acctIdOverride || acctId;
        // Schemas are keyed by the lead-app userId.
        const selectedAdminId = viewAsAdmin ? String(viewAsAdmin.userId || '') : null;
        const targetViewingAs = selectedAdminId || viewingAsOverride || viewingAs;
        if (!targetAcctId || !targetViewingAs) {
            // Cannot sync — no account or user identity; unblock the UI
            setChartsReady(true);
            return;
        }
        setSchemaSyncing(true);
        setChartsReady(false);
        try {
            const userId = localStorage.getItem('userId');
            const res = await api.get('/api/ui/analytics/get-schema', {
                params: {
                    userId,
                    acctId: targetAcctId,
                    viewingAs: targetViewingAs,
                    selectedUserId: targetViewingAs   // explicit: fetch schema for this selected admin
                }
            });
            const responseData = res.data?.data;
            // The backend returns the schema for exactly the requested userId, so trust it.
            // Guard with userId when present to never show another user's charts.
            const userIdMatches = !responseData?.userId || responseData.userId === targetViewingAs;

            if (res.data?.success && userIdMatches && responseData?.schema) {
                const remoteSchema = responseData.schema;
                const store = readStore();
                store[targetAcctId] = store[targetAcctId] || {};
                store[targetAcctId][targetViewingAs] = remoteSchema;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(store));

                // Load charts for the viewingAs user
                const filters = remoteSchema?.filters || [];
                const restored = filters.map(entry => normalizeChart(entry));
                skipSaveRef.current = true;
                chartsRef.current = restored;
                setCharts(restored);
                setNextChartId(restored.length > 0 ? Math.max(...restored.map(c => c.id)) + 1 : 1);
                setChartRequestSignatures(Object.fromEntries(restored.map(chart => [chart.id, getChartRequestSignature(chart)])));
                setChartDataCache({});

                // Fetch field schemas and chart data for restored charts
                const usedCollections = [...new Set(restored.map(c => c.chartCollection?._id || c.chartCollection).filter(Boolean))];
                usedCollections.forEach(catId => fetchFieldsForCollection(catId));
                restored.forEach(chart => {
                    const isNum = chart.chartType?.value === 'number';
                    if (isNum ? (chart.yAxis && chart.aggregation) : (chart.xAxis && chart.yAxis && chart.aggregation)) {
                        fetchChartDataFromBackend(chart.id, chart, true);
                    }
                });
                // Pull overwrites local state — nothing new to save
                setHasUnsavedChanges(false);
            } else {
                // Backend returned null/no schema — clear localStorage entry and empty the dashboard
                const store = readStore();
                if (store[targetAcctId]) {
                    delete store[targetAcctId][targetViewingAs];
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
                }
                skipSaveRef.current = true;
                chartsRef.current = [];
                setCharts([]);
                setNextChartId(1);
                setChartRequestSignatures({});
                setChartDataCache({});
                // Nothing to save after clearing
                setHasUnsavedChanges(false);
            }
        } catch (err) {
            console.error('Schema sync failed:', err);
        } finally {
            setSchemaSyncing(false);
            setChartsReady(true);
        }
    };
    const handleSchemaSave = async () => {
        if (!acctId) {
            console.error('Cannot save schema: no account selected');
            return;
        }

        // If currently viewing as a different admin, warn before saving
        const currentUserAdminId = localStorage.getItem('currentUserAdmin');
        const isViewingOtherAdmin = viewingAs && currentUserAdminId && viewingAs !== currentUserAdminId;
        if (isViewingOtherAdmin) {
            setSaveWarningOpen(true);
            return;
        }

        await executeSchemaSave(viewingAs);
    };

    // Performs the actual save — always targets the current user's own viewingAs key
    const executeSchemaSave = async (saveAsKey) => {
        if (!acctId) return;
        setSchemaSaving(true);
        try {
            // Always save under the current logged-in user's lead-app userId.
            const userId = rawUser?.userId || localStorage.getItem('userId');

            const schema = readStore();
            const acctKey = acctId || 'default';
            // Always read charts from the key we're currently viewing
            const viewingKey = viewingAs || 'default';
            const userSchema = schema[acctKey]?.[viewingKey] || { filters: [] };

            // Schemas are keyed by userId on the backend — save under the caller's userId.
            await api.post('/api/ui/analytics/save-schema', {
                userId: userId,
                acctId: acctId,
                schema: userSchema
            });

            setHasUnsavedChanges(false);
            setSchemaSavedOnce(true);
            console.log('Analytics schema saved successfully');
        } catch (error) {
            console.error('Error saving analytics schema:', error);
        } finally {
            setSchemaSaving(false);
        }
    };

    // Refresh all charts — re-fetches live data for every configured chart
    const [globalRefreshing, setGlobalRefreshing] = useState(false);
    const refreshAllCharts = async () => {
        const configured = charts.filter(c => c.chartType?.value === 'number' ? (c.yAxis && c.aggregation) : (c.xAxis && c.yAxis && c.aggregation));
        if (!configured.length) return;
        setGlobalRefreshing(true);
        await Promise.all(configured.map(c => fetchChartDataFromBackend(c.id, c)));
        setGlobalRefreshing(false);
    };

    // Download all charts as a single PDF (landscape A4)
    const [pdfDownloading, setPdfDownloading] = useState(false);

    // Build a human-readable date range label from a chart config
    const getChartDateLabel = (cfg) => {
        const preset = cfg?._datePreset || 'today';
        const from = cfg?.dateFilterFrom || '';
        const to = cfg?.dateFilterTo || '';
        const fmt = (iso) => {
            const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
        };
        switch (preset) {
            case 'today': return 'Today';
            case 'yesterday': return 'Yesterday';
            case 'alltime': return 'All Time';
            case 'thisweek': return 'This Week';
            case 'lastweek': return 'Last Week';
            case 'thismonth': return 'This Month';
            case 'lastmonth': return 'Last Month';
            case 'last_n': return `Last ${cfg?._lastNDays || 7} Days`;
            case 'custom': {
                if (from && to) return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
                if (from) return `From ${fmt(from)}`;
                if (to) return `Until ${fmt(to)}`;
                return 'Custom Range';
            }
            default: {
                if (from && to) return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
                return '';
            }
        }
    };

    const handleDownloadPDF = async () => {
        if (pdfDownloading) return;
        const chartIds = charts.map(c => c.id);
        if (!chartIds.length) return;
        setPdfDownloading(true);
        try {
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 24;
            let firstPage = true;

            // Off-screen capture container — fixed large size so flex children aren't clipped
            const offscreenHost = document.createElement('div');
            offscreenHost.style.cssText = [
                'position:fixed', 'left:-9999px', 'top:0',
                'width:1200px',   // wide enough to avoid responsive wrapping
                'background:#ffffff',
                'z-index:-1',
                'pointer-events:none',
            ].join(';');
            document.body.appendChild(offscreenHost);

            for (const id of chartIds) {
                const el = cardRefs.current[id];
                if (!el) continue;
                const chartConfig = charts.find(c => c.id === id);
                const title = chartConfig?.chartName?.trim() || `Chart ${id}`;
                const dateLabel = getChartDateLabel(chartConfig);

                // Grab only the chart content area
                const contentEl = el.querySelector('[data-pdf-content]') || el;

                // Deep-clone into the off-screen host with all computed styles resolved
                const clone = contentEl.cloneNode(true);
                // Remove any elements tagged data-pdf-hide from the clone
                clone.querySelectorAll('[data-pdf-hide]').forEach(n => n.remove());
                // Release ALL height/overflow constraints so the full flex column renders
                const releaseConstraints = (node) => {
                    if (node.style) {
                        node.style.height = 'auto';
                        node.style.maxHeight = 'none';
                        node.style.overflow = 'visible';
                        node.style.minHeight = '0';
                    }
                    // Also strip Tailwind classes that clip height
                    if (node.classList) {
                        ['h-full', 'min-h-0', 'overflow-hidden', 'overflow-y-hidden', 'overflow-x-hidden'].forEach(c => node.classList.remove(c));
                    }
                };
                releaseConstraints(clone);
                // Release first two levels of children (the p-4 wrapper and the chart flex root)
                clone.querySelectorAll('*').forEach(releaseConstraints);
                // Give SVGs explicit pixel dimensions so Recharts renders them fully
                clone.querySelectorAll('svg').forEach(svg => {
                    const rect = svg.getBoundingClientRect();
                    if (rect.width > 0) svg.setAttribute('width', rect.width);
                    if (rect.height > 0) svg.setAttribute('height', rect.height);
                });

                offscreenHost.innerHTML = '';
                offscreenHost.appendChild(clone);

                // Allow a tick for the browser to lay out
                await new Promise(r => setTimeout(r, 80));

                const canvas = await html2canvas(clone, {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    logging: false,
                    width: clone.scrollWidth,
                    height: clone.scrollHeight,
                    windowWidth: 1200,
                });

                const imgData = canvas.toDataURL('image/png');
                const imgAspect = canvas.width / canvas.height;

                // Header block: title + date label
                const headerH = dateLabel ? 42 : 28;
                const availW = pageWidth - margin * 2;
                const availH = pageHeight - margin * 2 - headerH;

                let drawW = availW;
                let drawH = drawW / imgAspect;
                if (drawH > availH) {
                    drawH = availH;
                    drawW = drawH * imgAspect;
                }

                const x = margin + (availW - drawW) / 2;
                const y = margin + headerH;

                if (!firstPage) pdf.addPage();
                firstPage = false;

                // Title
                pdf.setFontSize(13);
                pdf.setFont(undefined, 'bold');
                pdf.setTextColor(30, 30, 30);
                pdf.text(title, margin, margin + 13);

                // Date label
                if (dateLabel) {
                    pdf.setFontSize(9);
                    pdf.setFont(undefined, 'normal');
                    pdf.setTextColor(100, 100, 120);
                    pdf.text(dateLabel, margin, margin + 27);
                }

                // Chart image
                pdf.addImage(imgData, 'PNG', x, y, drawW, drawH);
            }

            document.body.removeChild(offscreenHost);
            pdf.save('analytics-charts.pdf');
        } catch (err) {
            console.error('PDF generation failed:', err);
        } finally {
            setPdfDownloading(false);
        }
    };


    // Keep chartsForTimerRef current so the interval callbacks always use latest chart state
    useEffect(() => {
        chartsForTimerRef.current = charts;
    }, [charts]);

    // Keep acctIdRef current so interval callbacks always use the latest acctId
    useEffect(() => {
        acctIdRef.current = acctId;
    }, [acctId]);

    // Keep viewingAsRef current so fetch callbacks always use the latest viewingAs
    useEffect(() => {
        viewingAsRef.current = viewingAs;
        // Re-enable the save button whenever the viewed admin changes (treat like a fresh load)
        setSchemaSavedOnce(false);
    }, [viewingAs]);

    // Auto-refresh timer manager — starts/restarts a countdown for each chart
    // No cleanup on dep change: each chart's timer is managed individually inside the body.
    useEffect(() => {
        const activeIds = new Set(charts.map(c => c.id));

        // Clear intervals for removed charts (skip _total keys)
        Object.keys(autoRefreshIntervalsRef.current)
            .filter(k => !k.includes('_total'))
            .forEach(idStr => {
                const id = Number(idStr);
                if (!activeIds.has(id)) {
                    clearInterval(autoRefreshIntervalsRef.current[idStr]);
                    delete autoRefreshIntervalsRef.current[idStr];
                    delete autoRefreshIntervalsRef.current[`${idStr}_total`];
                    setAutoRefreshCountdown(prev => { const n = { ...prev }; delete n[id]; return n; });
                }
            });

        charts.forEach(chart => {
            // Auto-refresh disabled for this chart — clear any running timer
            if (!chart.autoRefreshMins) {
                if (autoRefreshIntervalsRef.current[chart.id]) {
                    clearInterval(autoRefreshIntervalsRef.current[chart.id]);
                    delete autoRefreshIntervalsRef.current[chart.id];
                    delete autoRefreshIntervalsRef.current[`${chart.id}_total`];
                    setAutoRefreshCountdown(prev => { const n = { ...prev }; delete n[chart.id]; return n; });
                }
                return;
            }

            const mins = chart.autoRefreshMins;
            const totalSecs = mins * 60;
            const existingInterval = autoRefreshIntervalsRef.current[chart.id];

            // Skip if this chart's interval is already running with the same timing
            const currentCountdown = autoRefreshIntervalsRef.current[`${chart.id}_total`];
            if (existingInterval && currentCountdown === totalSecs) return;

            // Timing changed — clear only this chart's old interval
            if (existingInterval) clearInterval(existingInterval);

            autoRefreshIntervalsRef.current[`${chart.id}_total`] = totalSecs;
            setAutoRefreshCountdown(prev => ({ ...prev, [chart.id]: totalSecs }));

            autoRefreshIntervalsRef.current[chart.id] = setInterval(() => {
                setAutoRefreshCountdown(prev => {
                    const remaining = (prev[chart.id] ?? totalSecs) - 1;
                    if (remaining <= 0) {
                        // Trigger refresh using latest chart state from ref
                        const latestChart = chartsForTimerRef.current.find(c => c.id === chart.id);
                        const isNumberChart = latestChart?.chartType?.value === 'number';
                        if (latestChart && (isNumberChart ? (latestChart.yAxis && latestChart.aggregation) : (latestChart.xAxis && latestChart.yAxis && latestChart.aggregation))) {
                            fetchChartDataFromBackend(latestChart.id, latestChart, true);
                        }
                        autoRefreshIntervalsRef.current[`${chart.id}_total`] = totalSecs;
                        return { ...prev, [chart.id]: totalSecs };
                    }
                    return { ...prev, [chart.id]: remaining };
                });
            }, 1000);
        });
        // No return/cleanup here — we handle per-chart cleanup above
        // Global cleanup on unmount is handled by the effect below
    }, [charts.map(c => `${c.id}:${c.autoRefreshMins ?? 'off'}`).join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

    // Clear all auto-refresh intervals on component unmount only
    useEffect(() => {
        return () => {
            Object.keys(autoRefreshIntervalsRef.current)
                .filter(k => !k.includes('_total'))
                .forEach(k => clearInterval(autoRefreshIntervalsRef.current[k]));
        };
    }, []);

    // Safety net: if chartsReady is still false after 10 s (auth/admins chain stuck),
    // unblock the UI so the user isn't trapped on the loading mask indefinitely.
    useEffect(() => {
        const timer = setTimeout(() => {
            setChartsReady(prev => {
                if (!prev) console.warn('AnalyticsDashboard: chartsReady timeout — forcing ready state');
                return true;
            });
        }, 10000);
        return () => clearTimeout(timer);
    }, []); // runs once on mount

    // Load charts whenever account or viewingAs changes
    useEffect(() => {
        if (!acctId || !viewingAs) return;

        // handleViewAsChange already loaded charts for this viewingAs — skip to avoid a double render
        if (skipViewingAsEffectRef.current) {
            skipViewingAsEffectRef.current = false;
            return;
        }

        skipSaveRef.current = true;
        const saved = loadCharts(acctId, viewingAs);

        if (saved.length === 0) {
            // localStorage has no charts for this viewingAs user — try fetching from backend
            handleSchemaSync(acctId, viewingAs);
            return;
        }

        const restored = saved.map(entry => normalizeChart(entry));
        chartsRef.current = restored;
        setCharts(restored);
        setChartsReady(true);
        setChartRequestSignatures(Object.fromEntries(restored.map(chart => [chart.id, getChartRequestSignature(chart)])));
        setNextChartId(restored.length > 0 ? Math.max(...restored.map(c => c.id)) + 1 : 1);
        setChartDataCache({});
        setCollectionFieldsCache({});
        fieldsFetchPromisesRef.current = {};

        // Fetch field schemas for used collections
        const usedCollections = [...new Set(restored.map(c => c.chartCollection?._id || c.chartCollection).filter(Boolean))];
        usedCollections.forEach(catId => fetchFieldsForCollection(catId));

        // Fetch initial data
        restored.forEach(chart => {
            const isNum = chart.chartType?.value === 'number';
            if (isNum ? (chart.yAxis && chart.aggregation) : (chart.xAxis && chart.yAxis && chart.aggregation)) {
                fetchChartDataFromBackend(chart.id, chart, true);
            }
        });
    }, [acctId, viewingAs]); // eslint-disable-line react-hooks/exhaustive-deps

    // Persist charts whenever they change (skip on load)
    useEffect(() => {
        chartsRef.current = charts; // always keep ref current
        if (skipSaveRef.current) { skipSaveRef.current = false; return; }
        if (!acctId || !viewingAs) return;
        saveCharts(acctId, viewingAs, charts);
    }, [charts, acctId, viewingAs]); // eslint-disable-line react-hooks/exhaustive-deps

    // Fetch collections
    const fetchCollections = async () => {
        if (!acctId) return;
        setCollectionLoading(true);
        try {
            const response = await api.get('/api/ui/leads/collections', { params: { acctId } });
            const d = response.data;
            const raw = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : Array.isArray(d?.collections) ? d.collections : [];
            const filtered = raw.filter(item => item?._id && item?.collectionName);
            setCollections(filtered);
        } catch (err) {
            console.error('Error fetching collections:', err);
        } finally {
            setCollectionLoading(false);
        }
    };

    // Fetch collections when acctId changes
    useEffect(() => {
        fetchCollections();
    }, [acctId]);

    // Fetch admins for View As dropdown.
    // Runs once per account. Identifies the logged-in user by their lead-app userId,
    // sets viewingAs to that userId (the key AnalyticsSchema is stored under), then lets
    // the chart-loading effect handle localStorage vs backend.
    useEffect(() => {
        if (!acctId) return;

        // Already loaded for this account — prevent double-run when userDetails updates
        if (adminsLoadedForAcctRef.current === acctId) return;

        // The canonical identity is the lead-app userId (admin records no longer store email).
        const currentUserId = rawUser?.userId || localStorage.getItem('userId') || '';
        if (!currentUserId) return; // wait — auth not ready yet, effect will re-run

        adminsLoadedForAcctRef.current = acctId; // mark as loaded for this account

        api.get('/api/ui/admins/list', { params: { acctId, limit: 200 } })
            .then(res => {
                const data = res.data;
                const list = Array.isArray(data) ? data : (data.admins || data.data || []);
                setViewAsAdmins(list);

                if (list.length === 0) {
                    // No admins — unblock the UI
                    setChartsReady(true);
                    return;
                }

                // Helper: find admin by lead-app userId (canonical key for AnalyticsSchema)
                const findByUserId = (id) => id
                    ? list.find(a => String(a.userId || '') === String(id))
                    : null;

                // The current user's own admin record
                const currentUserAdmin = findByUserId(currentUserId);
                localStorage.setItem('currentUserAdmin', currentUserId);

                // Resolve which admin to select:
                //   1. A previously persisted "View As" choice (different admin, stored per account)
                //   2. Default to the current user's own record
                const storedViewingAs = localStorage.getItem(`analyticsViewingAs_${acctId}`);
                let adminToSelect = null;
                if (storedViewingAs) {
                    adminToSelect = findByUserId(storedViewingAs);
                }
                if (!adminToSelect) {
                    adminToSelect = currentUserAdmin || findByUserId(localStorage.getItem('currentUserAdmin'));
                }

                if (!adminToSelect) {
                    // No admin match — unblock the UI with an empty dashboard
                    setChartsReady(true);
                    return;
                }

                setViewAsAdmin(adminToSelect);

                // Set viewingAs to the user's userId — this is the ONLY trigger for chart loading.
                // The chart-loading effect [acctId, viewingAs] will fire next and:
                //   - load from localStorage if a schema exists there (no backend call), or
                //   - call handleSchemaSync (backend) if no localStorage schema exists.
                const viewingAsId = String(adminToSelect.userId || '');
                if (viewingAsId) {
                    setViewingAs(viewingAsId);
                }
            })
            .catch(() => {
                // Admins fetch failed — unblock the UI so it doesn't stay stuck on the loading mask
                setChartsReady(true);
            });
    }, [acctId, userDetails, rawUser]);
    // Handle View As selection change
    const handleViewAsChange = async (selectedAdmin) => {
        if (!acctId) {
            console.error('Cannot change view: no account selected');
            return;
        }

        await executeViewAsChange(selectedAdmin);
    };

    // The actual admin switch — called either directly or after the user confirms the warning
    const executeViewAsChange = async (selectedAdmin) => {
        const currentUserId = localStorage.getItem('userId');

        if (!acctId) {
            console.error('Cannot change view: no account selected');
            return;
        }

        // Close dropdown and update selected admin immediately for instant UI feedback
        setViewAsAdmin(selectedAdmin);
        setViewAsAvatarError(false);
        setViewAsOpen(false);
        setChartsReady(false);

        try {
            // Selected user's identity is the lead-app userId — the key AnalyticsSchema uses.
            const selectedUserId = selectedAdmin ? (selectedAdmin.userId || null) : null;

            // Call backend with acctId, userId, and selectedUserId
            const response = await api.post('/api/ui/analytics/view-as', {
                acctId: acctId,
                userId: currentUserId,
                selectedUserId: selectedUserId
            });

            // Extract viewingAs and schema from backend response
            const viewingAsId = response.data?.viewingAs || null;
            const schema = response.data?.schema || null;

            // If backend returned a schema, save it to localStorage — but only when NOT
            // switching back to own admin. For own admin, localStorage is the source of truth
            // (it may contain unsaved work that hasn't been pushed to DB yet).
            const isOwnAdmin = viewingAsId && viewingAsId === localStorage.getItem('currentUserAdmin');
            const localCharts = isOwnAdmin ? loadCharts(acctId, viewingAsId) : [];

            if (isOwnAdmin && localCharts.length > 0) {
                // Own admin — prefer localStorage over DB schema
                const restored = localCharts.map(entry => normalizeChart(entry));
                skipSaveRef.current = true;
                chartsRef.current = restored;
                setCharts(restored);
                setNextChartId(restored.length > 0 ? Math.max(...restored.map(c => c.id)) + 1 : 1);
                setChartRequestSignatures(Object.fromEntries(restored.map(chart => [chart.id, getChartRequestSignature(chart)])));
                setChartDataCache({});

                const usedCollections = [...new Set(restored.map(c => c.chartCollection?._id || c.chartCollection).filter(Boolean))];
                usedCollections.forEach(catId => fetchFieldsForCollection(catId));
                restored.forEach(chart => {
                    const isNum = chart.chartType?.value === 'number';
                    if (isNum ? (chart.yAxis && chart.aggregation) : (chart.xAxis && chart.yAxis && chart.aggregation)) {
                        fetchChartDataFromBackend(chart.id, chart, true);
                    }
                });
                setChartsReady(true);
                skipViewingAsEffectRef.current = true;
            } else if (schema && viewingAsId) {
                const store = readStore();
                store[acctId] = store[acctId] || {};
                store[acctId][viewingAsId] = schema;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(store));

                // Load the charts from the schema
                const filters = schema?.filters || [];
                const restored = filters.map(entry => normalizeChart(entry));
                skipSaveRef.current = true;
                chartsRef.current = restored;
                setCharts(restored);
                setNextChartId(restored.length > 0 ? Math.max(...restored.map(c => c.id)) + 1 : 1);
                setChartRequestSignatures(Object.fromEntries(restored.map(chart => [chart.id, getChartRequestSignature(chart)])));
                setChartDataCache({});

                // Fetch field schemas for used collections
                const usedCollections = [...new Set(restored.map(c => c.chartCollection?._id || c.chartCollection).filter(Boolean))];
                usedCollections.forEach(catId => fetchFieldsForCollection(catId));

                // Fetch chart data
                restored.forEach(chart => {
                    const isNum = chart.chartType?.value === 'number';
                    if (isNum ? (chart.yAxis && chart.aggregation) : (chart.xAxis && chart.yAxis && chart.aggregation)) {
                        fetchChartDataFromBackend(chart.id, chart, true);
                    }
                });

                // Charts already loaded above — tell the viewingAs useEffect to skip duplicate work
                skipViewingAsEffectRef.current = true;
            } else if (viewingAsId) {
                // Backend returned no schema inline — clean up any stale localStorage entry,
                // but only if this is NOT own admin (own admin localStorage is the source of truth).
                if (!isOwnAdmin) {
                    const store = readStore();
                    if (store[acctId]) {
                        delete store[acctId][viewingAsId];
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
                    }
                }
            }

            // Update the viewingAs state (triggers the useEffect to load charts when no schema was provided by the branch above)
            setViewingAs(viewingAsId);

            // Persist the selected admin so the choice survives page refresh.
            // If the user has switched back to their own admin, clear the persisted key.
            const currentUserAdminId = localStorage.getItem('currentUserAdmin');
            if (viewingAsId && viewingAsId !== currentUserAdminId) {
                localStorage.setItem(`analyticsViewingAs_${acctId}`, viewingAsId);
            } else {
                localStorage.removeItem(`analyticsViewingAs_${acctId}`);
            }

            console.log('View As changed:', selectedAdmin ? getAdminDisplayName(selectedAdmin) : 'All Admins', '| viewingAs:', viewingAsId);
        } catch (error) {
            console.error('Error changing view:', error);
            setChartsReady(true); // Unblock UI if backend call fails
        }
    };

    // Close View As dropdown on outside click
    useEffect(() => {
        if (!viewAsOpen) return;
        const handleClickOutside = (e) => {
            if (viewAsRef.current && !viewAsRef.current.contains(e.target)) setViewAsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [viewAsOpen]);

    const fetchFieldsForCollection = async (catId) => {
        if (!catId || !acctId) return [];
        if (collectionFieldsCache[catId]?.length > 0) return collectionFieldsCache[catId];
        // Deduplicate concurrent requests for the same collection
        const promiseKey = `${catId}__${acctId}`;
        if (fieldsFetchPromisesRef.current[promiseKey]) {
            return await fieldsFetchPromisesRef.current[promiseKey];
        }

        const promise = (async () => {
            try {
                const response = await api.get(`/api/ui/leads/collections/${catId}/fields`, { params: { acctId } });
                const rawFields = response.data?.data?.fields || [];
                const present = new Set(rawFields.map(f => f.field));

                // Ensure the selectable system axes (responsible, stage) are always
                // available for charts, even when the collection stored its fields
                // without them — otherwise a saved xAxis/yAxis of "responsible"/"stage"
                // has no matching option on reload and appears to not persist.
                const allFields = [
                    ...rawFields,
                    ...(!present.has('responsible') ? [{ field: 'responsible', label: 'Responsible', type: 'text', system: true }] : []),
                    ...(!present.has('stage') ? [{ field: 'stage', label: 'Stage', type: 'stage', system: true }] : []),
                    // Append system timestamp fields as column options
                    { field: 'createdAt', label: 'Created At', type: 'date' },
                    { field: 'updatedAt', label: 'Updated At', type: 'date' },
                ];

                setCollectionFieldsCache(prev => ({ ...prev, [catId]: allFields }));
                return allFields;
            } catch (err) {
                console.error('Error fetching fields:', err);
                return [];
            } finally {
                delete fieldsFetchPromisesRef.current[promiseKey];
            }
        })();

        fieldsFetchPromisesRef.current[promiseKey] = promise;
        return await promise;
    };

    // Get chart data from cache
    const getChartData = (chartConfig, chartId) => {
        return chartDataCache[chartId] || [];
    };

    // Colors for charts - Vibrant palette
    const COLORS = [
        '#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#3b82f6',
        '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#06b6d4',
        '#84cc16', '#a855f7', '#22c55e', '#eab308', '#ef4444'
    ];

    // Shared modern legend renderer — pill chips with color swatch
    const legendChips = ({ payload }) => {
        if (!payload || !payload.length) return null;
        return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', padding: '6px 12px 2px' }}>
                {payload.map((entry, i) => {
                    // entry.color may be a gradient URL reference (e.g. "url(#pieGrad-0)") when
                    // Cell uses radial gradients — extract the real hex from COLORS by index instead.
                    const rawColor = entry.color || '';
                    const color = rawColor.startsWith('url(') ? COLORS[i % COLORS.length] : (rawColor || COLORS[i % COLORS.length]);
                    return (
                        <div key={i} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 9px 3px 6px',
                            borderRadius: 20,
                            background: `${color}14`,
                            border: `1px solid ${color}40`,
                            lineHeight: 1,
                        }}>
                            <svg width="8" height="8" viewBox="0 0 8 8" style={{ flexShrink: 0, display: 'block' }}>
                                <circle cx="4" cy="4" r="4" fill={color} />
                            </svg>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', letterSpacing: 0.1, lineHeight: 1, verticalAlign: 'middle' }}>
                                {entry.value}
                            </span>
                        </div>
                    );
                })}
            </div>
        );
    };

    // External legend div — same visual style as legendChips but renders as a plain DOM element
    // outside the ResponsiveContainer so it is reliably captured in PDF exports.
    const renderExternalLegend = (items) => (
        <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '6px',
            justifyContent: 'center', padding: '6px 16px 10px',
            flexShrink: 0,
        }}>
            {items.map(({ label, color }, i) => (
                <div key={i} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '3px 10px 3px 7px',
                    borderRadius: 20,
                    background: `${color}12`,
                    border: `1px solid ${color}38`,
                }}>
                    <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: color, flexShrink: 0,
                        boxShadow: `0 0 0 2px ${color}28`,
                        display: 'inline-block',
                    }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', letterSpacing: 0.1, whiteSpace: 'nowrap' }}>
                        {label}
                    </span>
                </div>
            ))}
        </div>
    );
    const DEFAULT_CHART_COLOR = '#6366f1';
    const COLOR_OPTIONS = [
        '#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#3b82f6',
        '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#22c55e', '#1a1a1a'
    ];

    // Shared attractive tooltip style
    const tooltipStyle = {
        contentStyle: {
            backgroundColor: 'rgba(255,255,255,0.98)',
            border: 'none',
            borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            padding: '12px 16px',
            fontSize: '13px'
        },
        labelStyle: { color: '#1e293b', fontWeight: 700, marginBottom: 4 },
        itemStyle: { color: '#64748b' },
        cursor: { fill: 'rgba(99,102,241,0.06)' }
    };

    // ── Stable pie callout label — rendered by Recharts' own label pipeline so
    // coordinates are exact, but wrapped in React.memo so it never re-renders on
    // hover (the only source of the previous flicker).
    const PieCalloutLabel = React.memo(({ cx, cy, midAngle, outerRadius, percent, name, value, index, total, lbl, colors }) => {
        if (percent < 0.03) return null;
        const RADIAN = Math.PI / 180;
        const color = colors[index % colors.length];
        const cos = Math.cos(-midAngle * RADIAN);
        const sin = Math.sin(-midAngle * RADIAN);

        const sx = cx + (outerRadius + 6) * cos;
        const sy = cy + (outerRadius + 6) * sin;
        const mx = cx + (outerRadius + 22) * cos;
        const my = cy + (outerRadius + 22) * sin;
        const goRight = cos >= 0;
        const ex = mx + (goRight ? 20 : -20);
        const ey = my;
        const anchor = goRight ? 'start' : 'end';
        const tx = ex + (goRight ? 4 : -4);

        const resolved = lbl(name);
        const rawName = resolved == null || resolved === '' ? '\u2014' : String(resolved);
        const maxLen = 15;
        const displayName = rawName.length > maxLen ? rawName.slice(0, maxLen - 1) + '\u2026' : rawName;
        const pct = (percent * 100).toFixed(1);

        return (
            <g>
                <path
                    d={`M${sx},${sy} L${mx},${my} L${ex},${ey}`}
                    stroke={color} strokeWidth={1.3} fill="none"
                    strokeLinecap="round" strokeOpacity={0.65}
                />
                <circle cx={sx} cy={sy} r={2.5} fill={color} fillOpacity={0.8} />
                <text x={tx} y={ey - 5} textAnchor={anchor}
                    fill="#1e293b" fontSize={10} fontWeight={600}>
                    {displayName}
                </text>
                <text x={tx} y={ey + 8} textAnchor={anchor}
                    fill="#64748b" fontSize={9}>
                    {(value ?? 0).toLocaleString()} ({pct}%)
                </text>
            </g>
        );
    });

    // Render Pie Chart — donut with stable callout labels + stable external legend
    const renderPieChart = (chartData, yAxisLabel, showLegend = true, showDataLabels = true, lbl = (k) => k) => {
        const total = chartData.reduce((s, d) => s + d.value, 0);

        // Build stable label renderer — bound to this chart's data so memo comparison works
        const labelRenderer = showDataLabels
            ? (props) => <PieCalloutLabel {...props} total={total} lbl={lbl} colors={COLORS} />
            : false;

        // activeShape: keep the sector visually identical on hover — prevents outerRadius change
        // which was causing Recharts to re-render the label layer and make labels disappear
        const stableActiveShape = (props) => {
            const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
            return (
                <g>
                    <Sector
                        cx={cx} cy={cy}
                        innerRadius={innerRadius}
                        outerRadius={outerRadius}
                        startAngle={startAngle}
                        endAngle={endAngle}
                        fill={fill}
                    />
                </g>
            );
        };

        return (
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
                <div style={{ flex: 1, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart margin={{ top: 35, right: 80, bottom: 35, left: 80 }}>
                            <defs>
                                {COLORS.map((color, i) => (
                                    <radialGradient key={i} id={`pieGrad-${i}`} cx="50%" cy="50%" r="50%">
                                        <stop offset="0%" stopColor={color} stopOpacity={1} />
                                        <stop offset="100%" stopColor={color} stopOpacity={0.75} />
                                    </radialGradient>
                                ))}
                            </defs>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={55}
                                outerRadius={95}
                                paddingAngle={3}
                                dataKey="value"
                                isAnimationActive={false}
                                labelLine={false}
                                label={labelRenderer}
                                activeShape={stableActiveShape}
                            >
                                {chartData.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={`url(#pieGrad-${index % COLORS.length})`}
                                        stroke="white"
                                        strokeWidth={2}
                                    />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={tooltipStyle.contentStyle}
                                labelStyle={tooltipStyle.labelStyle}
                                itemStyle={tooltipStyle.itemStyle}
                                formatter={(value, name) => [`${value.toLocaleString()} (${total > 0 ? ((value / total) * 100).toFixed(1) : 0}%)`, lbl(name)]}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                {/* External legend — stable div, never inside SVG, never flickers */}
                {showLegend && (
                    <div style={{
                        display: 'flex', flexWrap: 'wrap', gap: '6px',
                        justifyContent: 'center', padding: '6px 16px 10px',
                        flexShrink: 0,
                    }}>
                        {chartData.map((entry, i) => {
                            const color = COLORS[i % COLORS.length];
                            return (
                                <div key={i} style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                    padding: '3px 10px 3px 7px',
                                    borderRadius: 20,
                                    background: `${color}12`,
                                    border: `1px solid ${color}38`,
                                }}>
                                    <span style={{
                                        width: 8, height: 8, borderRadius: '50%',
                                        background: color, flexShrink: 0,
                                        boxShadow: `0 0 0 2px ${color}28`,
                                    }} />
                                    <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', letterSpacing: 0.1, whiteSpace: 'nowrap' }}>
                                        {lbl(entry.name)} ({entry.value.toLocaleString()})
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    // Render Bar Chart — gradient bars, clean grid
    const fmtDateTick = (v) => {
        if (!v || typeof v !== 'string') return v;
        // YYYY-MM-DD → DD.MM.YYYY
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) return `${m[3]}.${m[2]}.${m[1]}`;
        return v;
    };

    const renderBarChart = (chartData, yAxisLabel, orientation = 'vertical', showLegend = true, showDataLabels = true, lbl = (k) => k, fmtTick = (v) => v) => {
        const isHorizontal = orientation === 'horizontal';
        const legendItems = [{ label: lbl(yAxisLabel), color: COLORS[0] }];
        return (
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
                <div style={{ flex: 1, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={chartData}
                            layout={isHorizontal ? 'vertical' : 'horizontal'}
                            margin={isHorizontal
                                ? { top: 10, right: showDataLabels ? 48 : 30, left: 80, bottom: 10 }
                                : { top: showDataLabels ? 22 : 10, right: 20, left: 10, bottom: 40 }
                            }
                        >
                            <defs>
                                {COLORS.map((color, i) => (
                                    <linearGradient key={i} id={`barGrad-${i}`} x1="0" y1="0" x2={isHorizontal ? '1' : '0'} y2={isHorizontal ? '0' : '1'}>
                                        <stop offset="0%" stopColor={color} stopOpacity={1} />
                                        <stop offset="100%" stopColor={color} stopOpacity={0.45} />
                                    </linearGradient>
                                ))}
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={!isHorizontal} vertical={isHorizontal} />
                            {isHorizontal ? (
                                <>
                                    <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <YAxis type="category" dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} width={75} />
                                </>
                            ) : (
                                <>
                                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} angle={-45} textAnchor="end" height={60} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} tickFormatter={fmtTick} />
                                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                </>
                            )}
                            <Tooltip
                                contentStyle={tooltipStyle.contentStyle}
                                labelStyle={tooltipStyle.labelStyle}
                                itemStyle={tooltipStyle.itemStyle}
                                cursor={tooltipStyle.cursor}
                                formatter={(value) => [value.toLocaleString(), lbl(yAxisLabel)]}
                                labelFormatter={fmtTick}
                            />
                            <Bar
                                dataKey="value"
                                name={lbl(yAxisLabel)}
                                radius={isHorizontal ? [0, 8, 8, 0] : [8, 8, 0, 0]}
                                maxBarSize={60}
                                isAnimationActive={false}
                            >
                                {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={`url(#barGrad-${index % COLORS.length})`} />
                                ))}
                                {showDataLabels && (
                                    <LabelList
                                        dataKey="value"
                                        position={isHorizontal ? 'right' : 'top'}
                                        formatter={(v) => v.toLocaleString()}
                                        style={{ fontSize: 10, fill: '#374151', fontWeight: 600 }}
                                    />
                                )}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                {showLegend && renderExternalLegend(legendItems)}
            </div>
        );
    };

    // Render Line Chart — area chart with gradient fill
    const renderLineChart = (chartData, yAxisLabel, color = DEFAULT_CHART_COLOR, showLegend = true, showDataLabels = true, lbl = (k) => k, fmtTick = (v) => v) => (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
            <div style={{ flex: 1, minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: showDataLabels ? 22 : 10, right: 20, left: 10, bottom: 40 }}>
                        <defs>
                            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={color} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis
                            dataKey="name"
                            tick={{ fill: '#64748b', fontSize: 11 }}
                            angle={-45}
                            textAnchor="end"
                            height={60}
                            axisLine={{ stroke: '#e2e8f0' }}
                            tickLine={false}
                            tickFormatter={fmtTick}
                        />
                        <YAxis
                            tick={{ fill: '#64748b', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip
                            contentStyle={tooltipStyle.contentStyle}
                            labelStyle={tooltipStyle.labelStyle}
                            itemStyle={tooltipStyle.itemStyle}
                            cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: '4 4' }}
                            formatter={(value) => [value.toLocaleString(), lbl(yAxisLabel)]}
                            labelFormatter={fmtTick}
                        />
                        <Area
                            type="monotone"
                            dataKey="value"
                            name={lbl(yAxisLabel)}
                            stroke={color}
                            strokeWidth={3}
                            fill="url(#areaGrad)"
                            dot={{ fill: color, stroke: 'white', strokeWidth: 2, r: 5 }}
                            activeDot={{ r: 7, fill: color, stroke: 'white', strokeWidth: 2 }}
                            isAnimationActive={false}
                        >
                            {showDataLabels && (
                                <LabelList
                                    dataKey="value"
                                    position="top"
                                    offset={8}
                                    formatter={(v) => v.toLocaleString()}
                                    style={{ fontSize: 10, fill: '#374151', fontWeight: 600 }}
                                />
                            )}
                        </Area>
                    </AreaChart>
                </ResponsiveContainer>
            </div>
            {showLegend && renderExternalLegend([{ label: lbl(yAxisLabel), color }])}
        </div>
    );

    // ── Grouped / Multi-Series Line ───────────────────────────────────────
    const renderMultiSeriesLineChart = (chartData, yAxisLabel, showLegend = true, showDataLabels = true, lbl = (k) => k, fmtTick = (v) => v) => {
        const hasZKey = chartData.length > 0 && chartData[0].zKey !== undefined;
        if (!hasZKey) return renderLineChart(chartData, yAxisLabel, DEFAULT_CHART_COLOR, showLegend, showDataLabels, lbl, fmtTick);
        const names = [...new Set(chartData.map(d => d.name))];
        const zKeys = [...new Set(chartData.map(d => d.zKey))];
        const data = names.map(name => {
            const entry = { name };
            zKeys.forEach(zKey => {
                const found = chartData.find(d => d.name === name && d.zKey === zKey);
                entry[zKey] = found ? found.value : 0;
            });
            return entry;
        });
        const legendItems = zKeys.map((zKey, i) => ({ label: lbl(zKey), color: COLORS[i % COLORS.length] }));
        return (
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
                <div style={{ flex: 1, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data} margin={{ top: showDataLabels ? 22 : 10, right: 20, left: 10, bottom: 40 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis
                                dataKey="name"
                                tick={{ fill: '#64748b', fontSize: 11 }}
                                angle={-45}
                                textAnchor="end"
                                height={60}
                                axisLine={{ stroke: '#e2e8f0' }}
                                tickLine={false}
                                tickFormatter={fmtTick}
                            />
                            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                            <Tooltip
                                contentStyle={tooltipStyle.contentStyle}
                                labelStyle={tooltipStyle.labelStyle}
                                itemStyle={tooltipStyle.itemStyle}
                                cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '4 4' }}
                                formatter={(value) => [value.toLocaleString()]}
                                labelFormatter={fmtTick}
                            />
                            {zKeys.map((zKey, i) => (
                                <Line
                                    key={zKey}
                                    type="monotone"
                                    dataKey={zKey}
                                    name={lbl(zKey)}
                                    stroke={COLORS[i % COLORS.length]}
                                    strokeWidth={2.5}
                                    dot={{ fill: COLORS[i % COLORS.length], stroke: 'white', strokeWidth: 2, r: 4 }}
                                    activeDot={{ r: 6, stroke: 'white', strokeWidth: 2 }}
                                    isAnimationActive={false}
                                >
                                    {showDataLabels && (
                                        <LabelList
                                            dataKey={zKey}
                                            position="top"
                                            offset={8}
                                            formatter={(v) => (v > 0 ? v.toLocaleString() : '')}
                                            style={{ fontSize: 10, fill: '#374151', fontWeight: 600 }}
                                        />
                                    )}
                                </Line>
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                </div>
                {showLegend && renderExternalLegend(legendItems)}
            </div>
        );
    };

    // Render Heat Map — colored tile grid, intensity proportional to value
    const renderHeatmapChart = (chartData, yAxisLabel, color = DEFAULT_CHART_COLOR) => {
        const max = Math.max(...chartData.map(d => d.value));
        const min = Math.min(...chartData.map(d => d.value));
        const range = max - min || 1;
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return (
            <div className="w-full h-full overflow-auto p-4">
                <div className="flex items-center gap-3 mb-3 flex-wrap">
                    <span className="text-xs text-gray-500 font-medium">Scale:</span>
                    {[0, 0.25, 0.5, 0.75, 1].map(i => (
                        <div key={i} className="flex items-center gap-1">
                            <div className="w-4 h-4 rounded" style={{ backgroundColor: `rgba(${r},${g},${b},${0.1 + i * 0.9})` }} />
                            <span className="text-[10px] text-gray-500">{Math.round(min + i * range).toLocaleString()}</span>
                        </div>
                    ))}
                </div>
                <div className="flex flex-wrap gap-2">
                    {chartData.map((entry, index) => {
                        const intensity = (entry.value - min) / range;
                        return (
                            <div
                                key={index}
                                title={`${entry.name}: ${entry.value.toLocaleString()} ${yAxisLabel}`}
                                style={{ backgroundColor: `rgba(${r},${g},${b},${0.1 + intensity * 0.9})` }}
                                className="flex flex-col items-center justify-center rounded-xl p-3 min-w-[72px] cursor-default transition-transform duration-150 hover:scale-110 hover:shadow-md"
                            >
                                <span className="text-sm font-black leading-none" style={{ color: intensity > 0.55 ? 'white' : '#1e293b' }}>
                                    {entry.value.toLocaleString()}
                                </span>
                                <span className="text-[10px] mt-1 max-w-[80px] text-center leading-tight overflow-hidden" style={{ color: intensity > 0.55 ? 'rgba(255,255,255,0.8)' : '#64748b', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                    {entry.name}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // Render Number Chart — large KPI total with top-N breakdown
    const renderNumberChart = (chartData, yAxisLabel, color = DEFAULT_CHART_COLOR, splitCount = 4) => {
        const total = chartData.reduce((sum, d) => sum + (d.value || 0), 0);
        const fmt = (n) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : n.toLocaleString();
        const topItems = splitCount > 0 ? [...chartData].sort((a, b) => b.value - a.value).slice(0, splitCount) : [];
        return (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-6">
                <div className="text-center">
                    <div className="text-7xl font-black tracking-tighter leading-none" style={{ color }}>
                        {fmt(total)}
                    </div>
                    <div className="text-sm text-gray-500 mt-3 font-medium uppercase tracking-widest">{yAxisLabel}</div>
                </div>
                {topItems.length > 1 && (
                    <div className="flex flex-wrap justify-center gap-3 mt-2">
                        {topItems.map((item, i) => (
                            <div key={i} className="text-center rounded-xl px-4 py-2 border min-w-[80px]" style={{ backgroundColor: `${color}10`, borderColor: `${color}30` }}>
                                <div className="text-lg font-bold" style={{ color }}>{item.value.toLocaleString()}</div>
                                <div className="text-[11px] text-gray-500 truncate max-w-[100px]">{item.name}</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    // ── Grouped / Stacked Bar ─────────────────────────────────────────────
    const renderMultiSeriesBarChart = (chartData, yAxisLabel, orientation = 'vertical', stacked = false, showLegend = true, showDataLabels = true, lbl = (k) => k, fmtTick = (v) => v) => {
        const hasZKey = chartData.length > 0 && chartData[0].zKey !== undefined;
        if (!hasZKey) return renderBarChart(chartData, yAxisLabel, orientation, showLegend, showDataLabels, lbl, fmtTick);
        const isHorizontal = orientation === 'horizontal';
        const names = [...new Set(chartData.map(d => d.name))];
        const zKeys = [...new Set(chartData.map(d => d.zKey))];
        const data = names.map(name => {
            const entry = { name };
            zKeys.forEach(zKey => {
                const found = chartData.find(d => d.name === name && d.zKey === zKey);
                entry[zKey] = found ? found.value : 0;
            });
            return entry;
        });
        const legendItems = zKeys.map((zKey, i) => ({ label: lbl(zKey), color: COLORS[i % COLORS.length] }));
        return (
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
                <div style={{ flex: 1, minHeight: 0 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={data}
                            layout={isHorizontal ? 'vertical' : 'horizontal'}
                            margin={isHorizontal
                                ? { top: 10, right: showDataLabels ? 48 : 30, left: 80, bottom: 10 }
                                : { top: showDataLabels ? 22 : 10, right: 20, left: 10, bottom: 40 }
                            }
                        >
                            <defs>
                                {COLORS.map((color, i) => (
                                    <linearGradient key={i} id={`msBarGrad-${i}`} x1="0" y1="0" x2={isHorizontal ? '1' : '0'} y2={isHorizontal ? '0' : '1'}>
                                        <stop offset="0%" stopColor={color} stopOpacity={1} />
                                        <stop offset="100%" stopColor={color} stopOpacity={0.5} />
                                    </linearGradient>
                                ))}
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={!isHorizontal} vertical={isHorizontal} />
                            {isHorizontal ? (
                                <>
                                    <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <YAxis type="category" dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} width={75} />
                                </>
                            ) : (
                                <>
                                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} angle={-35} textAnchor="end" height={55} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} tickFormatter={fmtTick} />
                                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                </>
                            )}
                            <Tooltip
                                contentStyle={tooltipStyle.contentStyle}
                                labelStyle={tooltipStyle.labelStyle}
                                itemStyle={tooltipStyle.itemStyle}
                                cursor={tooltipStyle.cursor}
                                formatter={(value) => [value.toLocaleString()]}
                                labelFormatter={fmtTick}
                            />
                            {zKeys.map((zKey, i) => (
                                <Bar
                                    key={zKey}
                                    dataKey={zKey}
                                    name={lbl(zKey)}
                                    fill={`url(#msBarGrad-${i % COLORS.length})`}
                                    stackId={stacked ? 'a' : undefined}
                                    radius={stacked
                                        ? (i === zKeys.length - 1 ? (isHorizontal ? [0, 8, 8, 0] : [8, 8, 0, 0]) : [0, 0, 0, 0])
                                        : (isHorizontal ? [0, 6, 6, 0] : [6, 6, 0, 0])
                                    }
                                    maxBarSize={stacked ? 80 : 50}
                                    isAnimationActive={false}
                                >
                                    {showDataLabels && (
                                        <LabelList
                                            dataKey={zKey}
                                            position={stacked ? 'center' : (isHorizontal ? 'right' : 'top')}
                                            formatter={(v) => (v > 0 ? v.toLocaleString() : '')}
                                            style={{
                                                fontSize: 10,
                                                fill: stacked ? 'white' : '#374151',
                                                fontWeight: 600,
                                            }}
                                        />
                                    )}
                                </Bar>
                            ))}
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                {showLegend && renderExternalLegend(legendItems)}
            </div>
        );
    };

    // ── Nested Pie (Grouped — inner=X-axis, outer=Z-axis breakdown) ────────
    const renderNestedPieChart = (chartData, yAxisLabel, showLegend = true, showDataLabels = true, lbl = (k) => k) => {
        const hasZKey = chartData.length > 0 && chartData[0].zKey !== undefined;
        if (!hasZKey) return renderPieChart(chartData, yAxisLabel, showLegend, showDataLabels, lbl);
        const innerMap = {};
        chartData.forEach(d => { innerMap[d.name] = (innerMap[d.name] || 0) + d.value; });
        const innerData = Object.entries(innerMap).map(([name, value]) => ({ name, value }));
        const outerData = chartData.map(d => ({ name: `${d.name} › ${d.zKey}`, value: d.value }));
        const totalInner = innerData.reduce((s, d) => s + d.value, 0);

        return (
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
                <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                            <defs>
                                {COLORS.map((color, i) => (
                                    <radialGradient key={i} id={`nPieIn-${i}`} cx="50%" cy="50%" r="50%">
                                        <stop offset="0%" stopColor={color} stopOpacity={1} />
                                        <stop offset="100%" stopColor={color} stopOpacity={0.75} />
                                    </radialGradient>
                                ))}
                                {COLORS.map((color, i) => (
                                    <radialGradient key={`o${i}`} id={`nPieOut-${i}`} cx="50%" cy="50%" r="50%">
                                        <stop offset="0%" stopColor={color} stopOpacity={0.85} />
                                        <stop offset="100%" stopColor={color} stopOpacity={0.5} />
                                    </radialGradient>
                                ))}
                            </defs>
                            <Pie data={innerData} cx="50%" cy="50%" innerRadius={40} outerRadius={72} paddingAngle={2} dataKey="value" isAnimationActive={false}>
                                {innerData.map((_, i) => <Cell key={`in-${i}`} fill={`url(#nPieIn-${i % COLORS.length})`} stroke="white" strokeWidth={2} />)}
                            </Pie>
                            <Pie data={outerData} cx="50%" cy="50%" innerRadius={78} outerRadius={115} paddingAngle={1} dataKey="value" isAnimationActive={false}>
                                {outerData.map((_, i) => <Cell key={`out-${i}`} fill={`url(#nPieOut-${i % COLORS.length})`} stroke="white" strokeWidth={1} />)}
                            </Pie>
                            <Tooltip
                                contentStyle={tooltipStyle.contentStyle}
                                labelStyle={tooltipStyle.labelStyle}
                                itemStyle={tooltipStyle.itemStyle}
                                formatter={(value, name) => {
                                    const total = outerData.find(d => d.name === name) ? totalOuter : totalInner;
                                    return [`${value.toLocaleString()} (${pct}%)`, lbl(name)];
                                }}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
                {/* External legend — stable, not part of SVG */}
                {showLegend && (
                    <div style={{
                        display: 'flex', flexWrap: 'wrap', gap: '6px',
                        justifyContent: 'center', padding: '6px 16px 10px',
                        flexShrink: 0,
                    }}>
                        {innerData.map((entry, i) => {
                            const color = COLORS[i % COLORS.length];
                            return (
                                <div key={i} style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                    padding: '3px 10px 3px 7px',
                                    borderRadius: 20,
                                    background: `${color}12`,
                                    border: `1px solid ${color}38`,
                                }}>
                                    <span style={{
                                        width: 8, height: 8, borderRadius: '50%',
                                        background: color, flexShrink: 0,
                                        boxShadow: `0 0 0 2px ${color}28`,
                                    }} />
                                    <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', letterSpacing: 0.1, whiteSpace: 'nowrap' }}>
                                        {lbl(entry.name)} ({entry.value.toLocaleString()})
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    const renderChart = (chartConfig) => {
        const isLoading = chartLoadingState[chartConfig.id];
        const chartData = getChartData(chartConfig, chartConfig.id);
        const yAxisLabel = chartConfig.yAxis?.label || 'Value';
        const height = chartConfig.chartHeight || 320;
        const isDateXAxis = DATE_AXIS_FIELDS.includes(chartConfig.xAxis?.value);

        if (isLoading) return (
            <div className="flex flex-col items-center justify-center w-full h-full gap-2">
                <div className="relative">
                    <div className="animate-spin rounded-full h-7 w-7 border-2 border-gray-200"></div>
                    <div className="animate-spin rounded-full h-7 w-7 border-2 border-indigo-600 border-t-transparent absolute top-0"></div>
                </div>
                <span className="text-[11px] text-gray-400 font-medium">Loading chart...</span>
            </div>
        );

        if (!chartConfig.chartType) return <div className="flex items-center justify-center h-full text-gray-500 text-sm">Select chart type to begin</div>;
        if (chartConfig.chartType?.value !== 'number' && !chartConfig.xAxis) return <div className="flex items-center justify-center h-full text-gray-500 text-sm">{chartConfig.chartType?.value === 'pie' ? 'Select Group By' : 'Select X axis'}</div>;
        if (!chartConfig.yAxis) return <div className="flex items-center justify-center h-full text-gray-500 text-sm">{chartConfig.chartType?.value === 'pie' ? 'Select Value' : chartConfig.chartType?.value === 'number' ? 'Select Value' : 'Select Y axis'}</div>;
        if (!chartConfig.aggregation) return <div className="flex items-center justify-center h-full text-gray-500 text-sm">Select aggregation type</div>;
        if (!chartData.length) return <div className="flex items-center justify-center h-full text-gray-500 text-sm">No data available</div>;

        const chartColor = chartConfig.chartColor || DEFAULT_CHART_COLOR;
        const mode = chartConfig.chartMode;
        const showLegend = chartConfig.showLegend !== false;
        const showDataLabels = chartConfig.showDataLabels !== false;
        const fieldLabels = chartConfig.fieldLabels || {};
        const lbl = (key) => fieldLabels[key] || key;
        const splitCount = chartConfig.numberSplitCount ?? 0;
        // Apply field label override to yAxisLabel for all chart types
        const displayYLabel = fieldLabels[chartConfig.yAxis?.value] || yAxisLabel;
        switch (chartConfig.chartType.value) {
            case 'pie':
                return (mode === 'grouped' || mode === 'stacked')
                    ? renderNestedPieChart(chartData, displayYLabel, showLegend, showDataLabels, lbl)
                    : renderPieChart(chartData, displayYLabel, showLegend, showDataLabels, lbl);
            case 'bar':
                return mode === 'grouped'
                    ? renderMultiSeriesBarChart(chartData, displayYLabel, chartConfig.barOrientation || 'vertical', false, showLegend, showDataLabels, lbl, isDateXAxis ? fmtDateTick : undefined)
                    : mode === 'stacked'
                        ? renderMultiSeriesBarChart(chartData, displayYLabel, chartConfig.barOrientation || 'vertical', true, showLegend, showDataLabels, lbl, isDateXAxis ? fmtDateTick : undefined)
                        : renderBarChart(chartData, displayYLabel, chartConfig.barOrientation || 'vertical', showLegend, showDataLabels, lbl, isDateXAxis ? fmtDateTick : undefined);
            case 'line':
                return mode === 'grouped'
                    ? renderMultiSeriesLineChart(chartData, displayYLabel, showLegend, showDataLabels, lbl, isDateXAxis ? fmtDateTick : undefined)
                    : renderLineChart(chartData, displayYLabel, chartColor, showLegend, showDataLabels, lbl, isDateXAxis ? fmtDateTick : undefined);
            case 'heatmap':
                return renderHeatmapChart(chartData, displayYLabel, chartColor);
            case 'number':
                return renderNumberChart(chartData, displayYLabel, chartColor, splitCount);
            default:
                return null;
        }
    };

    // True when the current user is viewing another admin's dashboard (read-only mode)
    const isViewingOtherAdmin = (() => {
        try {
            const currentUserId = localStorage.getItem('userId');
            const currentAdminId = localStorage.getItem('currentUserAdmin') || currentUserId;
            return !!(viewingAs && currentAdminId && viewingAs !== currentAdminId);
        } catch {
            return false;
        }
    })();

    // Shared "Update Chart" button used in both header-row (with collections) and no-collection bar
    const renderUpdateChartButton = (chartConfig, mergedConfig) => {
        const id = chartConfig.id;
        const isLoading = submittingCharts[id] || chartLoadingState[id];
        const isSuccess = !!updateSuccess[id];
        const isDirty   = isChartConfigured(mergedConfig) && isChartDirty(mergedConfig, chartConfig);

        // Determine overlay visibility: gray when disabled, green when success
        const showGray    = !isDirty && !isLoading && !isSuccess;
        const showGreen   = isSuccess;

        const handleClick = () => {
            const cfg = mergedConfig;
            const needsFetch = isChartRequestDirty(mergedConfig);
            setSubmittingCharts(prev => ({ ...prev, [id]: true }));
            setCharts(prev => prev.map(c => c.id === id ? { ...c, ...pendingChartConfigs[id] } : c));
            setHasUnsavedChanges(true);
            clearPendingConfig(id);
            if (needsFetch) {
                userFetchInFlightRef.current[id] = true;
                fetchChartDataFromBackend(id, cfg, false, true);
            } else {
                setSubmittingCharts(prev => { const n = { ...prev }; delete n[id]; return n; });
                hideFilter(id);
            }
        };

        // Key drives animate-btn-state re-trigger on every state change
        const contentKey = isSuccess ? 'success' : isLoading ? 'loading' : 'idle';

        return (
            <button
                onClick={handleClick}
                disabled={!isChartConfigured(mergedConfig) || (!isDirty && !isLoading)}
                className={`btn-update flex items-center justify-center px-4 py-2.5 rounded-lg text-xs font-semibold
                    text-white transition-shadow duration-200
                    ${showGray
                        ? 'cursor-not-allowed shadow-none bg-none bg-gray-100'
                        : isLoading
                            ? 'cursor-wait bg-gradient-to-r from-indigo-600 to-violet-600 shadow-md shadow-indigo-500/30'
                            : 'bg-gradient-to-r from-indigo-600 to-violet-600 shadow-md shadow-indigo-500/30 hover:shadow-indigo-500/50'}
                    ${isSuccess ? 'btn-update-success-ring' : ''}
                `}
                title={!isChartConfigured(mergedConfig)
                    ? 'Select the required chart fields first'
                    : isDirty
                        ? 'Update chart data'
                        : 'Change the chart query fields to enable update'}
            >
                {/* Gray overlay — disabled state */}
                <span
                    className="btn-update-layer btn-update-layer-gray"
                    style={{ opacity: showGray ? 1 : 0 }}
                />
                {/* Green overlay — success state */}
                <span
                    className="btn-update-layer btn-update-layer-green"
                    style={{ opacity: showGreen ? 1 : 0 }}
                />
                {/* Content — re-keyed so animate-btn-state fires on every state change */}
                <span key={contentKey} className="animate-btn-state relative flex items-center gap-1.5"
                    style={{ color: showGray ? '#6b7280' : 'white' }}>
                    {isLoading ? (
                        <>
                            <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            Updating…
                        </>
                    ) : isSuccess ? (
                        <>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                            Updated!
                        </>
                    ) : (
                        'Update Chart'
                    )}
                </span>
            </button>
        );
    };

    // Render single chart card
    const renderChartCard = (chartConfig) => {
        // mergedConfig = committed state + any pending (draft) changes from the slider
        const mergedConfig = getMergedConfig(chartConfig);
        const catIdForFields = mergedConfig.chartCollection?._id || mergedConfig.chartCollection;
        const excludeAxisFields = ['__v', '_id'];
        const chartFields = catIdForFields
            ? (collectionFieldsCache[catIdForFields] || []).filter(f => !excludeAxisFields.includes(f.field))
            : [];
        const columns = chartFields.map(f => ({
            value: f.field,
            label: f.label
        }));

        // Guarantee the chart's currently-selected axes always appear as options, even
        // if the fetched field list doesn't (yet) contain them — e.g. AI-created charts
        // using "responsible"/"stage", or a collection whose fields haven't cached. This
        // prevents the X/Y axis dropdowns from rendering empty for a configured chart.
        const ensureAxisOption = (axis) => {
            if (axis?.value && !columns.some(o => o.value === axis.value)) {
                columns.push({ value: axis.value, label: axis.label || axis.value });
            }
        };
        ensureAxisOption(mergedConfig.xAxis);
        ensureAxisOption(mergedConfig.yAxis);
        ensureAxisOption(mergedConfig.zAxis);

        const toISO = (d) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        };
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const todayStr = toISO(today);
        const yest = new Date(today); yest.setDate(yest.getDate() - 1);
        const yesterdayStr = toISO(yest);

        // Preset date range helpers
        const mondayThisWeek = new Date(today);
        mondayThisWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7));
        const mondayLastWeek = new Date(mondayThisWeek);
        mondayLastWeek.setDate(mondayThisWeek.getDate() - 7);
        const sundayLastWeek = new Date(mondayLastWeek);
        sundayLastWeek.setDate(mondayLastWeek.getDate() + 6);
        const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const firstOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);

        const DATE_PRESET_OPTIONS = [
            { value: 'today', label: 'Today' },
            { value: 'yesterday', label: 'Yesterday' },
            { value: 'alltime', label: 'All Time' },
            { value: 'thisweek', label: 'This Week' },
            { value: 'lastweek', label: 'Last Week' },
            { value: 'thismonth', label: 'This Month' },
            { value: 'lastmonth', label: 'Last Month' },
            { value: 'last_n', label: 'Last N Days' },
            { value: 'custom', label: 'Custom' },
        ];

        const activePreset = mergedConfig._datePreset || 'today';
        const activePresetOption = DATE_PRESET_OPTIONS.find(o => o.value === activePreset) || DATE_PRESET_OPTIONS[0];
        const showCustomInputs = activePreset === 'custom';
        const showLastNInput = activePreset === 'last_n';
        const filterIsVisible = !!filterVisible[chartConfig.id];
        const filterHideCount = filterHideCountState[chartConfig.id] || 0;
        const isDateXAxis = DATE_AXIS_FIELDS.includes(mergedConfig.xAxis?.value);
        const activeDateGranularityOption = DATE_GRANULARITY_OPTIONS.find(o => o.value === (mergedConfig.dateGranularity || 'day')) || DATE_GRANULARITY_OPTIONS[1];

        const applyDatePreset = (preset) => {
            const updates = { _datePreset: preset };
            switch (preset) {
                case 'today':
                    updates.dateFilterFrom = todayStr;
                    updates.dateFilterTo = todayStr;
                    break;
                case 'yesterday':
                    updates.dateFilterFrom = yesterdayStr;
                    updates.dateFilterTo = yesterdayStr;
                    break;
                case 'alltime':
                    updates.dateFilterFrom = '';
                    updates.dateFilterTo = '';
                    break;
                case 'thisweek':
                    updates.dateFilterFrom = toISO(mondayThisWeek);
                    updates.dateFilterTo = todayStr;
                    break;
                case 'lastweek':
                    updates.dateFilterFrom = toISO(mondayLastWeek);
                    updates.dateFilterTo = toISO(sundayLastWeek);
                    break;
                case 'thismonth':
                    updates.dateFilterFrom = toISO(firstOfThisMonth);
                    updates.dateFilterTo = todayStr;
                    break;
                case 'lastmonth':
                    updates.dateFilterFrom = toISO(firstOfLastMonth);
                    updates.dateFilterTo = toISO(lastOfLastMonth);
                    break;
                case 'last_n': {
                    const n = mergedConfig._lastNDays || 7;
                    const d = new Date(today); d.setDate(d.getDate() - n);
                    updates.dateFilterFrom = toISO(d);
                    updates.dateFilterTo = todayStr;
                    break;
                }
                case 'custom':
                    // Keep existing dates, just switch to custom mode
                    break;
                default:
                    break;
            }
            updatePendingConfigBatch(chartConfig.id, updates);
        };

        return (
            <div
                key={chartConfig.id}
                draggable
                onDragStart={(e) => {
                    if (isResizingRef.current) { e.preventDefault(); return; }
                    draggedIdRef.current = chartConfig.id;
                    e.dataTransfer.effectAllowed = 'move';
                    setIsDraggingAny(true);
                }}
                onDragOver={(e) => { e.preventDefault(); handleDragOverScroll(e.clientY); if (chartConfig.id !== draggedIdRef.current) setDragOverId(chartConfig.id); }}
                onDrop={(e) => {
                    e.preventDefault();
                    const fromId = draggedIdRef.current;
                    if (!fromId || fromId === chartConfig.id) { setDragOverId(null); return; }
                    setCharts(prev => {
                        const fromIdx = prev.findIndex(c => c.id === fromId);
                        const toIdx = prev.findIndex(c => c.id === chartConfig.id);
                        const next = [...prev];
                        const [moved] = next.splice(fromIdx, 1);
                        next.splice(toIdx, 0, moved);
                        return next;
                    });
                    setHasUnsavedChanges(true);
                    setDragOverId(null);
                    draggedIdRef.current = null;
                    stopAutoScroll();
                    setIsDraggingAny(false);
                }}
                onDragEnd={() => { setDragOverId(null); draggedIdRef.current = null; stopAutoScroll(); setIsDraggingAny(false); }}
                ref={(el) => { cardRefs.current[chartConfig.id] = el; }}

                className={`bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-lg transition-shadow duration-300 animate-scale-in flex flex-col border-2 relative ${dragOverId === chartConfig.id ? 'border-gray-700 shadow-gray-200' : 'border-gray-200'
                    }`}
                data-chart-id={chartConfig.id}
                style={{
                    height: dragHeights[chartConfig.id] ?? chartConfig.chartHeight ?? 400,
                    width: (() => {
                        const pw = dragWidths[chartConfig.id] ?? chartConfig.chartWidthPx;
                        if (pw) return pw;
                        return chartConfig.chartWidth === 'full' ? '100%' : 'calc(50% - 12px)';
                    })(),
                    flexShrink: 0,
                    minWidth: 200,
                }}
            >
                {/* ── Always-visible name bar with drag handle ── */}
                <div data-pdf-hide="true" className="flex items-center gap-2 px-3 py-2 border-b border-indigo-500/20 cursor-grab active:cursor-grabbing select-none" style={{ background: 'linear-gradient(180deg, #334155 0%, #1e293b 100%)' }}>
                    <svg className="w-4 h-4 text-gray-500 shrink-0" fill="currentColor" viewBox="0 0 16 16">
                        <circle cx="5" cy="4" r="1.2" /><circle cx="11" cy="4" r="1.2" />
                        <circle cx="5" cy="8" r="1.2" /><circle cx="11" cy="8" r="1.2" />
                        <circle cx="5" cy="12" r="1.2" /><circle cx="11" cy="12" r="1.2" />
                    </svg>

                    <input
                        type="text"
                        value={chartConfig.chartName || ''}
                        placeholder={`Chart ${chartConfig.id}`}
                        onChange={(e) => !isViewingOtherAdmin && updateChartConfig(chartConfig.id, 'chartName', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className={'flex-1 text-sm font-semibold text-white bg-transparent outline-none border-none placeholder:text-gray-500 min-w-0 ' + (isViewingOtherAdmin ? 'cursor-default pointer-events-none' : 'cursor-text')}

                        onMouseDown={(e) => e.stopPropagation()}
                    />
                    {/* Settings toggle button */}
                    {!isViewingOtherAdmin && (
                        <UITooltip content={filterIsVisible ? 'Close settings' : 'Open settings'} placement="top">
                            <button
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (filterVisible[chartConfig.id]) {
                                        hideFilter(chartConfig.id);
                                    } else {
                                        updateFilterPanelPos(chartConfig.id);
                                        setFilterVisible(prev => ({ ...prev, [chartConfig.id]: true }));
                                    }
                                }}
                                className={`p-1 transition-colors shrink-0 cursor-pointer ${filterIsVisible ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                                </svg>
                            </button>
                        </UITooltip>
                    )}

                    {/* Width + height controls */}
                    {!isViewingOtherAdmin && (
                        <div className="flex items-center gap-1 shrink-0">
                            <UITooltip content="Chart Width" placement="top">
                                <div className="flex items-center border border-gray-700 rounded overflow-hidden text-[10px] font-semibold">
                                    <button
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => { e.stopPropagation(); updateChartConfig(chartConfig.id, 'chartWidthPx', Math.max(200, (chartConfig.chartWidthPx || 500) - 40)); }}
                                        className="px-1.5 py-0.5 text-gray-400 hover:bg-gray-700 hover:text-white font-bold text-xs transition-all"
                                    >−</button>
                                    <DimensionInput
                                        value={chartConfig.chartWidthPx || 500}
                                        onCommit={(v) => updateChartConfig(chartConfig.id, 'chartWidthPx', v)}
                                        min={200} max={2400}
                                        className="px-1 py-0.5 text-[10px] font-semibold text-gray-300 bg-transparent text-center border-x border-gray-700 w-[38px] focus:outline-none focus:bg-slate-800 m-0"
                                    />
                                    <button
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => { e.stopPropagation(); updateChartConfig(chartConfig.id, 'chartWidthPx', Math.min(2400, (chartConfig.chartWidthPx || 500) + 40)); }}
                                        className="px-1.5 py-0.5 text-gray-400 hover:bg-slate-700 hover:text-white font-bold text-xs transition-all"
                                    >+</button>
                                </div>
                            </UITooltip>
                            <UITooltip content="Chart Height" placement="top">
                                <div className="flex items-center border border-gray-700 rounded overflow-hidden">
                                    <button
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => { e.stopPropagation(); updateChartConfig(chartConfig.id, 'chartHeight', Math.max(180, (chartConfig.chartHeight || 320) - 40)); }}
                                        className="px-1.5 py-0.5 text-gray-400 hover:bg-gray-700 hover:text-white font-bold text-xs transition-all"
                                    >−</button>
                                    <DimensionInput
                                        value={chartConfig.chartHeight || 320}
                                        onCommit={(v) => updateChartConfig(chartConfig.id, 'chartHeight', v)}
                                        min={180} max={800}
                                        className="px-1 py-0.5 text-[10px] font-semibold text-gray-300 bg-transparent text-center border-x border-gray-700 w-[38px] focus:outline-none focus:bg-slate-800 m-0"
                                    />
                                    <button
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={(e) => { e.stopPropagation(); updateChartConfig(chartConfig.id, 'chartHeight', Math.min(800, (chartConfig.chartHeight || 320) + 40)); }}
                                        className="px-1.5 py-0.5 text-gray-400 hover:bg-gray-700 hover:text-white font-bold text-xs transition-all"
                                    >+</button>
                                </div>
                            </UITooltip>
                        </div>
                    )}

                    {/* Per-chart refresh button */}
                    {!isViewingOtherAdmin && (
                        <UITooltip content="Refresh chart" placement="top">
                            <button
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); fetchChartDataFromBackend(chartConfig.id, chartConfig); }}
                                className="p-1 text-gray-400 hover:text-white transition-colors shrink-0 cursor-pointer"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </button>
                        </UITooltip>
                    )}

                    {/* Delete button */}
                    {!isViewingOtherAdmin && (
                        <UITooltip content="Delete chart" placement="top">
                            <button
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => { e.stopPropagation(); setPendingDeleteId(chartConfig.id); }}
                                className="p-1 text-gray-400 hover:text-red-400 transition-colors shrink-0 cursor-pointer"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </UITooltip>
                    )}

                    {/* Auto-refresh countdown arc — only shown when auto-refresh is enabled */}
                    {chartConfig.autoRefreshMins && (() => {
                        const mins = chartConfig.autoRefreshMins;
                        const totalSecs = mins * 60;
                        const remaining = autoRefreshCountdown[chartConfig.id] ?? totalSecs;
                        const progress = remaining / totalSecs; // 1 = full, 0 = trigger
                        const r = 8;
                        const circ = 2 * Math.PI * r;
                        const dash = circ * progress;
                        const fmt = remaining >= 60
                            ? `${Math.floor(remaining / 60)}m${remaining % 60 > 0 ? String(remaining % 60).padStart(2, '0') + 's' : ''}`
                            : `${remaining}s`;
                        return (
                            <UITooltip content={`Auto-refresh in ${fmt} (every ${totalSecs < 60 ? `${totalSecs}s` : totalSecs < 3600 ? `${Math.round(totalSecs / 60)}m` : '1h'})`} placement="top">
                                <div
                                    className="flex items-center gap-1 shrink-0 select-none"
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => { e.stopPropagation(); fetchChartDataFromBackend(chartConfig.id, chartConfig); }}
                                >
                                    <svg width="20" height="20" viewBox="0 0 20 20" className="cursor-pointer">
                                        {/* Track */}
                                        <circle cx="10" cy="10" r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
                                        {/* Progress arc */}
                                        <circle
                                            cx="10" cy="10" r={r}
                                            fill="none"
                                            stroke={progress > 0.25 ? '#6ee7b7' : '#f87171'}
                                            strokeWidth="2"
                                            strokeDasharray={`${dash} ${circ}`}
                                            strokeLinecap="round"
                                            transform="rotate(-90 10 10)"
                                            style={{ transition: 'stroke-dasharray 0.9s linear' }}
                                        />
                                    </svg>
                                    <span className="text-[9px] font-mono text-gray-400 min-w-[22px]">{fmt}</span>
                                </div>
                            </UITooltip>
                        );
                    })()}
                </div>

                {/* ── All controls — slides in when near top ──
                    Portaled to <body>: this panel is `position: fixed` with viewport coords
                    (top/left/width from getBoundingClientRect). The chart card runs an
                    `animate-scale-in` animation (fill-mode both) which keeps the card under
                    transform control — that makes the card a containing block for fixed
                    descendants and offsets/clips this panel. Rendering into <body> escapes it. */}
                {createPortal(
                <div
                    key={filterHideCount}
                    className={`fixed bg-white z-[200] border border-gray-200 shadow-xl rounded-b-xl origin-top flex flex-col overflow-hidden
                        ${filterIsVisible
                            ? 'opacity-100 pointer-events-auto scale-y-100'
                            : 'opacity-0 pointer-events-none scale-y-95 -translate-y-2'
                        }`}
                    style={{
                        top: filterPanelPos[chartConfig.id]?.top ?? -9999,
                        left: filterPanelPos[chartConfig.id]?.left ?? 0,
                        width: filterPanelPos[chartConfig.id]?.width ?? 0,
                        transformOrigin: 'top center',
                        transition: filterIsVisible
                            ? 'opacity 300ms cubic-bezier(0.16, 1, 0.3, 1), transform 300ms cubic-bezier(0.16, 1, 0.3, 1), max-height 300ms cubic-bezier(0.16, 1, 0.3, 1)'
                            : 'opacity 250ms cubic-bezier(0.4, 0, 1, 1), transform 250ms cubic-bezier(0.4, 0, 1, 1), max-height 250ms cubic-bezier(0.4, 0, 1, 1)',
                        maxHeight: filterIsVisible
                            ? `calc(100vh - ${filterPanelPos[chartConfig.id]?.top ?? 0}px - 16px)`
                            : 0,
                    }}

                >

                    {/* ── Collection — always shown first ── */}
                    {collections.length > 0 && (
                        <div className="flex items-center justify-center gap-2 px-5 pt-2 pb-2 border-b border-gray-100 relative pr-10">
                            <span className="text-xs font-semibold text-gray-700 shrink-0">Collection:</span>
                            <div className="w-48">
                                <Combobox
                                    value={
                                        mergedConfig.chartCollection
                                            ? (typeof mergedConfig.chartCollection === 'object'
                                                ? mergedConfig.chartCollection._id
                                                : mergedConfig.chartCollection)
                                            : null
                                    }
                                    onChange={(val) => {
                                        const todayISO = getTodayISO();
                                        if (val) fetchFieldsForCollection(val);
                                        // Reset all query-dependent fields in pending when collection changes
                                        updatePendingConfigBatch(chartConfig.id, {
                                            chartCollection: val || null,
                                            chartType: null,
                                            xAxis: null,
                                            yAxis: null,
                                            zAxis: null,
                                            aggregation: null,
                                            chartMode: null,
                                            dateFilterFrom: todayISO,
                                            dateFilterTo: todayISO,
                                            _datePreset: 'today',
                                            _showCustom: false,
                                            _showLastN: false,
                                            _lastNDays: 2,
                                        });
                                    }}
                                    options={collections.map(c => ({ value: c._id, label: c.collectionName }))}
                                    placeholder="Select collection..."
                                    dropdownClassName="!z-[500] !min-w-[160px]"
                                />
                            </div>
                            {mergedConfig.chartCollection && (
                                <UITooltip content="Clear collection filter" placement="top">
                                    <button
                                        onClick={() => updatePendingConfigBatch(chartConfig.id, {
                                            chartCollection: null,
                                            chartType: null,
                                            xAxis: null,
                                            yAxis: null,
                                            zAxis: null,
                                            aggregation: null,
                                            chartMode: null,
                                        })}
                                        className="text-gray-400 hover:text-gray-700 transition-colors text-base leading-none px-1"
                                    >
                                        ×
                                    </button>
                                </UITooltip>
                            )}
                            {/* ── Update Chart button in header row ── */}
                            {mergedConfig.chartCollection && (
                                <div className="ml-auto flex items-center">
                                    {renderUpdateChartButton(chartConfig, mergedConfig)}
                                </div>
                            )}

                            {/* Close button top right */}
                            <button
                                onClick={() => hideFilter(chartConfig.id)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    )}

                    {/* ── Rest of controls — only shown when collection is selected (or no collections exist) ── */}
                    {(collections.length === 0 || mergedConfig.chartCollection) && (
                        <>
                            {/* ── Action buttons bar — only when no collections (otherwise in Account Collection header row) ── */}
                            {collections.length === 0 && (
                                <div className="flex items-center justify-end px-5 pt-2 pb-1 border-b border-gray-100 shrink-0 relative pr-10">
                                    {renderUpdateChartButton(chartConfig, mergedConfig)}

                                    {/* Close button top right */}
                                    <button
                                        onClick={() => hideFilter(chartConfig.id)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                            )}

                            {/* ── Scrollable body ── */}
                            <div className="overflow-y-auto flex-1 scrollbar-thin">

                                {/* ── Date filter row ── */}
                                <div className="flex items-center gap-2 pt-3 mb-3 px-5 flex-wrap">
                                    <span className="text-xs font-semibold text-gray-700 shrink-0">Filter:</span>
                                    <div className="w-32 [&_input]:!py-0.5 [&_input]:!text-[11px] [&_input]:!pl-2 [&_input]:!pr-7 [&_svg]:!size-3">
                                        <Combobox
                                            value={activePresetOption?.value ?? null}
                                            onChange={(val) => val && applyDatePreset(val)}
                                            options={DATE_PRESET_OPTIONS}
                                            dropdownClassName="!z-[500] !min-w-[160px]"
                                        />
                                    </div>

                                    {/* Last N Days number input */}
                                    {showLastNInput && (
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                min="1"
                                                max="365"
                                                value={mergedConfig._lastNDays || 7}
                                                onChange={(e) => {
                                                    const n = Math.max(1, parseInt(e.target.value) || 1);
                                                    const d = new Date(today); d.setDate(d.getDate() - n);
                                                    updatePendingConfigBatch(chartConfig.id, {
                                                        _lastNDays: n,
                                                        dateFilterFrom: toISO(d),
                                                        dateFilterTo: todayStr,
                                                    });
                                                }}
                                                className="ds-input-focus w-14 px-1.5 py-0.5 text-[11px] text-center border border-gray-300 rounded transition-all"
                                            />
                                            <span className="text-[11px] text-gray-500">days</span>
                                        </div>
                                    )}

                                    {/* From/To inputs — only shown in custom mode */}
                                    {showCustomInputs && (
                                        <>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <span className="text-[11px] text-gray-500">From:</span>
                                                <input
                                                    type="date"
                                                    value={mergedConfig.dateFilterFrom}
                                                    onChange={(e) => updatePendingConfigBatch(chartConfig.id, { dateFilterFrom: e.target.value })}
                                                    className="ds-input-focus px-1.5 py-0.5 text-[11px] border border-gray-300 rounded transition-all"
                                                />
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <span className="text-[11px] text-gray-500">To:</span>
                                                <input
                                                    type="date"
                                                    value={mergedConfig.dateFilterTo}
                                                    onChange={(e) => updatePendingConfigBatch(chartConfig.id, { dateFilterTo: e.target.value })}
                                                    className="ds-input-focus px-1.5 py-0.5 text-[11px] border border-gray-300 rounded transition-all"
                                                />
                                            </div>
                                        </>
                                    )}

                                </div>

                                {/* ── SECTION: DISPLAY ─────────────────────── */}
                                {mergedConfig.chartType?.value && (
                                    <>
                                        <div className="flex items-center gap-0 px-5 pt-1 pb-1.5 border-t border-gray-100 mt-1">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Display</span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2 px-5">
                                            {/* Color — line/heatmap/number only */}
                                            {['line', 'heatmap', 'number'].includes(mergedConfig.chartType?.value) && (
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span className="text-[11px] font-semibold text-gray-600 shrink-0">Color</span>
                                                    <div className="flex items-center gap-1.5">
                                                        {COLOR_OPTIONS.map(c => (
                                                            <button
                                                                key={c}
                                                                title={c}
                                                                onClick={() => updatePendingConfig(chartConfig.id, 'chartColor', c)}
                                                                className="w-4.5 h-4.5 rounded-full transition-transform hover:scale-110 focus:outline-none"
                                                                style={{
                                                                    width: 18, height: 18,
                                                                    backgroundColor: c,
                                                                    boxShadow: (mergedConfig.chartColor || DEFAULT_CHART_COLOR) === c
                                                                        ? `0 0 0 2px white, 0 0 0 3.5px ${c}`
                                                                        : 'none'
                                                                }}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {/* Legend + Data Labels — not heatmap/number */}
                                            {!['heatmap', 'number'].includes(mergedConfig.chartType?.value) && (
                                                <>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <span className="text-[11px] font-semibold text-gray-600 shrink-0">Legend</span>
                                                        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-[11px] font-semibold">
                                                            <button onClick={() => updatePendingConfig(chartConfig.id, 'showLegend', true)}
                                                                className={`px-2 py-0.5 transition-all ${mergedConfig.showLegend !== false ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-indigo-50 hover:text-indigo-600'}`}>On</button>
                                                            <button onClick={() => updatePendingConfig(chartConfig.id, 'showLegend', false)}
                                                                className={`px-2 py-0.5 transition-all ${mergedConfig.showLegend === false ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-indigo-50 hover:text-indigo-600'}`}>Off</button>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <span className="text-[11px] font-semibold text-gray-600 shrink-0">Data Labels</span>
                                                        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-[11px] font-semibold">
                                                            <button onClick={() => updatePendingConfig(chartConfig.id, 'showDataLabels', true)}
                                                                className={`px-2 py-0.5 transition-all ${mergedConfig.showDataLabels !== false ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-indigo-50 hover:text-indigo-600'}`}>On</button>
                                                            <button onClick={() => updatePendingConfig(chartConfig.id, 'showDataLabels', false)}
                                                                className={`px-2 py-0.5 transition-all ${mergedConfig.showDataLabels === false ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-indigo-50 hover:text-indigo-600'}`}>Off</button>
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </>
                                )}

                                {/* ── SECTION: CHART ────────────────────────── */}
                                {(mergedConfig.chartType?.value === 'pie' || mergedConfig.chartType?.value === 'bar' || mergedConfig.chartType?.value === 'line' || mergedConfig.chartType?.value === 'number') && (
                                    <>
                                        <div className="flex items-center px-5 pt-1 pb-1.5 border-t border-gray-100">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Chart</span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2 px-5">
                                            {/* Mode — pie + bar */}
                                            {(mergedConfig.chartType?.value === 'pie' || mergedConfig.chartType?.value === 'bar' || mergedConfig.chartType?.value === 'line') && (
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <span className="text-[11px] font-semibold text-gray-600 shrink-0">Mode</span>
                                                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-[11px] font-semibold">
                                                        {[{ v: null, label: 'Simple' }, { v: 'grouped', label: 'Grouped' }, { v: 'stacked', label: 'Stacked' }].map(({ v, label }) => (
                                                            <button key={label} onClick={() => updatePendingConfig(chartConfig.id, 'chartMode', v)}
                                                                className={`px-2 py-0.5 transition-all ${mergedConfig.chartMode === v ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-indigo-50 hover:text-indigo-600'}`}>
                                                                {label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {/* Orientation — bar only */}
                                            {mergedConfig.chartType?.value === 'bar' && (
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <span className="text-[11px] font-semibold text-gray-600 shrink-0">Orientation</span>
                                                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-[11px] font-semibold">
                                                        <button onClick={() => updatePendingConfig(chartConfig.id, 'barOrientation', 'vertical')}
                                                            className={`flex items-center gap-1 px-2 py-0.5 transition-all ${(mergedConfig.barOrientation || 'vertical') === 'vertical' ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-indigo-50 hover:text-indigo-600'}`}>
                                                            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                                                                <rect x="1" y="4" width="2.5" height="7" rx="0.5" />
                                                                <rect x="4.75" y="2" width="2.5" height="9" rx="0.5" />
                                                                <rect x="8.5" y="5.5" width="2.5" height="5.5" rx="0.5" />
                                                            </svg>
                                                            Vertical
                                                        </button>
                                                        <button onClick={() => updatePendingConfig(chartConfig.id, 'barOrientation', 'horizontal')}
                                                            className={`flex items-center gap-1 px-2 py-0.5 transition-all ${mergedConfig.barOrientation === 'horizontal' ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-indigo-50 hover:text-indigo-600'}`}>
                                                            <svg className="w-3 h-3" viewBox="0 0 12 12" fill="currentColor">
                                                                <rect x="0" y="1" width="7" height="2.5" rx="0.5" />
                                                                <rect x="0" y="4.75" width="9" height="2.5" rx="0.5" />
                                                                <rect x="0" y="8.5" width="5.5" height="2.5" rx="0.5" />
                                                            </svg>
                                                            Horizontal
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                            {/* Split — number only */}
                                            {mergedConfig.chartType?.value === 'number' && (
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <span className="text-[11px] font-semibold text-gray-600 shrink-0">Split</span>
                                                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-[11px] font-semibold">
                                                        {[{ v: 0, label: 'None' }, ...Array.from({ length: 10 }, (_, i) => ({ v: i + 1, label: String(i + 1) }))].map(({ v, label }) => (
                                                            <button key={label} onClick={() => updatePendingConfig(chartConfig.id, 'numberSplitCount', v)}
                                                                className={`px-2 py-0.5 transition-all ${(mergedConfig.numberSplitCount ?? 4) === v ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-indigo-50 hover:text-indigo-600'}`}>
                                                                {label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}

                                {/* ── SECTION: REFRESH ──────────────────────── */}
                                <div className="flex items-center px-5 pt-1 pb-1.5 border-t border-gray-100">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Refresh</span>
                                </div>
                                <div className="flex items-center gap-2 mb-2 px-5">
                                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-[11px] font-semibold">
                                        <button onClick={() => updatePendingConfig(chartConfig.id, 'autoRefreshMins', null)}
                                            className={`px-2 py-0.5 transition-all ${!mergedConfig.autoRefreshMins ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-indigo-50 hover:text-indigo-600'}`}>Off</button>
                                        {[{ v: 10 / 60, label: '10s' }, { v: 0.5, label: '30s' }, { v: 1, label: '1m' }, { v: 2, label: '2m' }, { v: 3, label: '3m' }, { v: 5, label: '5m' }, { v: 10, label: '10m' }, { v: 15, label: '15m' }, { v: 30, label: '30m' }, { v: 60, label: '1h' }].map(({ v, label }) => (
                                            <button key={label} onClick={() => updatePendingConfig(chartConfig.id, 'autoRefreshMins', v)}
                                                className={`px-2 py-0.5 transition-all ${mergedConfig.autoRefreshMins === v ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white' : 'bg-white text-gray-500 hover:bg-indigo-50 hover:text-indigo-600'}`}>
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* ── SECTION: RENAME LABELS ────────────────── */}
                                {mergedConfig.chartType?.value && (() => {
                                    const isNumber = mergedConfig.chartType?.value === 'number';
                                    const isHeatmap = mergedConfig.chartType?.value === 'heatmap';
                                    if (isHeatmap) return null;
                                    const activeFields = isNumber
                                        ? (mergedConfig.yAxis ? [mergedConfig.yAxis] : [])
                                        : [mergedConfig.xAxis, mergedConfig.yAxis, mergedConfig.zAxis].filter(Boolean);
                                    if (!activeFields.length) return null;
                                    return (
                                        <>
                                            <div className="flex items-center px-5 pt-1 pb-1.5 border-t border-gray-100">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Rename Labels</span>
                                            </div>
                                            <div className="flex flex-wrap gap-3 mb-2 px-5">
                                                {activeFields.map((field, fIdx) => {
                                                    const currentVal = (mergedConfig.fieldLabels || {})[field.value] ?? field.label;
                                                    return (
                                                        <div key={field.value ?? fIdx} className="flex flex-col gap-0.5" style={{ minWidth: 90 }}>
                                                            <span className="text-[10px] font-medium text-gray-400 truncate">{field.label}</span>
                                                            <LabelInput
                                                                initialValue={currentVal}
                                                                placeholder={field.label}
                                                                onCommit={(newVal) => updatePendingConfig(chartConfig.id, 'fieldLabels', {
                                                                    ...(mergedConfig.fieldLabels || {}),
                                                                    [field.value]: newVal,
                                                                })}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    );
                                })()}
                                {/* Chart Controls */}
                                <div className={`grid gap-3 mb-4 px-5 ${mergedConfig.chartType?.value === 'number' ? 'grid-cols-3' :
                                    ((mergedConfig.chartType?.value === 'pie' || mergedConfig.chartType?.value === 'bar') && (mergedConfig.chartMode === 'grouped' || mergedConfig.chartMode === 'stacked'))
                                        ? (isDateXAxis ? 'grid-cols-6' : 'grid-cols-5')
                                        : (isDateXAxis ? 'grid-cols-5' : 'grid-cols-4')
                                    }`}>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Chart Type</label>
                                        <Combobox
                                            value={mergedConfig.chartType?.value ?? null}
                                            onChange={(val) => updatePendingConfig(chartConfig.id, 'chartType', chartTypes.find(o => o.value === val) ?? null)}
                                            options={chartTypes}
                                            dropdownClassName="!z-[500] !min-w-[160px]"
                                        />
                                    </div>
                                    {mergedConfig.chartType?.value !== 'number' && (
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                                                {mergedConfig.chartType?.value === 'pie' ? 'Group By' : 'X Axis'}
                                            </label>
                                            <Combobox
                                                value={mergedConfig.xAxis?.value ?? null}
                                                onChange={(val) => updatePendingConfig(chartConfig.id, 'xAxis', columns.find(o => o.value === val) ?? null)}
                                                options={columns}
                                                dropdownClassName="!z-[500] !min-w-[160px]"
                                            />
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                                            {mergedConfig.chartType?.value === 'pie' ? 'Value' : mergedConfig.chartType?.value === 'number' ? 'Value' : 'Y Axis'}
                                        </label>
                                        <Combobox
                                            value={mergedConfig.yAxis?.value ?? null}
                                            onChange={(val) => updatePendingConfig(chartConfig.id, 'yAxis', columns.find(o => o.value === val) ?? null)}
                                            options={columns}
                                            dropdownClassName="!z-[500] !min-w-[160px]"
                                        />
                                    </div>
                                    {/* Z Axis — for Grouped / Stacked modes */}
                                    {(mergedConfig.chartType?.value === 'pie' || mergedConfig.chartType?.value === 'bar') && (mergedConfig.chartMode === 'grouped' || mergedConfig.chartMode === 'stacked') && (
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                                                Group By
                                            </label>
                                            <Combobox
                                                value={mergedConfig.zAxis?.value ?? null}
                                                onChange={(val) => updatePendingConfig(chartConfig.id, 'zAxis', columns.find(o => o.value === val) ?? null)}
                                                options={columns}
                                                dropdownClassName="!z-[500] !min-w-[160px]"
                                            />
                                        </div>
                                    )}
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Aggregation</label>
                                        <Combobox
                                            value={mergedConfig.aggregation?.value ?? null}
                                            onChange={(val) => { const opts = mergedConfig.chartType?.value === 'number' ? aggregationTypesNumber : aggregationTypes; updatePendingConfig(chartConfig.id, 'aggregation', opts.find(o => o.value === val) ?? null); }}
                                            options={mergedConfig.chartType?.value === 'number' ? aggregationTypesNumber : aggregationTypes}
                                            dropdownClassName="!z-[500] !min-w-[160px]"
                                        />
                                    </div>
                                    {/* Date Granularity — only when xAxis is a timestamp field */}
                                    {isDateXAxis && (
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Granularity</label>
                                            <Combobox
                                                value={activeDateGranularityOption?.value ?? null}
                                                onChange={(val) => val && updatePendingConfig(chartConfig.id, 'dateGranularity', val)}
                                                options={DATE_GRANULARITY_OPTIONS}
                                                dropdownClassName="!z-[500] !min-w-[140px]"
                                            />
                                        </div>
                                    )}
                                </div>
                                {/* end filter controls */}
                                <div className="pb-4"></div>
                            </div>{/* end scrollable body */}
                        </>
                    )}

                    {/* ── Hint when collection not yet selected ── */}
                    {collections.length > 0 && !mergedConfig.chartCollection && (
                        <div className="px-5 pb-4 pt-1 text-center">
                            <p className="text-[11px] text-gray-400 italic">Select a collection above to configure this chart.</p>
                        </div>
                    )}
                </div>
                , document.body)}

                {/* Chart Display — fills remaining space */}
                <div
                    data-pdf-content="true"
                    className="relative bg-gray-50 border-t-2 border-gray-100 flex-1 min-h-0 overflow-hidden"
                >
                    <div className="w-full h-full p-4">
                        {renderChart(chartConfig)}
                    </div>
                    {/* Drag capture overlay — sits above SVG so dragOver fires on the card */}
                    {isDraggingAny && draggedIdRef.current !== chartConfig.id && (
                        <div
                            className="absolute inset-0 z-20"
                            onDragOver={(e) => { e.preventDefault(); handleDragOverScroll(e.clientY); setDragOverId(chartConfig.id); }}
                        />
                    )}
                    {/* Right edge — horizontal resize */}
                    {!isViewingOtherAdmin && (
                        <div
                            data-pdf-hide="true"
                            className="absolute top-0 right-0 bottom-0 w-3 cursor-ew-resize z-10 flex items-center justify-end pr-0.5 group/rh hover:bg-gray-100 transition-colors"
                            onMouseDown={(e) => startResize(e, chartConfig.id, dragHeights[chartConfig.id] ?? chartConfig.chartHeight ?? 400, dragWidths[chartConfig.id] ?? chartConfig.chartWidthPx ?? 500, 'x')}
                        >
                            <div className="h-10 w-1 rounded-full bg-gray-300 group-hover/rh:bg-gray-700 transition-colors" />
                        </div>
                    )}
                    {/* Bottom-right corner — both directions */}
                    {!isViewingOtherAdmin && (
                        <div
                            data-pdf-hide="true"
                            className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize z-30"
                            onMouseDown={(e) => startResize(e, chartConfig.id, dragHeights[chartConfig.id] ?? chartConfig.chartHeight ?? 400, dragWidths[chartConfig.id] ?? chartConfig.chartWidthPx ?? 500, 'both')}
                        >
                            <svg className="w-4 h-4 text-gray-400 hover:text-gray-700 transition-colors" viewBox="0 0 16 16" fill="currentColor">
                                <circle cx="5" cy="11" r="1.2" />
                                <circle cx="9" cy="11" r="1.2" />
                                <circle cx="13" cy="11" r="1.2" />
                                <circle cx="9" cy="7" r="1.2" />
                                <circle cx="13" cy="7" r="1.2" />
                                <circle cx="13" cy="3" r="1.2" />
                            </svg>
                        </div>
                    )}
                </div>

                {/* Bottom edge — vertical resize */}
                {!isViewingOtherAdmin && (
                    <div
                        className="h-3 cursor-ns-resize flex items-center justify-center bg-white border-t border-gray-100 group/resize hover:bg-gray-100 transition-colors shrink-0 z-10"
                        onMouseDown={(e) => startResize(e, chartConfig.id, dragHeights[chartConfig.id] ?? chartConfig.chartHeight ?? 400, 0, 'y')}
                    >
                        <div className="w-12 h-1 rounded-full bg-gray-300 group-hover/resize:bg-gray-700 transition-colors" />
                    </div>
                )}
            </div>
        );
    };

    // Block the entire page until accounts are resolved
    if (!accountsLoaded) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="flex flex-col items-center space-y-4 p-8 bg-white rounded-2xl shadow-2xl border border-gray-200">
                    <div className="relative">
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-200"></div>
                        <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-900 border-t-transparent absolute top-0"></div>
                    </div>
                    <div className="text-center">
                        <span className="text-lg font-semibold text-gray-900">Loading Dashboard</span>
                        <p className="text-sm text-gray-500 mt-1">Fetching your collections and charts...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            <div ref={navWrapRef} className="sticky top-0 z-40">
                <AppNavbar activePage="visualize" />
            </div>

            {/* ── Save-warning modal: rendered at page root so it's never clipped by toolbar layout ── */}
            {saveWarningOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
                        <div className="flex items-start gap-3 mb-4">
                            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center">
                                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 mb-1">Save to your own dashboard?</h3>
                                <p className="text-xs text-gray-500 leading-relaxed">
                                    You are currently viewing <span className="font-semibold text-gray-700">{viewAsAdmin ? getAdminDisplayName(viewAsAdmin) : "another admin"}'s</span> charts. Saving will overwrite <span className="font-semibold text-gray-700">your own</span> saved dashboard{userDetails?.name ? <> (<span className="font-semibold text-gray-700">{userDetails.name}</span>)</> : ''} with this layout. Your previous charts will be lost.
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                size="sm"
                                variant="secondary"
                                scheme="primary"
                                onClick={() => setSaveWarningOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                onClick={async () => {
                                    setSaveWarningOpen(false);
                                    const ownKey = localStorage.getItem('currentUserAdmin') || localStorage.getItem('userId') || 'default';
                                    await executeSchemaSave(ownKey);
                                    const ownAdmin = viewAsAdmins.find(a => String(a.userId || '') === ownKey);
                                    if (ownAdmin) {
                                        await handleViewAsChange(ownAdmin);
                                    }
                                }}
                            >
                                Yes, save to my dashboard
                            </Button>
                        </div>
                    </div>
                </div>
            )}
            {/* ── Pull-overwrite warning modal (unsaved changes exist when pulling) ── */}
            {pullOverwriteWarningOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
                        <div className="flex items-start gap-3 mb-4">
                            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-red-100 flex items-center justify-center">
                                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 mb-1">Overwrite unsaved changes?</h3>
                                <p className="text-xs text-gray-500 leading-relaxed">
                                    Pulling from the collection will overwrite your current unsaved changes. This cannot be undone.
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button
                                size="sm"
                                variant="secondary"
                                scheme="danger"
                                onClick={() => setPullOverwriteWarningOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                variant="danger"
                                onClick={() => {
                                    setPullOverwriteWarningOpen(false);
                                    handleSchemaSync(acctId, viewingAs);
                                }}
                            >
                                Pull &amp; overwrite
                            </Button>
                        </div>
                    </div>
                </div>
            )}
            <div className="min-h-screen bg-gray-50 relative">
                <LoadingMask loading={!chartsReady} title="Loading..." message="Please wait while we fetch your data" />
                <div
                    className="bg-white border-b border-gray-200 shadow-sm sticky z-30"
                    style={{
                        top: navHeight,
                        transform: headerVisible ? 'translateY(0)' : 'translateY(-110%)',
                        transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                    }}
                >
                    <div className="w-full px-6 py-2">
                        <div className="flex justify-between items-center">
                            {/* View As dropdown — left of the header row */}
                            <div ref={viewAsRef} className="relative">
                                <UITooltip content="View As" placement="bottom">
                                    <button
                                        onClick={() => setViewAsOpen(o => !o)}
                                        className="inline-flex items-center justify-between gap-1.5 h-8 w-max min-w-[9rem] px-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all text-xs font-medium"
                                    >
                                        {viewAsAdmin ? (
                                            getAdminAvatar(viewAsAdmin) && !viewAsAvatarError ? (
                                                <img
                                                    src={getAdminAvatar(viewAsAdmin)}
                                                    alt=""
                                                    className="w-5 h-5 rounded-full object-cover flex-shrink-0"
                                                    onError={() => setViewAsAvatarError(true)}
                                                />
                                            ) : (
                                                <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0" style={{ background: getAdminColor(viewAsAdmin) }}>
                                                    {getAdminInitials(viewAsAdmin)}
                                                </span>
                                            )
                                        ) : (
                                            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                        )}
                                        <span className="whitespace-nowrap">
                                            {viewAsAdmin ? getAdminDisplayName(viewAsAdmin) : 'View As'}
                                        </span>
                                        <svg className={`w-3 h-3 text-gray-400 transition-transform ${viewAsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                </UITooltip>
                                {viewAsOpen && (
                                    <div className="absolute left-0 top-full mt-1 min-w-full w-max bg-white rounded-xl shadow-xl border border-gray-100 z-50 py-1 max-h-64 overflow-y-auto">
                                        {(() => {
                                            const currentUserAdminId = localStorage.getItem('currentUserAdmin');
                                            const me = viewAsAdmins.find(a => String(a.userId || '') === currentUserAdminId);
                                            const others = viewAsAdmins.filter(a => String(a.userId || '') !== currentUserAdminId);

                                            const renderAdminBtn = (admin, idx) => {
                                                const adminUserId = String(admin.userId || '');
                                                const selectedUserId = String(viewAsAdmin?.userId || '');
                                                const isSelected = adminUserId && adminUserId === selectedUserId;
                                                const isMe = adminUserId === currentUserAdminId;
                                                return (
                                                    <button
                                                        key={admin.userId || admin._id || idx}
                                                        onClick={() => !isSelected && handleViewAsChange(admin)}
                                                        disabled={isSelected}
                                                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors
                                                        ${isSelected
                                                                ? 'font-semibold text-gray-900 bg-gray-100 cursor-not-allowed opacity-60'
                                                                : 'text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer'
                                                            }`}
                                                    >
                                                        {getAdminAvatar(admin) ? (
                                                            <>
                                                                <img
                                                                    src={getAdminAvatar(admin)}
                                                                    alt=""
                                                                    className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                                                                    onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex'; }}
                                                                />
                                                                <span style={{ display: 'none', background: getAdminColor(admin) }} className="w-6 h-6 rounded-full items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                                                                    {getAdminInitials(admin)}
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0" style={{ background: getAdminColor(admin) }}>
                                                                {getAdminInitials(admin)}
                                                            </span>
                                                        )}
                                                        <span className="truncate flex-1">{getAdminDisplayName(admin)}</span>
                                                        {isMe && !isSelected && (
                                                            <span className="text-[9px] font-semibold text-indigo-500 bg-indigo-50 border border-indigo-200 rounded px-1 py-0.5 flex-shrink-0">You</span>
                                                        )}
                                                        {isSelected && (
                                                            <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                );
                                            };

                                            return (
                                                <>
                                                    {me && renderAdminBtn(me, 'me')}
                                                    {me && others.length > 0 && (
                                                        <div className="my-1 border-t border-gray-100" />
                                                    )}
                                                    {others.map((admin, idx) => renderAdminBtn(admin, idx))}
                                                    {viewAsAdmins.length === 0 && (
                                                        <p className="px-3 py-2 text-xs text-gray-400">No admins found</p>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Create with AI button — hidden when viewing another admin */}
                                {!isViewingOtherAdmin && (
                                    <UITooltip content="Create charts with AI assistant" placement="bottom">
                                        <button
                                            onClick={() => setAiChatOpen(true)}
                                            className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-semibold transition-all duration-200 hover:scale-105"
                                            style={{
                                                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                                                color: 'white',
                                                boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
                                                border: 'none',
                                            }}
                                        >
                                            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor">
                                                <path d="M12 2l2.4 7.2L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z" opacity="0.95" />
                                                <path d="M5 3l.8 2.2L8 6l-2.2.8L5 9l-.8-2.2L2 6l2.2-.8L5 3z" opacity="0.6" />
                                            </svg>
                                            Create with AI
                                        </button>
                                    </UITooltip>
                                )}
                                {!isViewingOtherAdmin && (
                                    <UITooltip content="Refresh all charts" placement="bottom">
                                        <button
                                            onClick={refreshAllCharts}
                                            disabled={globalRefreshing}
                                            className="group relative w-8 h-8 bg-transparent rounded-lg hover:bg-gray-100 transition-all duration-300 flex items-center justify-center hover:scale-110 border border-gray-300 hover:border-gray-400 focus:ring-1 focus:ring-gray-400 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            <svg className={`w-4 h-4 text-gray-700 group-hover:text-gray-900 transition-colors ${globalRefreshing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                        </button>
                                    </UITooltip>
                                )}
                                {!isViewingOtherAdmin && (
                                    <UITooltip content="Download all charts as PDF" placement="bottom">
                                        <button
                                            onClick={handleDownloadPDF}
                                            disabled={pdfDownloading || charts.length === 0}
                                            className="group relative w-8 h-8 bg-transparent rounded-lg hover:bg-indigo-50 transition-all duration-300 flex items-center justify-center hover:scale-110 border border-gray-300 hover:border-indigo-500 focus:ring-1 focus:ring-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            {pdfDownloading ? (
                                                <svg className="w-4 h-4 text-indigo-600 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                            ) : (
                                                <svg className="w-4 h-4 text-gray-600 group-hover:text-indigo-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                                                </svg>
                                            )}
                                        </button>
                                    </UITooltip>
                                )}
                                {/* Pull changes from collection */}
                                <UITooltip content="Pull changes" placement="bottom">
                                    <button
                                        onClick={() => {
                                            // If viewing own dashboard and there are unsaved changes, warn before overwriting
                                            if (hasUnsavedChanges) {
                                                setPullOverwriteWarningOpen(true);
                                            } else {
                                                handleSchemaSync(acctId, viewingAs);
                                            }
                                        }}
                                        disabled={schemaSyncing}
                                        className="group relative w-8 h-8 bg-transparent rounded-lg hover:bg-blue-50 transition-all duration-300 flex items-center justify-center hover:scale-110 border border-gray-300 hover:border-blue-500 focus:ring-1 focus:ring-blue-400 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        <svg className={`w-4 h-4 text-gray-600 group-hover:text-blue-600 transition-colors ${schemaSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                                        </svg>
                                    </button>
                                </UITooltip>
                                {/* Save changes — hidden when viewing another admin */}
                                {!isViewingOtherAdmin && (
                                    <UITooltip content="Save changes" placement="bottom">
                                        <button
                                            onClick={handleSchemaSave}
                                            disabled={schemaSaving || (schemaSavedOnce && !hasUnsavedChanges)}
                                            className="group relative w-8 h-8 bg-transparent rounded-lg hover:bg-yellow-50 transition-all duration-300 flex items-center justify-center hover:scale-110 border border-gray-300 hover:border-yellow-400 focus:ring-1 focus:ring-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            <svg className={`w-4 h-4 text-gray-600 group-hover:text-yellow-600 transition-colors ${schemaSaving ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                            </svg>
                                        </button>
                                    </UITooltip>
                                )}
                                {/* Copy to my dashboard — only visible when viewing another admin */}
                                {isViewingOtherAdmin && (
                                    <UITooltip content="Copy analytics to my dashboard" placement="bottom">
                                        <button
                                            onClick={handleSchemaSave}
                                            disabled={schemaSaving}
                                            className="group relative w-8 h-8 bg-transparent rounded-lg hover:bg-purple-50 transition-all duration-300 flex items-center justify-center hover:scale-110 border border-gray-300 hover:border-purple-400 focus:ring-1 focus:ring-purple-300 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            <svg className={`w-4 h-4 text-gray-600 group-hover:text-purple-600 transition-colors ${schemaSaving ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                        </button>
                                    </UITooltip>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="w-full px-6 py-6">
                    {charts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
                            <div className="w-12 h-12 mb-4 bg-gray-100 rounded-xl flex items-center justify-center border border-gray-200">
                                <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                            </div>
                            <h3 className="text-sm font-semibold text-gray-700 mb-1">No Charts Yet</h3>
                            <p className="text-xs text-gray-400 mb-5">{isViewingOtherAdmin ? 'This admin has no charts configured' : 'Add a chart to start visualizing your data'}</p>
                            {!isViewingOtherAdmin && (
                                <div className="flex flex-col items-center gap-3">
                                    <Button
                                        onClick={addChart}
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Add Your First Chart
                                    </Button>
                                    <button
                                        onClick={() => setAiChatOpen(true)}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 hover:scale-105"
                                        style={{
                                            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                                            color: 'white',
                                            boxShadow: '0 2px 10px rgba(79,70,229,0.3)',
                                            border: 'none',
                                        }}
                                    >
                                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor">
                                            <path d="M12 2l2.4 7.2L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z" opacity="0.95" />
                                            <path d="M5 3l.8 2.2L8 6l-2.2.8L5 9l-.8-2.2L2 6l2.2-.8L5 3z" opacity="0.6" />
                                        </svg>
                                        Create with AI
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap gap-6 mb-6 items-start">
                                {charts.map(chart => <React.Fragment key={chart.id}>{renderChartCard(chart)}</React.Fragment>)}
                            </div>

                            {/* Floating Add Chart Button — hidden when viewing another admin */}
                            {!isViewingOtherAdmin && (
                                <div className="flex justify-center items-center gap-3 mt-6 flex-wrap">
                                    <button
                                        onClick={addChart}
                                        className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-all inline-flex items-center gap-1.5 hover:scale-105"
                                    >
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Add Another Chart
                                    </button>
                                    <button
                                        onClick={() => setAiChatOpen(true)}
                                        className="px-4 py-2 text-xs font-semibold rounded-lg transition-all inline-flex items-center gap-1.5 hover:scale-105"
                                        style={{
                                            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                                            color: 'white',
                                            boxShadow: '0 2px 8px rgba(79,70,229,0.25)',
                                            border: 'none',
                                        }}
                                    >
                                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor">
                                            <path d="M12 2l2.4 7.2L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4L12 2z" opacity="0.95" />
                                            <path d="M5 3l.8 2.2L8 6l-2.2.8L5 9l-.8-2.2L2 6l2.2-.8L5 3z" opacity="0.6" />
                                        </svg>
                                        Create with AI
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* AI Chart Assistant panel */}
            <AiAnalyticsChat
                isOpen={aiChatOpen}
                onClose={() => setAiChatOpen(false)}
                acctId={acctId}
                collections={collections}
                currentCharts={charts}
                onAddCharts={handleAiChartsGenerated}
            />

            {/* Delete confirmation dialog */}
            <DeleteConfirmation
                isOpen={pendingDeleteId !== null}
                onClose={() => setPendingDeleteId(null)}
                onConfirm={() => { removeChart(pendingDeleteId); setPendingDeleteId(null); }}
                title="Delete Chart"
                message="Are you sure you want to delete this chart? This action cannot be undone."
                confirmLabel="Delete"
            />
        </>
    );
};

export default AnalyticsDashboardPage;

import React, { useState, useEffect, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import api from '../api/axiosConfig';
import { useAccount } from '../context/AccountContext';
import LoadingMask from './LoadingMask';
import { resolveActiveAcctNo } from '../utils/accountHelpers';
import { Combobox } from './ui/Combobox';
import {
    PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

// Colors for charts - Grayscale palette
const COLORS = [
    '#1a1a1a', '#2d2d2d', '#3d3d3d', '#525252', '#666666',
    '#7a7a7a', '#8f8f8f', '#a3a3a3', '#b8b8b8', '#cccccc',
    '#000000', '#404040', '#595959', '#737373', '#8c8c8c'
];

// Render Pie Chart with Recharts
const renderPieChart = (chartData, yAxisLabel) => (
    <ResponsiveContainer width="100%" height={300}>
        <PieChart>
            <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
            >
                {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
            </Pie>
            <Tooltip
                contentStyle={{
                    backgroundColor: '#fff',
                    border: '2px solid #e0e0e0',
                    borderRadius: '12px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
                }}
                formatter={(value, name) => [value, yAxisLabel]}
            />
            <Legend formatter={(value, entry) => `${value} (${entry.payload.value.toLocaleString()})`} />
        </PieChart>
    </ResponsiveContainer>
);

// Render Bar Chart with Recharts
const renderBarChart = (chartData, yAxisLabel) => (
    <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
                dataKey="name"
                tick={{ fill: '#64748b', fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                height={60}
            />
            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
            <Tooltip
                contentStyle={{
                    backgroundColor: '#fff',
                    border: '2px solid #e0e0e0',
                    borderRadius: '12px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
                }}
                formatter={(value) => [value, yAxisLabel]}
            />
            <Legend />
            <Bar
                dataKey="value"
                name={yAxisLabel}
                fill="#1a1a1a"
                radius={[8, 8, 0, 0]}
            >
                {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
            </Bar>
        </BarChart>
    </ResponsiveContainer>
);

// Render Line Chart with Recharts
const renderLineChart = (chartData, yAxisLabel) => (
    <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
                dataKey="name"
                tick={{ fill: '#64748b', fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                height={60}
            />
            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
            <Tooltip
                contentStyle={{
                    backgroundColor: '#fff',
                    border: '2px solid #e0e0e0',
                    borderRadius: '12px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
                }}
                formatter={(value) => [value, yAxisLabel]}
            />
            <Legend />
            <Line
                type="monotone"
                dataKey="value"
                name={yAxisLabel}
                stroke="#1a1a1a"
                strokeWidth={3}
                dot={{ fill: '#1a1a1a', strokeWidth: 2, r: 5 }}
                activeDot={{ r: 7, fill: '#3d3d3d' }}
            />
        </LineChart>
    </ResponsiveContainer>
);

// Render Heat Map — colored tile grid, intensity proportional to value magnitude
const renderHeatmapChart = (chartData, yAxisLabel) => {
    const max = Math.max(...chartData.map(d => d.value));
    const min = Math.min(...chartData.map(d => d.value));
    const range = max - min || 1;
    return (
        <div className="w-full overflow-auto p-3" style={{ minHeight: 200 }}>
            <div className="flex items-center gap-3 mb-3 flex-wrap">
                <span className="text-xs text-gray-500 font-medium">Scale:</span>
                {[0, 0.25, 0.5, 0.75, 1].map(i => (
                    <div key={i} className="flex items-center gap-1">
                        <div className="w-4 h-4 rounded" style={{ backgroundColor: `rgba(26,26,26,${0.1 + i * 0.9})` }} />
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
                            style={{ backgroundColor: `rgba(26,26,26,${0.1 + intensity * 0.9})` }}
                            className="flex flex-col items-center justify-center rounded-xl p-3 min-w-[72px] cursor-default transition-transform duration-150 hover:scale-110"
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

// Render Number Chart — large KPI total with top breakdown
const renderNumberChart = (chartData, yAxisLabel) => {
    const total = chartData.reduce((sum, d) => sum + (d.value || 0), 0);
    const fmt = (n) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : n.toLocaleString();
    const topItems = [...chartData].sort((a, b) => b.value - a.value).slice(0, 4);
    return (
        <div className="flex flex-col items-center justify-center gap-4 py-6 px-4">
            <div className="text-center">
                <div className="text-7xl font-black tracking-tighter text-gray-900 leading-none">
                    {fmt(total)}
                </div>
                <div className="text-sm text-gray-500 mt-3 font-medium uppercase tracking-widest">{yAxisLabel}</div>
            </div>
            {topItems.length > 1 && (
                <div className="flex flex-wrap justify-center gap-3 mt-2">
                    {topItems.map((item, i) => (
                        <div key={i} className="text-center bg-gray-50 rounded-xl px-4 py-2 border border-gray-200 min-w-[80px]">
                            <div className="text-lg font-bold text-gray-800">{item.value.toLocaleString()}</div>
                            <div className="text-[11px] text-gray-500 truncate max-w-[100px]">{item.name}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ── Render multi-series grouped/stacked bar chart ─────────────────────
const renderMultiSeriesBarChartD = (chartData, yAxisLabel, stacked = false) => {
    const hasZKey = chartData.length > 0 && chartData[0].zKey !== undefined;
    if (!hasZKey) return renderBarChart(chartData, yAxisLabel, 'vertical');
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
    const DCOLORS = ['#1a1a1a', '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316'];
    return (
        <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} margin={{ top: 16, right: 30, left: 10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11 }} angle={-35} textAnchor="end" height={55} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '2px solid #e0e0e0', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
                <Legend />
                {zKeys.map((zKey, i) => (
                    <Bar key={zKey} dataKey={zKey} name={zKey} fill={DCOLORS[i % DCOLORS.length]} stackId={stacked ? 'a' : undefined} maxBarSize={50} />
                ))}
            </BarChart>
        </ResponsiveContainer>
    );
};

// ── Render nested (grouped/stacked) pie chart ──────────────────────────
const renderNestedPieChartD = (chartData, yAxisLabel) => {
    const hasZKey = chartData.length > 0 && chartData[0].zKey !== undefined;
    if (!hasZKey) return renderPieChart(chartData, yAxisLabel);
    const DCOLORS = ['#1a1a1a', '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316'];
    const innerMap = {};
    chartData.forEach(({ name, value }) => { innerMap[name] = (innerMap[name] || 0) + value; });
    const innerData = Object.entries(innerMap).map(([name, value]) => ({ name, value }));
    const outerData = chartData.map(d => ({ name: `${d.name} › ${d.zKey}`, value: d.value }));
    const renderLabel = ({ name, percent }) => percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : '';
    return (
        <ResponsiveContainer width="100%" height={320}>
            <PieChart>
                <Pie data={innerData} dataKey="value" cx="50%" cy="50%" outerRadius={80} label={renderLabel} labelLine={false}>
                    {innerData.map((_, i) => <Cell key={i} fill={DCOLORS[i % DCOLORS.length]} />)}
                </Pie>
                <Pie data={outerData} dataKey="value" cx="50%" cy="50%" innerRadius={90} outerRadius={130} label={({ name, percent }) => percent > 0.04 ? name.split(' › ')[1] : ''} labelLine={true}>
                    {outerData.map((_, i) => <Cell key={i} fill={DCOLORS[i % DCOLORS.length]} opacity={0.7} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '2px solid #e0e0e0', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
                <Legend formatter={(value, entry) => `${value} (${entry.payload.value.toLocaleString()})`} />
            </PieChart>
        </ResponsiveContainer>
    );
};

// Chart Renderer Component
const ChartRenderer = ({ chartConfig, fetchChartData }) => {
    const [chartData, setChartData] = useState([]);
    const [chartLoading, setChartLoading] = useState(false);

    useEffect(() => {
        const loadChartData = async () => {
            if (chartConfig.xAxis && chartConfig.yAxis && chartConfig.aggregation) {
                setChartLoading(true);
                const data = await fetchChartData(chartConfig);
                setChartData(data);
                setChartLoading(false);
            }
        };

        loadChartData();
    }, [chartConfig.xAxis, chartConfig.yAxis, chartConfig.zAxis, chartConfig.aggregation, chartConfig.chartMode, chartConfig.dateFilterFrom, chartConfig.dateFilterTo, chartConfig._refreshKey]);

    const yAxisLabel = chartConfig.yAxis?.label || 'Value';

    if (chartLoading) return (
        <div className="relative min-h-[200px]">
            <LoadingMask loading={true} title="Loading chart data..." message="Please wait..." />
        </div>
    );

    if (!chartConfig.chartType) return <div className="text-center py-12 text-gray-500 text-sm">Select chart type to begin</div>;
    if (!chartConfig.xAxis) return <div className="text-center py-12 text-gray-500 text-sm">{chartConfig.chartType?.value === 'pie' ? 'Select Collection' : 'Select X axis'}</div>;
    if (!chartConfig.yAxis) return <div className="text-center py-12 text-gray-500 text-sm">{chartConfig.chartType?.value === 'pie' ? 'Select Value' : 'Select Y axis'}</div>;
    if (!chartConfig.aggregation) return <div className="text-center py-12 text-gray-500 text-sm">Select aggregation type</div>;
    if (!chartData.length) return <div className="text-center py-12 text-gray-500 text-sm">No data available</div>;

    const mode = chartConfig.chartMode;
    switch (chartConfig.chartType.value) {
        case 'pie':
            return (mode === 'grouped' || mode === 'stacked')
                ? renderNestedPieChartD(chartData, yAxisLabel)
                : renderPieChart(chartData, yAxisLabel);
        case 'bar':
            return (mode === 'grouped' || mode === 'stacked')
                ? renderMultiSeriesBarChartD(chartData, yAxisLabel, mode === 'stacked')
                : renderBarChart(chartData, yAxisLabel);
        case 'line':
            return renderLineChart(chartData, yAxisLabel);
        case 'heatmap':
            return renderHeatmapChart(chartData, yAxisLabel);
        case 'number':
            return renderNumberChart(chartData, yAxisLabel);
        default:
            return null;
    }
};

const AnalyticsDialog = ({ isOpen, onClose }) => {
    const { acctNo, acctId } = useAccount();
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(false);
    const [fields, setFields] = useState([]);
    const [chartDataCache, setChartDataCache] = useState({});

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

    // Generate columns from fields
    const columns = fields.map(field => ({
        value: field,
        label: formatFieldName(field)
    }));

    // Aggregation types
    const aggregationTypes = [
        { value: 'count', label: 'Count' },
        { value: 'sum', label: 'Sum' }
    ];

    // Default chart configuration
    const defaultChartConfig = {
        chartType: null,
        xAxis: null,
        yAxis: null,
        zAxis: null,
        aggregation: null,
        chartMode: null,
        dateFilterFrom: '',
        dateFilterTo: '',
        _refreshKey: 0
    };

    // Load saved charts from localStorage (keyed by account)
    const getStorageKey = (acct) =>
        `analyticsDialog_charts_${acct || 'default'}`;

    const loadSavedCharts = (acct) => {
        try {
            const saved = localStorage.getItem(getStorageKey(acct));
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    };

    // State for charts — fully restored from localStorage (all filters + axes)
    const [charts, setCharts] = useState(() => {
        const initAcctNo = resolveActiveAcctNo();
        const saved = loadSavedCharts(initAcctNo);
        return saved.map(entry => ({
            ...defaultChartConfig,
            ...entry,
            id: entry.id
        }));
    });
    const [nextChartId, setNextChartId] = useState(() => {
        const initAcctNo = resolveActiveAcctNo();
        const saved = loadSavedCharts(initAcctNo);
        return saved.length > 0 ? Math.max(...saved.map(c => c.id)) + 1 : 1;
    });

    // Update individual chart config
    const updateChartConfig = (chartId, field, value) => {
        setCharts(prev => prev.map(chart =>
            chart.id === chartId ? { ...chart, [field]: value } : chart
        ));
    };

    // Add new chart
    const addChart = () => {
        const newChart = {
            ...defaultChartConfig,
            id: nextChartId
        };
        setCharts(prev => [...prev, newChart]);
        setNextChartId(prev => prev + 1);
    };

    // Remove chart
    const removeChart = (chartId) => {
        setCharts(prev => prev.filter(chart => chart.id !== chartId));
    };

    // Fetch all leads for analytics
    useEffect(() => {
        if (isOpen) {
            fetchLeadsData();
        }
    }, [isOpen]);

    // Reload charts from localStorage when the active account changes
    useEffect(() => {
        if (!acctNo) return;
        const saved = loadSavedCharts(acctNo);
        const restored = saved.map(entry => ({ ...defaultChartConfig, ...entry, id: entry.id }));
        setCharts(restored);
        setNextChartId(restored.length > 0 ? Math.max(...restored.map(c => c.id)) + 1 : 1);
    }, [acctNo]); // eslint-disable-line react-hooks/exhaustive-deps

    // Persist all chart config to localStorage whenever charts change (keyed by account)
    useEffect(() => {
        try {
            const chartsToSave = charts.map(chart => ({
                id: chart.id,
                chartType: chart.chartType,
                xAxis: chart.xAxis,
                yAxis: chart.yAxis,
                zAxis: chart.zAxis || null,
                chartMode: chart.chartMode || null,
                aggregation: chart.aggregation,
                dateFilterFrom: chart.dateFilterFrom,
                dateFilterTo: chart.dateFilterTo
            }));
            localStorage.setItem(getStorageKey(acctNo), JSON.stringify(chartsToSave));
        } catch {
            // ignore storage errors
        }
    }, [charts, acctNo]);

    const fetchLeadsData = async () => {
        setLoading(true);
        try {
            // Scope to the active collection so the axis options include that
            // collection's custom fields (plus the system + stage fields).
            const collectionId = acctId ? (() => { try { const s = localStorage.getItem('selectedCollection'); const p = s ? JSON.parse(s) : {}; return (p && typeof p === 'object' && !Array.isArray(p)) ? (p[acctId] ?? null) : null; } catch { return null; } })() : null;
            const params = { limit: 1000, ...(acctId && { acctId }), ...(collectionId && { collectionId }) };
            const response = await api.get('/api/ui/leads', { params });
            setLeads(response.data.data || []);

            if (response.data.fields && response.data.fields.length > 0) {
                const excludeFields = ['__v', 'updatedAt'];
                const displayFields = response.data.fields.filter(field => !excludeFields.includes(field));
                setFields(displayFields);
            }
        } catch (err) {
            console.error('Error fetching leads:', err);
        } finally {
            setLoading(false);
        }
    };

    // Fetch chart data from API
    const fetchChartData = async (chartConfig) => {
        if (!chartConfig.xAxis || !chartConfig.yAxis || !chartConfig.aggregation) {
            return [];
        }

        // Create cache key
        const collectionId = acctId ? (() => { try { const s = localStorage.getItem('selectedCollection'); const p = s ? JSON.parse(s) : {}; return (p && typeof p === 'object' && !Array.isArray(p)) ? (p[acctId] ?? null) : null; } catch { return null; } })() : null;
        const cacheKey = JSON.stringify({
            xAxis: chartConfig.xAxis.value,
            yAxis: chartConfig.yAxis.value,
            aggregation: chartConfig.aggregation.value,
            dateFilterFrom: chartConfig.dateFilterFrom || '',
            dateFilterTo: chartConfig.dateFilterTo || '',
            collectionId: collectionId || '',
            zAxis: (chartConfig.chartMode === 'grouped' || chartConfig.chartMode === 'stacked') && chartConfig.zAxis ? chartConfig.zAxis.value : '',
            chartMode: chartConfig.chartMode || ''
        });

        // Return cached data if available
        if (chartDataCache[cacheKey]) {
            return chartDataCache[cacheKey];
        }

        try {
            const params = {
                xAxis: chartConfig.xAxis.value,
                yAxis: chartConfig.yAxis.value,
                aggregation: chartConfig.aggregation.value,
                ...(acctId && { acctId }),
                ...(collectionId && { collectionId }),
                ...((chartConfig.chartMode === 'grouped' || chartConfig.chartMode === 'stacked') && chartConfig.zAxis ? { zAxis: chartConfig.zAxis.value } : {}),
            };

            if (chartConfig.dateFilterFrom) {
                params.dateFrom = chartConfig.dateFilterFrom;
            }
            if (chartConfig.dateFilterTo) {
                params.dateTo = chartConfig.dateFilterTo;
            }

            const response = await api.get('/api/ui/analytics/chart-data', { params });
            const data = response.data.data || [];

            // Sort descending by value
            data.sort((a, b) => b.value - a.value);

            // Cache the result
            setChartDataCache(prev => ({
                ...prev,
                [cacheKey]: data
            }));

            return data;
        } catch (err) {
            console.error('Error fetching chart data:', err);
            return [];
        }
    };

    // Process data based on X and Y axis selection for a specific chart (fallback for client-side processing)
    const getChartData = (chartConfig) => {
        if (!leads.length || !chartConfig.xAxis || !chartConfig.yAxis || !chartConfig.aggregation) return [];

        let filteredLeads = leads;
        if (chartConfig.dateFilter) {
            filteredLeads = leads.filter(lead => {
                if (lead.createdAt) {
                    const leadDate = new Date(lead.createdAt).toISOString().split('T')[0];
                    return leadDate === chartConfig.dateFilter;
                }
                return false;
            });
        }

        const dataMap = {};

        filteredLeads.forEach(lead => {
            let xKey = lead[chartConfig.xAxis.value];

            if (chartConfig.xAxis.value === 'createdAt' && xKey) {
                xKey = new Date(xKey).toLocaleDateString();
            }

            if (!xKey) xKey = 'Unknown';

            if (!dataMap[xKey]) {
                dataMap[xKey] = { values: [], count: 0 };
            }

            dataMap[xKey].count++;

            if (chartConfig.aggregation.value === 'sum') {
                const yValue = lead[chartConfig.yAxis.value];
                const numValue = parseFloat(yValue);
                if (!isNaN(numValue)) {
                    dataMap[xKey].values.push(numValue);
                }
            }
        });

        return Object.entries(dataMap).map(([name, data]) => {
            let value;

            if (chartConfig.aggregation.value === 'count') {
                value = data.count;
            } else if (chartConfig.aggregation.value === 'sum') {
                value = data.values.reduce((sum, val) => sum + val, 0);
            }

            return { name, value };
        }).sort((a, b) => b.value - a.value);
    };

    const renderChart = (chartConfig) => {
        return <ChartRenderer chartConfig={chartConfig} fetchChartData={fetchChartData} />;
    };

    // Render single chart card
    const renderChartCard = (chartConfig) => (
        <div key={chartConfig.id} className="bg-white rounded-2xl border-2 border-gray-200 p-6 shadow-lg hover:shadow-xl transition-all duration-300 animate-scale-in">
            {/* Chart Header */}
            <div className="flex justify-between items-start mb-4">
                <h4 className="text-base font-bold text-gray-900 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-black"></div>
                    Chart {chartConfig.id}
                    {chartConfig.xAxis && chartConfig.yAxis && chartConfig.aggregation && (
                        <span className="font-normal text-gray-500 text-sm ml-2">
                            {chartConfig.xAxis.label} vs {chartConfig.yAxis.label} ({chartConfig.aggregation.label})
                        </span>
                    )}
                </h4>
                <div className="flex items-center gap-2">
                    {/* Quick date presets */}
                    {(() => {
                        const toISO = (d) => d.toISOString().split('T')[0];
                        const applyPreset = (preset) => {
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            let from, to;
                            if (preset === 'today') {
                                from = toISO(today);
                                to = toISO(today);
                            } else if (preset === 'yesterday') {
                                const y = new Date(today); y.setDate(y.getDate() - 1);
                                from = toISO(y); to = toISO(y);
                            } else if (preset === 'last2') {
                                const d = new Date(today); d.setDate(d.getDate() - 2);
                                from = toISO(d); to = toISO(today);
                            }
                            updateChartConfig(chartConfig.id, 'dateFilterFrom', from);
                            updateChartConfig(chartConfig.id, 'dateFilterTo', to);
                        };
                        const presets = [
                            { key: 'today', label: 'Today' },
                            { key: 'yesterday', label: 'Yesterday' },
                            { key: 'last2', label: 'Last 2 Days' },
                        ];
                        return (
                            <div className="flex items-center gap-1">
                                {presets.map(p => (
                                    <button
                                        key={p.key}
                                        onClick={() => applyPreset(p.key)}
                                        className="px-2 py-1 text-[10px] font-semibold rounded-md border border-gray-300 bg-gray-50 text-gray-700 hover:bg-black hover:text-white hover:border-black transition-all duration-200"
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        );
                    })()}

                    <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-600">From:</label>
                        <input
                            type="date"
                            value={chartConfig.dateFilterFrom}
                            onChange={(e) => updateChartConfig(chartConfig.id, 'dateFilterFrom', e.target.value)}
                            className="ds-input ds-input--sm"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-600">To:</label>
                        <input
                            type="date"
                            value={chartConfig.dateFilterTo}
                            onChange={(e) => updateChartConfig(chartConfig.id, 'dateFilterTo', e.target.value)}
                            className="ds-input ds-input--sm"
                        />
                    </div>
                    {(chartConfig.dateFilterFrom || chartConfig.dateFilterTo) && (
                        <button
                            onClick={() => {
                                updateChartConfig(chartConfig.id, 'dateFilterFrom', '');
                                updateChartConfig(chartConfig.id, 'dateFilterTo', '');
                            }}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                            title="Clear date filters"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                    <button
                        onClick={() => {
                            // Bust the cache for this chart so fresh data is fetched
                            const cacheKey = JSON.stringify({
                                xAxis: chartConfig.xAxis?.value,
                                yAxis: chartConfig.yAxis?.value,
                                aggregation: chartConfig.aggregation?.value,
                                dateFilterFrom: chartConfig.dateFilterFrom || '',
                                dateFilterTo: chartConfig.dateFilterTo || ''
                            });
                            setChartDataCache(prev => {
                                const next = { ...prev };
                                delete next[cacheKey];
                                return next;
                            });
                            updateChartConfig(chartConfig.id, '_refreshKey', (chartConfig._refreshKey || 0) + 1);
                        }}
                        className="p-1.5 text-gray-700 hover:text-black hover:bg-gray-100 rounded-lg transition-all"
                        title="Refresh chart data"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </button>
                    <button
                        onClick={() => removeChart(chartConfig.id)}
                        className="p-1.5 text-gray-700 hover:text-black hover:bg-gray-100 rounded-lg transition-all ml-2"
                        title="Delete chart"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Mode toggle for pie/bar charts */}
            {(chartConfig.chartType?.value === 'pie' || chartConfig.chartType?.value === 'bar') && (
                <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-semibold text-gray-700">Mode:</span>
                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden text-[11px] font-semibold">
                        {[{ v: null, label: 'Simple' }, { v: 'grouped', label: 'Grouped' }, { v: 'stacked', label: 'Stacked' }].map(({ v, label }) => (
                            <button
                                key={label}
                                onClick={() => updateChartConfig(chartConfig.id, 'chartMode', v)}
                                className={chartConfig.chartMode === v
                                    ? 'px-2.5 py-1 bg-gray-900 text-white'
                                    : 'px-2.5 py-1 bg-white text-gray-700 hover:bg-gray-50'}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Chart Controls */}
            <div className={`grid gap-3 mb-4 ${((chartConfig.chartType?.value === 'pie' || chartConfig.chartType?.value === 'bar') &&
                (chartConfig.chartMode === 'grouped' || chartConfig.chartMode === 'stacked')) ? 'grid-cols-5' : 'grid-cols-4'
                }`}>
                <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Chart Type</label>
                    <Combobox
                        value={chartConfig.chartType?.value ?? null}
                        onChange={(val) => updateChartConfig(chartConfig.id, 'chartType', chartTypes.find(o => o.value === val) ?? null)}
                        options={chartTypes}
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        {chartConfig.chartType?.value === 'pie' ? 'Collection' : 'X Axis'}
                    </label>
                    <Combobox
                        value={chartConfig.xAxis?.value ?? null}
                        onChange={(val) => updateChartConfig(chartConfig.id, 'xAxis', columns.find(o => o.value === val) ?? null)}
                        options={columns}
                    />
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                        {chartConfig.chartType?.value === 'pie' ? 'Value' : 'Y Axis'}
                    </label>
                    <Combobox
                        value={chartConfig.yAxis?.value ?? null}
                        onChange={(val) => updateChartConfig(chartConfig.id, 'yAxis', columns.find(o => o.value === val) ?? null)}
                        options={columns}
                    />
                </div>
                {/* Group By — only for grouped/stacked modes */}
                {(chartConfig.chartType?.value === 'pie' || chartConfig.chartType?.value === 'bar') &&
                    (chartConfig.chartMode === 'grouped' || chartConfig.chartMode === 'stacked') && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Group By</label>
                            <Combobox
                                value={chartConfig.zAxis?.value ?? null}
                                onChange={(val) => updateChartConfig(chartConfig.id, 'zAxis', columns.find(o => o.value === val) ?? null)}
                                options={columns}
                            />
                        </div>
                    )}
                <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Aggregation</label>
                    <Combobox
                        value={chartConfig.aggregation?.value ?? null}
                        onChange={(val) => updateChartConfig(chartConfig.id, 'aggregation', aggregationTypes.find(o => o.value === val) ?? null)}
                        options={aggregationTypes}
                    />
                </div>
            </div>

            {/* Chart Display */}
            <div className="bg-gray-50 rounded-xl p-4 border-2 border-gray-100">
                {renderChart(chartConfig)}
            </div>
        </div>
    );

    return (
        <Transition appear show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={onClose}>
                <Transition.Child
                    as={Fragment}
                    enter="ease-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in duration-200"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <Transition.Child
                            as={Fragment}
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="w-full max-w-7xl transform overflow-hidden rounded-3xl bg-white p-8 text-left align-middle shadow-2xl transition-all max-h-[90vh] overflow-y-auto border-2 border-gray-200">
                                {/* Header */}
                                <div className="flex justify-between items-center mb-8 pb-6 border-b-2 border-gray-200">
                                    <Dialog.Title as="h3" className="text-3xl font-bold text-gray-900">
                                        Analytics Dashboard
                                    </Dialog.Title>
                                    <button
                                        onClick={onClose}
                                        className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all"
                                    >
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>

                                {/* Charts Grid or Empty State */}
                                {charts.length === 0 ? (
                                    <div className="text-center py-20 animate-fade-in">
                                        <div className="w-20 h-20 mx-auto mb-6 bg-gray-100 rounded-2xl flex items-center justify-center border-2 border-gray-300">
                                            <svg className="w-10 h-10 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                            </svg>
                                        </div>
                                        <h3 className="text-2xl font-bold text-gray-900 mb-3">No Charts Yet</h3>
                                        <p className="text-gray-500 mb-8 text-lg">Get started by adding your first chart to visualize your data</p>
                                        <button
                                            onClick={addChart}
                                            className="btn-primary inline-flex items-center gap-2"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                            </svg>
                                            Add Your First Chart
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                            {charts.map(chart => renderChartCard(chart))}
                                        </div>

                                        {/* Floating Add Chart Button */}
                                        <div className="flex justify-center mt-8">
                                            <button
                                                onClick={addChart}
                                                className="btn-secondary inline-flex items-center gap-2 hover:scale-105"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                </svg>
                                                Add Another Chart
                                            </button>
                                        </div>
                                    </>
                                )}
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};

export default AnalyticsDialog;

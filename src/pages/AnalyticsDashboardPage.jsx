import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosConfig';
import { Combobox, ComboboxOption, ComboboxLabel } from '../fieldsComponents/appointments/combobox';
import {
    PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const AnalyticsDashboardPage = () => {
    const navigate = useNavigate();
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(false);
    const [fields, setFields] = useState([]);

    // Chart types
    const chartTypes = [
        { value: 'pie', label: 'Pie Chart' },
        { value: 'bar', label: 'Bar Chart' },
        { value: 'line', label: 'Line Chart' }
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
        aggregation: null,
        dateFilterFrom: '',
        dateFilterTo: ''
    };

    // State for charts
    const [charts, setCharts] = useState([]);
    const [nextChartId, setNextChartId] = useState(1);
    const [chartDataCache, setChartDataCache] = useState({});
    const [chartLoadingState, setChartLoadingState] = useState({});

    // Update individual chart config
    const updateChartConfig = (chartId, field, value) => {
        setCharts(prev => prev.map(chart => {
            if (chart.id === chartId) {
                const updatedChart = { ...chart, [field]: value };
                // Fetch data when X, Y, aggregation, or date filters change
                if (['xAxis', 'yAxis', 'aggregation', 'dateFilterFrom', 'dateFilterTo'].includes(field)) {
                    fetchChartDataFromBackend(chartId, updatedChart);
                }
                return updatedChart;
            }
            return chart;
        }));
    };

    // Fetch chart data from backend API
    const fetchChartDataFromBackend = async (chartId, chartConfig) => {
        if (!chartConfig.xAxis || !chartConfig.yAxis || !chartConfig.aggregation) {
            return;
        }

        setChartLoadingState(prev => ({ ...prev, [chartId]: true }));
        try {
            const params = {
                xAxis: chartConfig.xAxis.value,
                yAxis: chartConfig.yAxis.value,
                aggregation: chartConfig.aggregation.value,
                ...(chartConfig.dateFilterFrom && { dateFrom: chartConfig.dateFilterFrom }),
                ...(chartConfig.dateFilterTo && { dateTo: chartConfig.dateFilterTo })
            };

            const response = await api.get('/api/analytics/chart-data', { params });
            setChartDataCache(prev => ({
                ...prev,
                [chartId]: response.data.data || []
            }));
        } catch (err) {
            console.error('Error fetching chart data:', err);
            setChartDataCache(prev => ({
                ...prev,
                [chartId]: []
            }));
        } finally {
            setChartLoadingState(prev => ({ ...prev, [chartId]: false }));
        }
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

    // Fetch fields for dropdowns
    useEffect(() => {
        fetchFieldsData();
    }, []);

    const fetchFieldsData = async () => {
        setLoading(true);
        try {
            const params = { limit: 1 };
            const response = await api.get('/api/leads', { params });

            if ((response.data.data || []).length > 0) {
                const firstLead = response.data.data[0];
                const excludeFields = ['__v', 'updatedAt', '_id'];
                const displayFields = Object.keys(firstLead).filter(field => !excludeFields.includes(field));
                setFields(displayFields);
            }
        } catch (err) {
            console.error('Error fetching fields:', err);
        } finally {
            setLoading(false);
        }
    };

    // Get chart data from cache
    const getChartData = (chartConfig, chartId) => {
        return chartDataCache[chartId] || [];
    };

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
                <Legend />
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

    const renderChart = (chartConfig) => {
        const isLoading = chartLoadingState[chartConfig.id];
        const chartData = getChartData(chartConfig, chartConfig.id);
        const yAxisLabel = chartConfig.yAxis?.label || 'Value';

        if (isLoading) return (
            <div className="text-center py-12">
                <div className="spinner mx-auto"></div>
                <p className="text-gray-600 mt-4 text-sm font-medium">Loading chart data...</p>
            </div>
        );

        if (!chartConfig.chartType) return <div className="text-center py-12 text-gray-500 text-sm">Select chart type to begin</div>;
        if (!chartConfig.xAxis) return <div className="text-center py-12 text-gray-500 text-sm">Select X axis</div>;
        if (!chartConfig.yAxis) return <div className="text-center py-12 text-gray-500 text-sm">Select Y axis</div>;
        if (!chartConfig.aggregation) return <div className="text-center py-12 text-gray-500 text-sm">Select aggregation type</div>;
        if (!chartData.length) return <div className="text-center py-12 text-gray-500 text-sm">No data available</div>;

        switch (chartConfig.chartType.value) {
            case 'pie':
                return renderPieChart(chartData, yAxisLabel);
            case 'bar':
                return renderBarChart(chartData, yAxisLabel);
            case 'line':
                return renderLineChart(chartData, yAxisLabel);
            default:
                return null;
        }
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
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-600">From:</label>
                        <input
                            type="date"
                            value={chartConfig.dateFilterFrom}
                            onChange={(e) => updateChartConfig(chartConfig.id, 'dateFilterFrom', e.target.value)}
                            className="px-2 py-1 text-xs border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-all"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-600">To:</label>
                        <input
                            type="date"
                            value={chartConfig.dateFilterTo}
                            onChange={(e) => updateChartConfig(chartConfig.id, 'dateFilterTo', e.target.value)}
                            className="px-2 py-1 text-xs border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-all"
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

            {/* Chart Controls */}
            <div className="grid grid-cols-4 gap-3 mb-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Chart Type</label>
                    <Combobox
                        value={chartConfig.chartType}
                        onChange={(val) => updateChartConfig(chartConfig.id, 'chartType', val)}
                        displayValue={(option) => option?.label || 'Select...'}
                        options={chartTypes}
                    >
                        {(option) => (
                            <ComboboxOption key={`chart-type-${chartConfig.id}-${option.value}`} value={option}>
                                <ComboboxLabel>{option.label}</ComboboxLabel>
                            </ComboboxOption>
                        )}
                    </Combobox>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">X Axis</label>
                    <Combobox
                        value={chartConfig.xAxis}
                        onChange={(val) => updateChartConfig(chartConfig.id, 'xAxis', val)}
                        displayValue={(option) => option?.label || 'Select...'}
                        options={columns}
                    >
                        {(option) => (
                            <ComboboxOption key={`x-axis-${chartConfig.id}-${option.value}`} value={option}>
                                <ComboboxLabel>{option.label}</ComboboxLabel>
                            </ComboboxOption>
                        )}
                    </Combobox>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Y Axis</label>
                    <Combobox
                        value={chartConfig.yAxis}
                        onChange={(val) => updateChartConfig(chartConfig.id, 'yAxis', val)}
                        displayValue={(option) => option?.label || 'Select...'}
                        options={columns}
                    >
                        {(option) => (
                            <ComboboxOption key={`y-axis-${chartConfig.id}-${option.value}`} value={option}>
                                <ComboboxLabel>{option.label}</ComboboxLabel>
                            </ComboboxOption>
                        )}
                    </Combobox>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Aggregation</label>
                    <Combobox
                        value={chartConfig.aggregation}
                        onChange={(val) => updateChartConfig(chartConfig.id, 'aggregation', val)}
                        displayValue={(option) => option?.label || 'Select...'}
                        options={aggregationTypes}
                    >
                        {(option) => (
                            <ComboboxOption key={`agg-${chartConfig.id}-${option.value}`} value={option}>
                                <ComboboxLabel>{option.label}</ComboboxLabel>
                            </ComboboxOption>
                        )}
                    </Combobox>
                </div>
            </div>

            {/* Chart Display */}
            <div className="bg-gray-50 rounded-xl p-4 border-2 border-gray-100">
                {renderChart(chartConfig)}
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 shadow-sm">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex justify-between items-center">
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                            </div>
                            Analytics Dashboard
                        </h1>
                        <button
                            onClick={() => navigate('/leads')}
                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-all font-medium text-sm flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back to Dashboard
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="container mx-auto px-4 py-6">
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
                            className="px-6 py-3 bg-black hover:bg-gray-800 text-white rounded-lg transition-all font-medium inline-flex items-center gap-2"
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
                                className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded-lg transition-all font-medium inline-flex items-center gap-2 hover:scale-105"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                Add Another Chart
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AnalyticsDashboardPage;

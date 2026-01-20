import React, { useState, useEffect, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import api from '../api/axiosConfig';
import { Combobox, ComboboxOption, ComboboxLabel } from '../fieldsComponents/appointments/combobox';
import {
    PieChart, Pie, Cell, BarChart, Bar, LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const AnalyticsDialog = ({ isOpen, onClose }) => {
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
        dateFilter: ''
    };

    // State for charts
    const [charts, setCharts] = useState([]);
    const [nextChartId, setNextChartId] = useState(1);

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

    const fetchLeadsData = async () => {
        setLoading(true);
        try {
            const params = { limit: 1000 };
            const response = await api.get('/api/leads', { params });
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

    // Process data based on X and Y axis selection for a specific chart
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
        const chartData = getChartData(chartConfig);
        const yAxisLabel = chartConfig.yAxis?.label || 'Value';

        if (loading) return (
            <div className="text-center py-12">
                <div className="spinner mx-auto"></div>
                <p className="text-gray-600 mt-4 text-sm font-medium">Loading data...</p>
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
                    <input
                        type="date"
                        value={chartConfig.dateFilter}
                        onChange={(e) => updateChartConfig(chartConfig.id, 'dateFilter', e.target.value)}
                        className="px-3 py-1.5 text-xs border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 focus:border-transparent transition-all"
                    />
                    {chartConfig.dateFilter && (
                        <button
                            onClick={() => updateChartConfig(chartConfig.id, 'dateFilter', '')}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all"
                            title="Clear date filter"
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
                        displayValue={(option) => option?.label}
                        options={chartTypes}
                    >
                        {(option) => (
                            <ComboboxOption key={option.value} value={option}>
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
                        displayValue={(option) => option?.label}
                        options={columns}
                    >
                        {(option) => (
                            <ComboboxOption key={option.value} value={option}>
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
                        displayValue={(option) => option?.label}
                        options={columns}
                    >
                        {(option) => (
                            <ComboboxOption key={option.value} value={option}>
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
                        displayValue={(option) => option?.label}
                        options={aggregationTypes}
                    >
                        {(option) => (
                            <ComboboxOption key={option.value} value={option}>
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

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

    // Numeric columns that can be used for Y axis
    const numericColumns = [
        { value: '_count', label: 'Count (Records)' },
        ...columns
    ];

    // Default chart configuration for 4 charts
    const defaultChartConfig = {
        chartType: chartTypes[0],
        xAxis: null,
        yAxis: { value: '_count', label: 'Count (Records)' },
        dateFilter: ''
    };

    // State for 4 charts
    const [charts, setCharts] = useState([
        { ...defaultChartConfig, id: 1 },
        { ...defaultChartConfig, id: 2 },
        { ...defaultChartConfig, id: 3 },
        { ...defaultChartConfig, id: 4 }
    ]);

    // Update individual chart config
    const updateChartConfig = (chartId, field, value) => {
        setCharts(prev => prev.map(chart =>
            chart.id === chartId ? { ...chart, [field]: value } : chart
        ));
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
            const params = { limit: 1000 }; // Get all data for analytics
            const response = await api.get('/api/leads', { params });
            setLeads(response.data.data || []);

            // Set fields from API response
            if (response.data.fields && response.data.fields.length > 0) {
                const excludeFields = ['__v', 'updatedAt'];
                const displayFields = response.data.fields.filter(field => !excludeFields.includes(field));
                setFields(displayFields);

                // Set default X axis for each chart if not set
                if (displayFields.length > 0) {
                    setCharts(prev => prev.map((chart, index) => {
                        if (!chart.xAxis) {
                            const fieldIndex = index % displayFields.length;
                            return {
                                ...chart,
                                xAxis: { value: displayFields[fieldIndex], label: formatFieldName(displayFields[fieldIndex]) }
                            };
                        }
                        return chart;
                    }));
                }
            }
        } catch (err) {
            console.error('Error fetching leads:', err);
        } finally {
            setLoading(false);
        }
    };

    // Process data based on X and Y axis selection for a specific chart
    const getChartData = (chartConfig) => {
        if (!leads.length || !chartConfig.xAxis) return [];

        // Filter leads by date if dateFilter is set
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
            // Get X axis value (grouping key)
            let xKey = lead[chartConfig.xAxis.value];

            // Format date if X axis is createdAt
            if (chartConfig.xAxis.value === 'createdAt' && xKey) {
                xKey = new Date(xKey).toLocaleDateString();
            }

            if (!xKey) xKey = 'Unknown';

            // Initialize group if not exists
            if (!dataMap[xKey]) {
                dataMap[xKey] = { values: [], distinctSet: new Set() };
            }

            // Get Y axis value
            if (chartConfig.yAxis.value === '_count') {
                dataMap[xKey].values.push(1);
            } else {
                const yValue = lead[chartConfig.yAxis.value];
                if (yValue !== undefined && yValue !== null && yValue !== '') {
                    dataMap[xKey].values.push(yValue);
                    dataMap[xKey].distinctSet.add(yValue);
                }
            }
        });

        // Calculate values
        return Object.entries(dataMap).map(([name, data]) => {
            let value;

            if (chartConfig.yAxis.value === '_count') {
                value = data.values.length;
            } else {
                value = data.distinctSet.size;
            }

            return { name, value };
        }).sort((a, b) => b.value - a.value);
    };

    // Colors for charts
    const COLORS = [
        '#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af',
        '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a',
        '#10b981', '#059669', '#047857', '#065f46', '#064e3b',
        '#f59e0b', '#d97706', '#b45309', '#92400e', '#78350f'
    ];

    // Render Pie Chart with Recharts
    const renderPieChart = (chartData, yAxisLabel) => (
        <ResponsiveContainer width="100%" height={250}>
            <PieChart>
                <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                >
                    {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                </Pie>
                <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '8px' }}
                    formatter={(value, name) => [value, yAxisLabel]}
                />
                <Legend />
            </PieChart>
        </ResponsiveContainer>
    );

    // Render Bar Chart with Recharts
    const renderBarChart = (chartData, yAxisLabel) => (
        <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                    dataKey="name"
                    tick={{ fill: '#374151', fontSize: 10 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                />
                <YAxis tick={{ fill: '#374151', fontSize: 10 }} />
                <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '8px' }}
                    formatter={(value) => [value, yAxisLabel]}
                />
                <Legend />
                <Bar
                    dataKey="value"
                    name={yAxisLabel}
                    fill="#1f2937"
                    radius={[4, 4, 0, 0]}
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
        <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                    dataKey="name"
                    tick={{ fill: '#374151', fontSize: 10 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                />
                <YAxis tick={{ fill: '#374151', fontSize: 10 }} />
                <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #ccc', borderRadius: '8px' }}
                    formatter={(value) => [value, yAxisLabel]}
                />
                <Legend />
                <Line
                    type="monotone"
                    dataKey="value"
                    name={yAxisLabel}
                    stroke="#1f2937"
                    strokeWidth={2}
                    dot={{ fill: '#1f2937', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: '#3b82f6' }}
                />
            </LineChart>
        </ResponsiveContainer>
    );

    const renderChart = (chartConfig) => {
        const chartData = getChartData(chartConfig);
        const yAxisLabel = chartConfig.yAxis?.label || 'Value';

        if (loading) return <div className="text-center py-8 text-gray-600 text-sm">Loading...</div>;
        if (!chartConfig.xAxis) return <div className="text-center py-8 text-gray-500 text-sm">Select X axis</div>;
        if (!chartConfig.yAxis) return <div className="text-center py-8 text-gray-500 text-sm">Select Y axis</div>;
        if (!chartData.length) return <div className="text-center py-8 text-gray-500 text-sm">No data available</div>;

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
        <div key={chartConfig.id} className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col">
            {/* Chart Header with Date Filter */}
            <div className="flex justify-between items-start mb-3">
                <h4 className="text-sm font-semibold text-gray-800">
                    Chart {chartConfig.id}
                    {chartConfig.xAxis && chartConfig.yAxis && (
                        <span className="font-normal text-gray-500 ml-1">
                            - {chartConfig.xAxis.label} vs {chartConfig.yAxis.label}
                        </span>
                    )}
                </h4>
                <div className="flex items-center gap-2">
                    <input
                        type="date"
                        value={chartConfig.dateFilter}
                        onChange={(e) => updateChartConfig(chartConfig.id, 'dateFilter', e.target.value)}
                        className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-gray-500 focus:border-gray-500"
                    />
                    {chartConfig.dateFilter && (
                        <button
                            onClick={() => updateChartConfig(chartConfig.id, 'dateFilter', '')}
                            className="text-gray-400 hover:text-gray-600"
                            title="Clear date filter"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Chart Controls */}
            <div className="grid grid-cols-3 gap-2 mb-3">
                <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Chart Type</label>
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
                    <label className="block text-xs font-medium text-gray-600 mb-1">X Axis</label>
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
                    <label className="block text-xs font-medium text-gray-600 mb-1">Y Axis</label>
                    <Combobox
                        value={chartConfig.yAxis}
                        onChange={(val) => updateChartConfig(chartConfig.id, 'yAxis', val)}
                        displayValue={(option) => option?.label}
                        options={numericColumns}
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
            <div className="flex-1">
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
                    <div className="fixed inset-0 bg-black bg-opacity-25" />
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
                            <Dialog.Panel className="w-full max-w-7xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all max-h-[90vh] overflow-y-auto">
                                {/* Header */}
                                <div className="flex justify-between items-center mb-6">
                                    <Dialog.Title as="h3" className="text-2xl font-bold text-gray-900">
                                        Analytics Dashboard
                                    </Dialog.Title>
                                    <button
                                        onClick={onClose}
                                        className="text-gray-400 hover:text-gray-600 transition-colors"
                                    >
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>

                                {/* 4 Charts Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {charts.map(chart => renderChartCard(chart))}
                                </div>
                            </Dialog.Panel>
                        </Transition.Child>
                    </div>
                </div>
            </Dialog>
        </Transition>
    );
};

export default AnalyticsDialog;

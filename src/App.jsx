import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './ProtectedRoute';
import LeadsGrid from './components/LeadsGrid';
import UnauthorizedPage from './pages/UnauthorizedPage';
import AnalyticsDashboardPage from './pages/AnalyticsDashboardPage';

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    {/* Protected routes */}
                    <Route
                        path="/leads"
                        element={
                            <ProtectedRoute>
                                <div className="min-h-screen bg-gray-100">
                                    <LeadsGrid />
                                </div>
                            </ProtectedRoute>
                        }
                    />

                    {/* Analytics Dashboard route */}
                    <Route
                        path="/analytics"
                        element={
                            <ProtectedRoute>
                                <AnalyticsDashboardPage />
                            </ProtectedRoute>
                        }
                    />

                    {/* Unauthorized route (public) */}
                    <Route
                        path="/unauthorized"
                        element={<UnauthorizedPage />}
                    />

                    {/* Default redirect */}
                    <Route
                        path="/"
                        element={<Navigate to="/leads" replace />}
                    />

                    {/* Catch-all redirect */}
                    <Route
                        path="*"
                        element={<Navigate to="/leads" replace />}
                    />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;

import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AccountProvider, useAccount } from './context/AccountContext';
import ProtectedRoute from './ProtectedRoute';

const LeadsGrid = lazy(() => import('./components/LeadsGrid'));
const UnauthorizedPage = lazy(() => import('./pages/UnauthorizedPage'));
const AnalyticsDashboardPage = lazy(() => import('./pages/AnalyticsDashboardPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const LinkAccountDialog = lazy(() => import('./components/LinkAccountDialog'));

function RouteLoadingFallback() {
    return (
        <div
            className="min-h-[100dvh] flex items-center justify-center"
            style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text-subtle)' }}
        >
            <p className="ds-body-sm" role="status">Loading...</p>
        </div>
    );
}

// Thin wrapper that reads AccountContext and renders the global link-account dialog
function AccountDialogWrapper() {
    const { isLinkDialogOpen, setIsLinkDialogOpen, handleAccountLinked } = useAccount();

    if (!isLinkDialogOpen) return null;

    return (
        <Suspense fallback={null}>
            <LinkAccountDialog
                isOpen={isLinkDialogOpen}
                onClose={() => setIsLinkDialogOpen(false)}
                onSave={handleAccountLinked}
            />
        </Suspense>
    );
}

// AppRoutes is a separate component so AccountProvider can use router hooks (useNavigate, useLocation)
function AppRoutes() {
    return (
        <AccountProvider>
            {/* Global Link Account dialog — renders over any page */}
            <AccountDialogWrapper />
            <Suspense fallback={<RouteLoadingFallback />}>
                <Routes>
                    {/* Protected routes */}
                    <Route
                        path="/leads"
                        element={
                            <ProtectedRoute>
                                <div className="h-[100dvh] overflow-hidden bg-gray-100">
                                    <LeadsGrid />
                                </div>
                            </ProtectedRoute>
                        }
                    />

                    {/* Profile route */}
                    <Route
                        path="/profile"
                        element={
                            <ProtectedRoute>
                                <ProfilePage />
                            </ProtectedRoute>
                        }
                    />

                    {/* Settings route — superadmin only */}
                    <Route
                        path="/settings"
                        element={
                            <ProtectedRoute requireSuperadmin>
                                <SettingsPage />
                            </ProtectedRoute>
                        }
                    />

                    {/* Admin route — any admin level (admin or superadmin) */}
                    <Route
                        path="/admin"
                        element={
                            <ProtectedRoute requireAdmin>
                                <AdminPage />
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
            </Suspense>
        </AccountProvider>
    );
}

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <AppRoutes />
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;

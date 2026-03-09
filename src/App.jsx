import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { AccountProvider, useAccount } from './context/AccountContext';
import ProtectedRoute from './ProtectedRoute';
import LeadsGrid from './components/LeadsGrid';
import UnauthorizedPage from './pages/UnauthorizedPage';
import AnalyticsDashboardPage from './pages/AnalyticsDashboardPage';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/ProfilePage';
import AdminPage from './pages/AdminPage';
import LinkAccountDialog from './components/LinkAccountDialog';

// Thin wrapper that reads AccountContext and renders the global link-account dialog
function AccountDialogWrapper() {
    const { isLinkDialogOpen, setIsLinkDialogOpen, handleAccountLinked } = useAccount();
    return (
        <LinkAccountDialog
            isOpen={isLinkDialogOpen}
            onClose={() => setIsLinkDialogOpen(false)}
            onSave={handleAccountLinked}
        />
    );
}

// AppRoutes is a separate component so AccountProvider can use router hooks (useNavigate, useLocation)
function AppRoutes() {
    return (
        <AccountProvider>
            {/* Global Link Account dialog — renders over any page */}
            <AccountDialogWrapper />
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

                {/* Profile route */}
                <Route
                    path="/profile"
                    element={
                        <ProtectedRoute>
                            <ProfilePage />
                        </ProtectedRoute>
                    }
                />

                {/* Settings route */}
                <Route
                    path="/settings"
                    element={
                        <ProtectedRoute>
                            <SettingsPage />
                        </ProtectedRoute>
                    }
                />

                {/* Admin route */}
                <Route
                    path="/admin"
                    element={
                        <ProtectedRoute>
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

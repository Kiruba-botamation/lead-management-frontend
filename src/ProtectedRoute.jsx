import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from './context/AuthContext';

const ProtectedRoute = ({ children, roles }) => {
    const { user, authenticated, loading, redirectToLogin } = useAuth();

    // Redirect to SSO login only after auth check is complete and user is not authenticated
    useEffect(() => {
        if (!loading && !authenticated) {
            console.log('[SSO] Auth check complete, user not authenticated — redirecting to login');
            redirectToLogin();
        }
    }, [loading, authenticated]); // eslint-disable-line react-hooks/exhaustive-deps

    // Show loading state while checking authentication
    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-300 border-t-blue-500 mb-4"></div>
                <p className="text-gray-600 text-lg">Checking authentication...</p>
            </div>
        );
    }

    // Show redirecting message while browser navigates to SSO login
    if (!authenticated) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-300 border-t-blue-500 mb-4"></div>
                <p className="text-gray-600 text-lg">Redirecting to login...</p>
            </div>
        );
    }

    // Role-based access control (optional)
    if (roles && roles.length > 0) {
        const userRole = user?.role?.toString();

        if (!userRole || !roles.includes(userRole)) {
            console.warn('[SSO] Access denied: User does not have required role');
            return (
                <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 text-center">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
                    <p className="text-gray-600">You do not have permission to access this page.</p>
                </div>
            );
        }
    }

    return <>{children}</>;
};

ProtectedRoute.propTypes = {
    children: PropTypes.node.isRequired,
    roles: PropTypes.arrayOf(PropTypes.string),
};

export default ProtectedRoute;

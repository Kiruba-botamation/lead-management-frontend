import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import { useAuth } from './context/AuthContext';

const ProtectedRoute = ({ children, roles }) => {
    const { user, authenticated, loading, authChecked, redirectToLogin } = useAuth();

    // Redirect to login only after auth check is complete and user is not authenticated
    useEffect(() => {
        if (authChecked && !loading && !authenticated) {
            console.log('Auth check complete, user not authenticated - redirecting');
            redirectToLogin();
        }
    }, [authChecked, loading, authenticated]); // Don't include redirectToLogin to avoid re-triggers

    // Show loading state while checking authentication
    if (loading || !authChecked) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-300 border-t-blue-500 mb-4"></div>
                <p className="text-gray-600 text-lg">Checking authentication...</p>
            </div>
        );
    }

    // Show redirecting message when not authenticated
    if (!authenticated) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-300 border-t-blue-500 mb-4"></div>
                <p className="text-gray-600 text-lg">Redirecting to login...</p>
            </div>
        );
    }

    // Check role-based access if roles are specified
    if (roles && roles.length > 0) {
        const userRole = user?.role?.toString();

        if (!userRole || !roles.includes(userRole)) {
            console.warn('Access denied: User does not have required role');
            return (
                <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 text-center">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
                    <p className="text-gray-600">You do not have permission to access this page.</p>
                </div>
            );
        }
    }

    // Render protected content
    return <>{children}</>;
};

ProtectedRoute.propTypes = {
    children: PropTypes.node.isRequired,
    roles: PropTypes.arrayOf(PropTypes.string),
};

export default ProtectedRoute;

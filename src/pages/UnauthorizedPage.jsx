import React from 'react';
import { useAuth } from '../context/AuthContext';

const UnauthorizedPage = () => {
    const { redirectToLogin } = useAuth();

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100">
            <div className="bg-white p-8 rounded-lg shadow-md text-center max-w-md">
                <div className="mb-6">
                    <svg className="w-16 h-16 text-red-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-4">Unauthorized Access</h1>
                <p className="text-gray-600 mb-6">
                    You don't have permission to access this page. Please log in with an authorized account.
                </p>
                <button
                    onClick={redirectToLogin}
                    className="px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors"
                >
                    Go to Login
                </button>
            </div>
        </div>
    );
};

export default UnauthorizedPage;

import React from 'react';
import { useAuth } from '../context/AuthContext';

const UnauthorizedPage = () => {
    const { redirectToLogin } = useAuth();

    return (
        <div
            className="min-h-screen flex flex-col items-center justify-center p-6 animate-fade-in bg-gray-100"
        >
            <div className="bg-white max-w-md w-full p-10 text-center animate-scale-in rounded-2xl shadow-2xl border-2 border-gray-200">
                {/* Icon */}
                <div className="mb-8 relative">
                    <div className="relative w-24 h-24 mx-auto bg-gradient-to-br from-gray-800 to-black rounded-full flex items-center justify-center shadow-2xl border-4 border-gray-300">
                        <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                </div>

                {/* Content */}
                <h1 className="text-3xl font-bold text-gray-900 mb-4">
                    Unauthorized Access
                </h1>
                <p className="text-gray-600 mb-8 leading-relaxed">
                    You don't have permission to access this page. Please log in with an authorized account to continue.
                </p>

                {/* Button */}
                <button
                    onClick={redirectToLogin}
                    className="btn-primary w-full group relative overflow-hidden"
                >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                        </svg>
                        Go to Login
                    </span>
                </button>

                {/* Additional Info */}
                <div className="mt-8 pt-6 border-t border-gray-200">
                    <p className="text-gray-500 text-sm">
                        Need help? Contact your administrator
                    </p>
                </div>
            </div>

            {/* Decorative Elements */}
            <div className="absolute top-10 left-10 w-20 h-20 bg-gray-300 rounded-full blur-xl opacity-50 animate-pulse"></div>
            <div className="absolute bottom-10 right-10 w-32 h-32 bg-gray-400 rounded-full blur-xl opacity-50 animate-pulse" style={{ animationDelay: '1s' }}></div>
            <div className="absolute top-1/2 right-20 w-16 h-16 bg-gray-200 rounded-full blur-xl opacity-50 animate-pulse" style={{ animationDelay: '2s' }}></div>
        </div>
    );
};

export default UnauthorizedPage;

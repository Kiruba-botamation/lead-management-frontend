import React from 'react';

const LoadingMask = ({ loading, title = 'Loading...', message = 'Please wait while we process your request' }) => {
  if (!loading) return null;

  return (
    <div className="absolute inset-0 bg-gradient-to-br from-white/90 to-gray-50/90 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="flex flex-col items-center space-y-4 p-8 bg-white rounded-2xl shadow-2xl border border-gray-200">
        <div className="relative">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-gray-300"></div>
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-black border-t-transparent absolute top-0"></div>
        </div>
        <div className="text-center">
          <span className="text-lg font-semibold text-gray-900">{title}</span>
          <p className="text-sm text-gray-600 mt-1">{message}</p>
        </div>
      </div>
    </div>
  );
};

export default LoadingMask;

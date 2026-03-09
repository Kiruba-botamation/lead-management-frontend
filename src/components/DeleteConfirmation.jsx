import React from 'react';

const DeleteConfirmation = ({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Delete' }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black opacity-50"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md bg-white rounded-lg shadow-xl">
        <div className="p-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              {/* Exclamation triangle icon */}
              <svg className="h-6 w-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">{title}</h3>
              <p className="mt-2 text-sm text-gray-500">{message}</p>
            </div>
          </div>

          <div className="mt-6 flex justify-end space-x-4">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="inline-flex justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmation;

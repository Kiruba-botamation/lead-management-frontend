import React, { useState, useRef, useEffect } from 'react';

const AccountCombobox = ({
    accounts,
    acctNo,
    acctName,
    isAccountLinked,
    accountsLoaded,
    switchAccount,
    setIsLinkDialogOpen,
    onOpen,
}) => {
    const displayName = acctName || acctNo || '';
    const [open, setOpen] = useState(false);
    const [inputValue, setInputValue] = useState(displayName);
    const ref = useRef(null);
    const inputRef = useRef(null);

    // Keep input in sync with selected account when closed
    useEffect(() => {
        if (!open) setInputValue(displayName);
    }, [displayName, open]);

    useEffect(() => {
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const filtered = accounts.filter((acc) => {
        const q = inputValue.toLowerCase();
        return (acc.accountName || '').toLowerCase().includes(q) || acc.acctNo.toLowerCase().includes(q);
    });

    const handleFocus = () => {
        setInputValue('');
        setOpen(true);
        if (onOpen) onOpen();
    };

    const handleChange = (e) => {
        setInputValue(e.target.value);
        setOpen(true);
    };

    const handleSelect = (acc) => {
        switchAccount(acc);
        setOpen(false);
    };

    if (!accountsLoaded) return null;

    return (
        <div className="relative" ref={ref}>
            {isAccountLinked && acctNo ? (
                <>
                    <div className="flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 hover:border-gray-500 transition-all duration-200 focus-within:border-gray-400">
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputValue}
                            onFocus={handleFocus}
                            onChange={handleChange}
                            className="w-32 md:w-44 text-xs font-medium text-white bg-transparent outline-none placeholder-gray-500 truncate"
                            placeholder="Search account..."
                            autoComplete="off"
                        />
                        <svg
                            className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>

                    {open && (
                        <div className="absolute right-0 mt-1 w-full min-w-full bg-white rounded-lg shadow-2xl border border-gray-200 z-50">
                            <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Linked Accounts</p>

                            <div className="max-h-48 overflow-y-auto">
                                {filtered.length === 0 ? (
                                    <p className="px-3 py-2 text-[11px] text-gray-400 text-center">No results</p>
                                ) : (
                                    filtered.map((acc) => (
                                        <button
                                            key={acc.acctNo}
                                            onMouseDown={(e) => { e.preventDefault(); handleSelect(acc); }}
                                            className={`w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-2 ${acc.acctNo === acctNo ? 'bg-gray-50 font-bold text-gray-900' : 'text-gray-700 hover:bg-gray-50'}`}
                                        >
                                            <div className="flex flex-col min-w-0 flex-1">
                                                <span className="truncate">{acc.accountName || acc.acctNo}</span>
                                                {acc.accountName && <span className="text-[10px] text-gray-400 truncate">{acc.acctNo}</span>}
                                            </div>
                                            {acc.acctNo === acctNo && (
                                                <svg className="w-3 h-3 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </button>
                                    ))
                                )}
                            </div>

                            <div className="border-t border-gray-100 mt-1 pt-1 pb-1">
                                <button
                                    onMouseDown={(e) => { e.preventDefault(); setIsLinkDialogOpen(true); setOpen(false); }}
                                    className="w-full px-3 py-2 text-left text-xs text-gray-500 hover:bg-gray-50 transition-colors flex items-center gap-2"
                                >
                                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Link another account
                                </button>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <button
                    onClick={() => setIsLinkDialogOpen(true)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 transition-all duration-300 border border-yellow-400 text-black"
                >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    <span className="text-xs font-medium hidden md:block">Link Account</span>
                </button>
            )}
        </div>
    );
};

export default AccountCombobox;

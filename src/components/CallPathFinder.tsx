import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SymbolNode, CallPathStep } from '../types';

// ── SymbolCombobox ────────────────────────────────────────────────────────────

interface ComboboxProps {
  label: string;
  placeholder: string;
  symbols: Record<string, SymbolNode[]>;
  value: string;
  onChange: (name: string) => void;
}

function SymbolCombobox({ label, placeholder, symbols, value, onChange }: ComboboxProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // All function names across files
  const allNames = React.useMemo(() => {
    const names: string[] = [];
    for (const syms of Object.values(symbols)) {
      for (const s of syms) {
        if (s.type === 'function') names.push(s.name);
      }
    }
    return Array.from(new Set(names)).sort();
  }, [symbols]);

  const filtered = React.useMemo(() => {
    if (!query) return allNames.slice(0, 8);
    const q = query.toLowerCase();
    return allNames.filter(n => n.toLowerCase().includes(q)).slice(0, 8);
  }, [allNames, query]);

  const select = (name: string) => {
    setQuery(name);
    setOpen(false);
    onChange(name);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setOpen(true);
    setHighlighted(0);
    onChange(''); // invalidate until a real item is selected
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (filtered[highlighted]) select(filtered[highlighted]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const handleBlur = () => {
    closeTimerRef.current = setTimeout(() => setOpen(false), 150);
  };

  const handleDropdownMouseDown = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  };

  // Sync displayed text when parent clears the value
  useEffect(() => {
    if (value === '') setQuery('');
  }, [value]);

  return (
    <div className="relative">
      <label className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1 block">
        {label}
      </label>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
        autoComplete="off"
        spellCheck={false}
      />
      {open && filtered.length > 0 && (
        <ul
          onMouseDown={handleDropdownMouseDown}
          className="absolute z-50 top-full mt-1 w-full bg-gray-800 border border-gray-700 rounded shadow-xl max-h-52 overflow-y-auto"
        >
          {filtered.map((name, i) => (
            <li
              key={name}
              onMouseDown={() => select(name)}
              className={`px-3 py-1.5 text-sm cursor-pointer truncate transition-colors ${
                i === highlighted
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700'
              }`}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── CallPathFinder ────────────────────────────────────────────────────────────

type Result = CallPathStep[] | 'searching' | 'not-found' | null;

interface Props {
  symbols: Record<string, SymbolNode[]>;
  onSelectSymbol: (symbol: SymbolNode, file: string) => void;
  onClose: () => void;
}

export default function CallPathFinder({ symbols, onSelectSymbol, onClose }: Props) {
  const [fromName, setFromName] = useState('');
  const [toName, setToName] = useState('');
  const [result, setResult] = useState<Result>(null);
  const [error, setError] = useState('');

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleFind = useCallback(async () => {
    if (!fromName || !toName) return;
    setResult('searching');
    setError('');
    try {
      const path = await window.api.findCallPath(fromName, toName);
      setResult(path === null ? 'not-found' : path);
    } catch (e) {
      setError(String(e));
      setResult(null);
    }
  }, [fromName, toName]);

  const handleStepClick = useCallback(async (name: string) => {
    const res = await window.api.findSymbolByName(name);
    if (res) {
      onSelectSymbol(res.symbol, res.file);
      onClose();
    }
  }, [onSelectSymbol, onClose]);

  const canFind = !!fromName && !!toName && result !== 'searching';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col overflow-hidden"
        style={{ maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">Call Path Finder</h2>
            <p className="text-xs text-gray-500 mt-0.5">Find shortest call chain between two functions</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors p-1 rounded"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Inputs */}
        <div className="px-5 py-4 flex flex-col gap-3 flex-shrink-0 border-b border-gray-800">
          <SymbolCombobox
            label="From"
            placeholder="e.g. main"
            symbols={symbols}
            value={fromName}
            onChange={setFromName}
          />
          <div className="flex justify-center text-gray-600 text-sm select-none">↓</div>
          <SymbolCombobox
            label="To"
            placeholder="e.g. HAL_UART_Transmit"
            symbols={symbols}
            value={toName}
            onChange={setToName}
          />
          <button
            onClick={handleFind}
            disabled={!canFind}
            className={`mt-1 w-full py-2 rounded text-sm font-medium transition-colors ${
              canFind
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-gray-800 text-gray-600 cursor-not-allowed'
            }`}
          >
            {result === 'searching' ? 'Searching…' : 'Find Path'}
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {/* Result */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          {result === null && (
            <p className="text-xs text-gray-600 text-center mt-4">
              Select two functions and click Find Path
            </p>
          )}

          {result === 'searching' && (
            <p className="text-xs text-gray-500 text-center mt-4">Searching…</p>
          )}

          {result === 'not-found' && (
            <div className="text-center mt-4">
              <p className="text-sm text-gray-400">No call path found</p>
              <p className="text-xs text-gray-600 mt-1">
                <span className="text-gray-400">{fromName}</span>
                {' '}does not reach{' '}
                <span className="text-gray-400">{toName}</span>
              </p>
            </div>
          )}

          {Array.isArray(result) && result.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-3">
                Path found — {result.length === 1 ? '1 function' : `${result.length - 1} hop${result.length > 2 ? 's' : ''}`}
              </p>
              <div className="flex flex-col gap-0">
                {result.map((step, idx) => {
                  const isFirst = idx === 0;
                  const isLast = idx === result.length - 1;
                  const accent = isFirst
                    ? 'text-green-400 border-green-700/50 bg-green-950/30'
                    : isLast
                    ? 'text-blue-400 border-blue-700/50 bg-blue-950/30'
                    : 'text-gray-300 border-gray-700/50 bg-gray-800/40';
                  const icon = isFirst ? '▶' : isLast ? '◎' : '○';

                  return (
                    <React.Fragment key={idx}>
                      {/* Call-site connector (shown BEFORE each step except the first) */}
                      {step.callSite && (
                        <div className="flex gap-2 ml-4 my-0.5">
                          <div className="w-px bg-gray-700 mx-2 flex-shrink-0" />
                          <div className="flex flex-col min-w-0">
                            <span className="font-mono text-[11px] text-gray-500 truncate">
                              {step.callSite.snippet}
                            </span>
                            <span className="text-[10px] text-gray-600">
                              {step.callSite.file.split(/[/\\]/).pop()}:{step.callSite.line + 1}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Step card */}
                      <button
                        onClick={() => handleStepClick(step.name)}
                        className={`flex items-center gap-2 px-3 py-2 rounded border text-left transition-colors hover:brightness-125 ${accent}`}
                      >
                        <span className="text-xs w-4 flex-shrink-0">{icon}</span>
                        <span className="text-sm font-medium flex-1 truncate">{step.name}</span>
                        {step.file && (
                          <span className="text-[11px] text-gray-500 flex-shrink-0 font-mono">
                            {step.file.split(/[/\\]/).pop()}:{step.line + 1}
                          </span>
                        )}
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

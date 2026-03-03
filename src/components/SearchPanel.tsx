import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SymbolNode } from '../types';
import { FunctionSquare, Box, List, Variable } from 'lucide-react';

interface SearchPanelProps {
    symbols: Record<string, SymbolNode[]>;
    onSelectSymbol: (symbol: SymbolNode, file: string) => void;
    onClose: () => void;
}

interface FlatSymbol {
    symbol: SymbolNode;
    file: string;
    fileName: string;
}

const TYPE_ICONS: Record<SymbolNode['type'], React.ReactNode> = {
    function: <FunctionSquare className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />,
    struct:   <Box           className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />,
    enum:     <List          className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />,
    variable: <Variable      className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />,
};

function highlight(text: string, query: string): React.ReactNode {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
        <>
            {text.slice(0, idx)}
            <span className="text-yellow-300 font-bold">{text.slice(idx, idx + query.length)}</span>
            {text.slice(idx + query.length)}
        </>
    );
}

const SearchPanel: React.FC<SearchPanelProps> = ({ symbols, onSelectSymbol, onClose }) => {
    const [query, setQuery] = useState('');
    const [selectedIdx, setSelectedIdx] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const allSymbols = useMemo<FlatSymbol[]>(() => {
        const flat: FlatSymbol[] = [];
        for (const [file, syms] of Object.entries(symbols)) {
            const fileName = file.split(/[/\\]/).pop() || file;
            for (const symbol of syms) {
                flat.push({ symbol, file, fileName });
            }
        }
        return flat;
    }, [symbols]);

    const filtered = query.trim()
        ? allSymbols.filter(({ symbol, fileName }) =>
            symbol.name.toLowerCase().includes(query.toLowerCase()) ||
            fileName.toLowerCase().includes(query.toLowerCase())
          )
        : allSymbols.slice(0, 60);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    // Scroll selected item into view
    useEffect(() => {
        const el = listRef.current?.children[selectedIdx] as HTMLElement | undefined;
        el?.scrollIntoView({ block: 'nearest' });
    }, [selectedIdx]);

    const select = (item: FlatSymbol) => {
        onSelectSymbol(item.symbol, item.file);
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') { onClose(); return; }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIdx(i => Math.min(i + 1, filtered.length - 1));
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIdx(i => Math.max(i - 1, 0));
        }
        if (e.key === 'Enter' && filtered[selectedIdx]) {
            select(filtered[selectedIdx]);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-20"
            onClick={onClose}
        >
            <div
                className="bg-gray-900 border border-gray-700 rounded-xl w-[580px] shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Search input */}
                <div className="flex items-center px-4 border-b border-gray-700">
                    <svg className="w-4 h-4 text-gray-500 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        ref={inputRef}
                        className="flex-1 bg-transparent py-3.5 text-white text-sm outline-none font-mono placeholder-gray-600"
                        placeholder="Search symbols..."
                        value={query}
                        onChange={e => { setQuery(e.target.value); setSelectedIdx(0); }}
                        onKeyDown={handleKeyDown}
                    />
                    <kbd className="text-[10px] text-gray-600 border border-gray-700 rounded px-1.5 py-0.5">esc</kbd>
                </div>

                {/* Results */}
                <div ref={listRef} className="max-h-72 overflow-y-auto">
                    {filtered.length === 0 ? (
                        <div className="px-4 py-10 text-center text-gray-600 text-sm">
                            No symbols match "{query}"
                        </div>
                    ) : (
                        filtered.map((item, idx) => (
                            <div
                                key={`${item.file}-${item.symbol.name}-${idx}`}
                                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                                    idx === selectedIdx ? 'bg-blue-600/25 border-l-2 border-blue-500' : 'border-l-2 border-transparent hover:bg-gray-800'
                                }`}
                                onClick={() => select(item)}
                                onMouseEnter={() => setSelectedIdx(idx)}
                            >
                                {TYPE_ICONS[item.symbol.type]}
                                <span className="text-white text-sm font-mono flex-1 truncate">
                                    {highlight(item.symbol.name, query)}
                                </span>
                                <span className="text-xs text-gray-500 flex-shrink-0 max-w-[200px] truncate" title={item.file}>
                                    {item.file.split(/[/\\]/).slice(-2).join('/')}
                                </span>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-2 border-t border-gray-800 flex gap-4 text-[10px] text-gray-600 select-none">
                    <span><kbd className="border border-gray-700 rounded px-1">↑↓</kbd> navigate</span>
                    <span><kbd className="border border-gray-700 rounded px-1">↵</kbd> jump to symbol</span>
                    <span><kbd className="border border-gray-700 rounded px-1">esc</kbd> close</span>
                    <span className="ml-auto">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
                </div>
            </div>
        </div>
    );
};

export default SearchPanel;

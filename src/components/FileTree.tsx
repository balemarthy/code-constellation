import React, { useState } from 'react';
import { SymbolNode } from '../types';
import { ChevronRight, ChevronDown, FileCode, FunctionSquare, Box, List, Variable } from 'lucide-react';

interface FileTreeProps {
    files: Record<string, SymbolNode[]>;
    onSelectFile: (file: string) => void;
    onSelectSymbol: (symbol: SymbolNode, file: string) => void;
    activeFile: string | null;
}

const FileTree: React.FC<FileTreeProps> = ({ files, onSelectFile, onSelectSymbol, activeFile }) => {
    const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

    const toggleExpand = (file: string) => {
        const next = new Set(expandedFiles);
        if (next.has(file)) next.delete(file);
        else next.add(file);
        setExpandedFiles(next);
    };

    const getIcon = (type: SymbolNode['type']) => {
        switch (type) {
            case 'function': return <FunctionSquare className="w-3 h-3 text-blue-400" />;
            case 'struct': return <Box className="w-3 h-3 text-purple-400" />;
            case 'enum': return <List className="w-3 h-3 text-yellow-400" />;
            case 'variable': return <Variable className="w-3 h-3 text-green-400" />;
        }
    };

    return (
        <div className="text-sm select-none">
            {Object.entries(files).map(([filePath, symbols]) => {
                const fileName = filePath.split(/[/\\]/).pop();
                const isExpanded = expandedFiles.has(filePath);
                const isActive = activeFile === filePath;

                return (
                    <div key={filePath} className="mb-1">
                        <div
                            className={`flex items-center p-1 cursor-pointer rounded hover:bg-gray-800 group ${isActive ? 'bg-gray-800' : ''}`}
                            onClick={() => {
                                toggleExpand(filePath);
                                onSelectFile(filePath);
                            }}
                        >
                            {isExpanded ? <ChevronDown className="w-4 h-4 mr-1 text-gray-500" /> : <ChevronRight className="w-4 h-4 mr-1 text-gray-500" />}
                            <FileCode className="w-4 h-4 mr-2 text-blue-500" />
                            <span className="truncate flex-1" title={filePath}>{fileName}</span>
                        </div>

                        {isExpanded && (
                            <div className="ml-6 mt-1 border-l border-gray-800 pl-2 space-y-1">
                                {symbols.map((sym, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-center p-1 cursor-pointer rounded hover:bg-gray-800 text-xs text-gray-400 group"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSelectSymbol(sym, filePath);
                                        }}
                                    >
                                        <span className="mr-2 opacity-70 group-hover:opacity-100">{getIcon(sym.type)}</span>
                                        <span className="truncate group-hover:text-white" title={sym.name}>{sym.name}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default FileTree;

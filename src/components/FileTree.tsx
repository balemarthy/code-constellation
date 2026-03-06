import React, { useState, useMemo } from 'react';
import { SymbolNode } from '../types';
import { ChevronRight, ChevronDown, FileCode, FunctionSquare, Box, List, Variable, Folder, FolderOpen } from 'lucide-react';

interface FileTreeProps {
    files: Record<string, SymbolNode[]>;
    rootDir: string | null;
    onSelectFile: (file: string) => void;
    onSelectSymbol: (symbol: SymbolNode, file: string) => void;
    activeFile: string | null;
}

// ── Tree node types ──────────────────────────────────────────────────────────

interface DirNode {
    kind: 'dir';
    name: string;
    fullPath: string;
    children: TreeNode[];
}

interface FileNode {
    kind: 'file';
    name: string;
    fullPath: string;
    symbols: SymbolNode[];
}

type TreeNode = DirNode | FileNode;

// ── Build tree from flat file map ────────────────────────────────────────────

function buildTree(files: Record<string, SymbolNode[]>, rootDir: string | null): DirNode {
    const root: DirNode = { kind: 'dir', name: '', fullPath: rootDir ?? '', children: [] };

    for (const [filePath, symbols] of Object.entries(files)) {
        // Compute relative path segments
        let rel = filePath;
        if (rootDir) {
            // Strip rootDir prefix (handle both / and \ separators)
            const stripped = filePath.startsWith(rootDir)
                ? filePath.slice(rootDir.length).replace(/^[/\\]/, '')
                : filePath;
            rel = stripped;
        }
        const parts = rel.split(/[/\\]/);

        let currentDir = root;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!part) continue;
            let child = currentDir.children.find(
                c => c.kind === 'dir' && c.name === part
            ) as DirNode | undefined;
            if (!child) {
                child = {
                    kind: 'dir',
                    name: part,
                    fullPath: rootDir
                        ? [rootDir, ...parts.slice(0, i + 1)].join('/').replace(/\\/g, '/')
                        : parts.slice(0, i + 1).join('/'),
                    children: [],
                };
                currentDir.children.push(child);
            }
            currentDir = child;
        }

        const fileName = parts[parts.length - 1];
        currentDir.children.push({ kind: 'file', name: fileName, fullPath: filePath, symbols });
    }

    // Sort: directories first, then files — alphabetically within each group
    sortChildren(root);
    return root;
}

function sortChildren(node: DirNode) {
    node.children.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });
    for (const child of node.children) {
        if (child.kind === 'dir') sortChildren(child);
    }
}

// ── Symbol icon ──────────────────────────────────────────────────────────────

const SymbolIcon: React.FC<{ type: SymbolNode['type'] }> = ({ type }) => {
    switch (type) {
        case 'function': return <FunctionSquare className="w-3 h-3 text-blue-400" />;
        case 'struct':   return <Box className="w-3 h-3 text-purple-400" />;
        case 'enum':     return <List className="w-3 h-3 text-yellow-400" />;
        case 'variable': return <Variable className="w-3 h-3 text-green-400" />;
    }
};

// ── FileRow ──────────────────────────────────────────────────────────────────

interface FileRowProps {
    node: FileNode;
    depth: number;
    expanded: boolean;
    isActive: boolean;
    onToggle: () => void;
    onSelectFile: (f: string) => void;
    onSelectSymbol: (sym: SymbolNode, f: string) => void;
}

const FileRow: React.FC<FileRowProps> = ({
    node, depth, expanded, isActive, onToggle, onSelectFile, onSelectSymbol,
}) => (
    <>
        <div
            className={`flex items-center p-1 cursor-pointer rounded hover:bg-gray-800 group ${isActive ? 'bg-gray-800' : ''}`}
            style={{ paddingLeft: `${depth * 12 + 4}px` }}
            onClick={() => { onToggle(); onSelectFile(node.fullPath); }}
        >
            {expanded
                ? <ChevronDown className="w-3.5 h-3.5 mr-1 text-gray-500 flex-shrink-0" />
                : <ChevronRight className="w-3.5 h-3.5 mr-1 text-gray-500 flex-shrink-0" />
            }
            <FileCode className="w-3.5 h-3.5 mr-1.5 text-blue-400 flex-shrink-0" />
            <span className="truncate flex-1 text-xs" title={node.fullPath}>{node.name}</span>
            {node.symbols.length > 0 && (
                <span className="text-[10px] text-gray-600 ml-1 flex-shrink-0">{node.symbols.length}</span>
            )}
        </div>

        {expanded && node.symbols.map(sym => (
            <div
                key={`${sym.name}:${sym.location.start.row}`}
                className="flex items-center p-1 cursor-pointer rounded hover:bg-gray-800 text-gray-400 group"
                style={{ paddingLeft: `${depth * 12 + 22}px` }}
                onClick={e => { e.stopPropagation(); onSelectSymbol(sym, node.fullPath); }}
            >
                <span className="mr-1.5 opacity-70 group-hover:opacity-100 flex-shrink-0">
                    <SymbolIcon type={sym.type} />
                </span>
                <span className="truncate text-xs group-hover:text-white" title={sym.name}>{sym.name}</span>
            </div>
        ))}
    </>
);

// ── DirRow ───────────────────────────────────────────────────────────────────

interface DirRowProps {
    node: DirNode;
    depth: number;
    expandedDirs: Set<string>;
    expandedFiles: Set<string>;
    activeFile: string | null;
    onToggleDir: (path: string) => void;
    onToggleFile: (path: string) => void;
    onSelectFile: (f: string) => void;
    onSelectSymbol: (sym: SymbolNode, f: string) => void;
}

const DirRow: React.FC<DirRowProps> = ({
    node, depth, expandedDirs, expandedFiles, activeFile,
    onToggleDir, onToggleFile, onSelectFile, onSelectSymbol,
}) => {
    const isExpanded = expandedDirs.has(node.fullPath);
    return (
        <>
            <div
                className="flex items-center p-1 cursor-pointer rounded hover:bg-gray-800 group"
                style={{ paddingLeft: `${depth * 12 + 4}px` }}
                onClick={() => onToggleDir(node.fullPath)}
            >
                {isExpanded
                    ? <ChevronDown className="w-3.5 h-3.5 mr-1 text-gray-500 flex-shrink-0" />
                    : <ChevronRight className="w-3.5 h-3.5 mr-1 text-gray-500 flex-shrink-0" />
                }
                {isExpanded
                    ? <FolderOpen className="w-3.5 h-3.5 mr-1.5 text-yellow-500 flex-shrink-0" />
                    : <Folder className="w-3.5 h-3.5 mr-1.5 text-yellow-500/80 flex-shrink-0" />
                }
                <span className="truncate flex-1 text-xs text-gray-300 font-medium" title={node.fullPath}>
                    {node.name}
                </span>
            </div>

            {isExpanded && node.children.map(child =>
                child.kind === 'dir'
                    ? (
                        <DirRow
                            key={child.fullPath}
                            node={child}
                            depth={depth + 1}
                            expandedDirs={expandedDirs}
                            expandedFiles={expandedFiles}
                            activeFile={activeFile}
                            onToggleDir={onToggleDir}
                            onToggleFile={onToggleFile}
                            onSelectFile={onSelectFile}
                            onSelectSymbol={onSelectSymbol}
                        />
                    ) : (
                        <FileRow
                            key={child.fullPath}
                            node={child}
                            depth={depth + 1}
                            expanded={expandedFiles.has(child.fullPath)}
                            isActive={activeFile === child.fullPath}
                            onToggle={() => onToggleFile(child.fullPath)}
                            onSelectFile={onSelectFile}
                            onSelectSymbol={onSelectSymbol}
                        />
                    )
            )}
        </>
    );
};

// ── Main component ───────────────────────────────────────────────────────────

const FileTree: React.FC<FileTreeProps> = ({ files, rootDir, onSelectFile, onSelectSymbol, activeFile }) => {
    const [expandedDirs, setExpandedDirs]   = useState<Set<string>>(new Set());
    const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

    const tree = useMemo(() => buildTree(files, rootDir), [files, rootDir]);

    const toggleDir = (path: string) => {
        setExpandedDirs(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path); else next.add(path);
            return next;
        });
    };

    const toggleFile = (path: string) => {
        setExpandedFiles(prev => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path); else next.add(path);
            return next;
        });
    };

    return (
        <div className="text-sm select-none">
            {tree.children.map(child =>
                child.kind === 'dir'
                    ? (
                        <DirRow
                            key={child.fullPath}
                            node={child}
                            depth={0}
                            expandedDirs={expandedDirs}
                            expandedFiles={expandedFiles}
                            activeFile={activeFile}
                            onToggleDir={toggleDir}
                            onToggleFile={toggleFile}
                            onSelectFile={onSelectFile}
                            onSelectSymbol={onSelectSymbol}
                        />
                    ) : (
                        <FileRow
                            key={child.fullPath}
                            node={child}
                            depth={0}
                            expanded={expandedFiles.has(child.fullPath)}
                            isActive={activeFile === child.fullPath}
                            onToggle={() => toggleFile(child.fullPath)}
                            onSelectFile={onSelectFile}
                            onSelectSymbol={onSelectSymbol}
                        />
                    )
            )}
        </div>
    );
};

export default FileTree;

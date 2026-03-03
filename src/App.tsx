import React, { useState, useEffect } from 'react'
import { ReactFlowProvider } from 'reactflow';
import { SymbolNode } from './types';
import './App.css'
import FileTree from './components/FileTree';
import GraphView from './components/GraphView';
import CodeViewer from './components/CodeViewer';
import NotesPanel from './components/NotesPanel';
import SearchPanel from './components/SearchPanel';
import CallPathFinder from './components/CallPathFinder';

type HistoryEntry = { file: string | null; symbol: SymbolNode | null };

function App() {
  const [rootDir, setRootDir]   = useState<string | null>(null);
  const [symbols, setSymbols]   = useState<Record<string, SymbolNode[]> | null>(null);
  const [status, setStatus]     = useState<string>('');
  const [activeFile, setActiveFile]     = useState<string | null>(null);
  const [activeSymbol, setActiveSymbol] = useState<SymbolNode | null>(null);
  const [searchOpen, setSearchOpen]       = useState(false);
  const [pathFinderOpen, setPathFinderOpen] = useState(false);

  // ── Navigation history ─────────────────────────────────────────────────────
  const [history, setHistory]         = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const addToHistory = (file: string | null, symbol: SymbolNode | null) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ file, symbol });
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const navigateToHistoryEntry = (targetIdx: number) => {
    if (targetIdx < 0 || targetIdx >= history.length) return;
    const item = history[targetIdx];
    setHistoryIndex(targetIdx);
    setActiveFile(item.file);
    setActiveSymbol(item.symbol);
  };

  const goBack = () => navigateToHistoryEntry(historyIndex - 1);
  const goForward = () => navigateToHistoryEntry(historyIndex + 1);

  // ── Layout state ───────────────────────────────────────────────────────────
  const [sidebarWidth, setSidebarWidth]     = useState(250);
  const [codePanelWidth, setCodePanelWidth] = useState(400);
  const [notesHeight, setNotesHeight]       = useState(200);
  const [isDraggingSidebar, setIsDraggingSidebar]     = useState(false);
  const [isDraggingCodePanel, setIsDraggingCodePanel] = useState(false);
  const [isDraggingNotes, setIsDraggingNotes]         = useState(false);

  // ── Session persistence ────────────────────────────────────────────────────
  useEffect(() => {
    if (!rootDir) return;
    const loadSession = async () => {
      try {
        const session = await window.api.getSession(rootDir);
        if (session) {
          if (session.activeFile)    setActiveFile(session.activeFile);
          if (session.sidebarWidth)  setSidebarWidth(session.sidebarWidth);
          if (session.codePanelWidth) setCodePanelWidth(session.codePanelWidth);
          if (session.notesHeight)   setNotesHeight(session.notesHeight);
        }
      } catch (e) { console.error('Failed to load session', e); }
    };
    loadSession();
  }, [rootDir]);

  useEffect(() => {
    if (!rootDir) return;
    const timer = setTimeout(async () => {
      try {
        await window.api.saveSession(rootDir, { activeFile, sidebarWidth, codePanelWidth, notesHeight });
      } catch (e) { console.error('Failed to save session', e); }
    }, 2000);
    return () => clearTimeout(timer);
  }, [rootDir, activeFile, sidebarWidth, codePanelWidth, notesHeight]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        if (symbols) setPathFinderOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        if (symbols) setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        if (pathFinderOpen) setPathFinderOpen(false);
        else setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [symbols, pathFinderOpen]);

  // ── Drag-resize ────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingSidebar)   setSidebarWidth(Math.max(150, Math.min(600, e.clientX)));
      if (isDraggingCodePanel) setCodePanelWidth(Math.max(300, Math.min(800, window.innerWidth - e.clientX)));
      if (isDraggingNotes)     setNotesHeight(Math.max(100, Math.min(600, window.innerHeight - e.clientY)));
    };
    const handleMouseUp = () => {
      setIsDraggingSidebar(false);
      setIsDraggingCodePanel(false);
      setIsDraggingNotes(false);
      document.body.style.cursor = 'default';
    };
    if (isDraggingSidebar || isDraggingCodePanel || isDraggingNotes) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = isDraggingNotes ? 'row-resize' : 'col-resize';
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'default';
    };
  }, [isDraggingSidebar, isDraggingCodePanel, isDraggingNotes]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleOpenFolder = async () => {
    try {
      const dir = await window.api.openDirectoryDialog();
      if (!dir) return;
      setRootDir(dir);
      setStatus('Scanning…');
      const result = await window.api.scanDirectory(dir);
      setSymbols(result);
      setStatus(`${Object.keys(result).length} files indexed`);
    } catch (e) {
      console.error(e);
      setStatus('Error opening folder');
    }
  };

  const handleRescan = async () => {
    if (!rootDir) return;
    setStatus('Rescanning…');
    try {
      const result = await window.api.rescanDirectory(rootDir);
      setSymbols(result);
      setStatus(`Rescanned — ${Object.keys(result).length} files`);
    } catch (e) {
      console.error(e);
      setStatus('Rescan failed');
    }
  };

  const handleSelectFile = (file: string) => {
    setActiveFile(file);
    setActiveSymbol(null);
    addToHistory(file, null);
  };

  const handleSelectSymbol = (symbol: SymbolNode, file: string) => {
    setActiveFile(file);
    setActiveSymbol(symbol);
    addToHistory(file, symbol);
  };

  // ── Breadcrumb (last 4 entries up to current) ──────────────────────────────
  const breadcrumbStart = Math.max(0, historyIndex - 3);
  const breadcrumbItems = history.slice(breadcrumbStart, historyIndex + 1);

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-900 text-white overflow-hidden">

      {/* ── Header ── */}
      <div className="h-12 border-b border-gray-800 flex items-center px-4 gap-2 bg-gray-950 select-none flex-shrink-0">

        {/* Logo */}
        <span className="font-bold text-base bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500 mr-1 flex-shrink-0">
          Code Constellation
        </span>

        {/* Back / Forward */}
        <button
          onClick={goBack}
          disabled={historyIndex <= 0}
          className={`p-1 rounded bg-gray-800 hover:bg-gray-700 transition-colors ${historyIndex <= 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
          title="Go Back"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </button>
        <button
          onClick={goForward}
          disabled={historyIndex >= history.length - 1}
          className={`p-1 rounded bg-gray-800 hover:bg-gray-700 transition-colors ${historyIndex >= history.length - 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
          title="Go Forward"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>

        {/* Breadcrumb */}
        {breadcrumbItems.length > 0 && (
          <div className="flex items-center gap-1 overflow-hidden flex-1 min-w-0">
            {breadcrumbItems.map((item, i) => {
              const absIdx = breadcrumbStart + i;
              const label = item.symbol?.name
                ?? (item.file ? item.file.split(/[/\\]/).pop() : null)
                ?? '?';
              const isCurrent = i === breadcrumbItems.length - 1;
              const isFile = !item.symbol && !!item.file;
              return (
                <React.Fragment key={absIdx}>
                  {i > 0 && (
                    <span className="text-gray-600 text-xs flex-shrink-0 select-none">›</span>
                  )}
                  <button
                    onClick={() => navigateToHistoryEntry(absIdx)}
                    title={item.file ?? label}
                    className={`text-xs px-2 py-0.5 rounded-full truncate max-w-[120px] transition-all flex-shrink-0 border ${
                      isCurrent
                        ? 'bg-blue-950 border-blue-700/60 text-blue-300 font-medium'
                        : isFile
                        ? 'bg-gray-800/70 border-gray-700/50 text-gray-400 hover:text-gray-200 hover:bg-gray-700/70'
                        : 'bg-gray-800/70 border-gray-700/50 text-gray-400 hover:text-gray-200 hover:bg-gray-700/70'
                    }`}
                  >
                    {label}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        )}

        {/* Spacer when no breadcrumb */}
        {breadcrumbItems.length === 0 && <div className="flex-1" />}

        {/* Search button */}
        <button
          onClick={() => symbols && setSearchOpen(true)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors flex-shrink-0 ${
            symbols
              ? 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              : 'bg-gray-800 opacity-40 cursor-not-allowed text-gray-600'
          }`}
          title="Search symbols (Ctrl+P)"
          disabled={!symbols}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span>Search</span>
          <kbd className="text-[9px] text-gray-600 border border-gray-700 rounded px-1">Ctrl+P</kbd>
        </button>

        {/* Path finder button */}
        <button
          onClick={() => symbols && setPathFinderOpen(true)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors flex-shrink-0 ${
            symbols
              ? 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              : 'bg-gray-800 opacity-40 cursor-not-allowed text-gray-600'
          }`}
          title="Find call path (Ctrl+Shift+P)"
          disabled={!symbols}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
          <span>Path</span>
          <kbd className="text-[9px] text-gray-600 border border-gray-700 rounded px-1">Ctrl+⇧P</kbd>
        </button>

        {/* Open Folder */}
        <button
          onClick={handleOpenFolder}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-xs transition-colors flex-shrink-0"
        >
          Open Folder
        </button>

        {/* Rescan */}
        {rootDir && (
          <button
            onClick={handleRescan}
            className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-xs text-gray-300 transition-colors flex-shrink-0"
            title="Force re-scan (clears cache)"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        )}

        {/* Status */}
        <span className="text-xs text-gray-500 flex-shrink-0 max-w-[180px] truncate" title={status}>
          {status}
        </span>
      </div>

      {/* ── Main layout ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left sidebar */}
        <div style={{ width: sidebarWidth }} className="border-r border-gray-800 flex flex-col bg-gray-900 flex-shrink-0">
          <div className="p-2 font-semibold text-xs text-gray-500 uppercase tracking-wider">Explorer</div>
          <div className="flex-1 overflow-auto p-2">
            {symbols ? (
              <FileTree
                files={symbols}
                onSelectFile={handleSelectFile}
                onSelectSymbol={handleSelectSymbol}
                activeFile={activeFile}
              />
            ) : (
              <div className="text-gray-600 text-xs text-center mt-10 px-4">
                Open a folder to start exploring
              </div>
            )}
          </div>
        </div>

        {/* Sidebar resizer */}
        <div className="w-1 bg-gray-800 hover:bg-blue-500 cursor-col-resize z-10 flex-shrink-0"
          onMouseDown={() => setIsDraggingSidebar(true)} />

        {/* Center graph */}
        <div className="flex-1 bg-gray-950 relative overflow-hidden flex flex-col min-w-0">
          <ReactFlowProvider>
            <GraphView
              centerSymbol={activeSymbol}
              onNodeSelect={async (name, metadata) => {
                const res = await window.api.findSymbolByName(name);
                if (res) {
                  handleSelectSymbol(res.symbol, res.file);
                } else if (metadata?.file && metadata?.start) {
                  handleSelectSymbol({
                    name,
                    type: 'function',
                    location: { file: metadata.file, start: metadata.start, end: metadata.start },
                  }, metadata.file);
                }
              }}
            />
          </ReactFlowProvider>
        </div>

        {/* Code panel resizer */}
        <div className="w-1 bg-gray-800 hover:bg-blue-500 cursor-col-resize z-10 flex-shrink-0"
          onMouseDown={() => setIsDraggingCodePanel(true)} />

        {/* Right panel */}
        <div style={{ width: codePanelWidth }} className="flex flex-col bg-gray-900 border-l border-gray-800 flex-shrink-0">

          {/* Code viewer */}
          <div className="flex-1 overflow-hidden relative flex flex-col min-h-0">
            <div className="p-2 font-semibold text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800 bg-gray-900 select-none flex-shrink-0">
              Source Code
              {activeFile && (
                <span className="ml-2 text-gray-600 font-normal normal-case" title={activeFile}>
                  — {activeFile.split(/[/\\]/).pop()}
                </span>
              )}
            </div>
            <div className="flex-1 overflow-hidden min-h-0">
              <CodeViewer
                filePath={activeFile}
                highlightLine={activeSymbol?.location?.start?.row}
              />
            </div>
          </div>

          {/* Notes resizer */}
          <div
            className="h-1 bg-gray-800 hover:bg-blue-500 cursor-row-resize z-10 flex-shrink-0 flex justify-center items-center"
            onMouseDown={() => setIsDraggingNotes(true)}
          >
            <div className="w-8 h-0.5 bg-gray-700 rounded-full" />
          </div>

          {/* Notes panel */}
          <div style={{ height: notesHeight }} className="flex flex-col bg-gray-900 flex-shrink-0">
            <NotesPanel
              rootDir={rootDir}
              startContext={
                activeSymbol
                  ? activeSymbol.name
                  : activeFile
                  ? (activeFile.split(/[/\\]/).pop() || null)
                  : null
              }
            />
          </div>
        </div>
      </div>

      {/* ── Search panel overlay ── */}
      {searchOpen && symbols && (
        <SearchPanel
          symbols={symbols}
          onSelectSymbol={(symbol, file) => {
            handleSelectSymbol(symbol, file);
            setSearchOpen(false);
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {/* ── Call Path Finder overlay ── */}
      {pathFinderOpen && symbols && (
        <CallPathFinder
          symbols={symbols}
          onSelectSymbol={(symbol, file) => {
            handleSelectSymbol(symbol, file);
            setPathFinderOpen(false);
          }}
          onClose={() => setPathFinderOpen(false)}
        />
      )}
    </div>
  );
}

export default App;

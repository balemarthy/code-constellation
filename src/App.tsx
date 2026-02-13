import { useState, useEffect } from 'react'
import { SymbolNode } from './types';
import './App.css'
import FileTree from './components/FileTree';
import GraphView from './components/GraphView';
import CodeViewer from './components/CodeViewer';
import NotesPanel from './components/NotesPanel';

function App() {
  const [rootDir, setRootDir] = useState<string | null>(null);
  const [symbols, setSymbols] = useState<any>(null); // Using any for now to avoid Map type issues in rendering
  const [status, setStatus] = useState<string>('');

  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [activeSymbol, setActiveSymbol] = useState<SymbolNode | null>(null);

  // Layout State
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [codePanelWidth, setCodePanelWidth] = useState(400);
  const [notesHeight, setNotesHeight] = useState(200);
  const [isDraggingSidebar, setIsDraggingSidebar] = useState(false);
  const [isDraggingCodePanel, setIsDraggingCodePanel] = useState(false);
  const [isDraggingNotes, setIsDraggingNotes] = useState(false);

  // Session Management
  useEffect(() => {
    if (!rootDir) return;
    const loadSession = async () => {
      try {
        const session = await window.api.getSession(rootDir);
        if (session) {
          if (session.activeFile) setActiveFile(session.activeFile);
          if (session.sidebarWidth) setSidebarWidth(session.sidebarWidth);
          if (session.codePanelWidth) setCodePanelWidth(session.codePanelWidth);
          if (session.notesHeight) setNotesHeight(session.notesHeight);
        }
      } catch (e) {
        console.error("Failed to load session", e);
      }
    };
    loadSession();
  }, [rootDir]);

  useEffect(() => {
    if (!rootDir) return;
    const saveSession = async () => {
      try {
        await window.api.saveSession(rootDir, {
          activeFile,
          sidebarWidth,
          codePanelWidth,
          notesHeight
          // activeSymbol: activeSymbol?.name 
        });
      } catch (e) {
        console.error("Failed to save session", e);
      }
    };
    const timer = setTimeout(saveSession, 2000); // Autosave every 2s
    return () => clearTimeout(timer);
  }, [rootDir, activeFile, sidebarWidth, codePanelWidth, notesHeight]);


  const handleOpenFolder = async () => {
    try {
      const dir = await window.api.openDirectoryDialog();
      if (dir) {
        setRootDir(dir);
        setStatus(`Scanning ${dir}...`);
        const result = await window.api.scanDirectory(dir);
        setSymbols(result);
        setStatus(`Scanned ${Object.keys(result).length} files.`);
      }
    } catch (e) {
      console.error(e);
      setStatus('Error opening folder');
    }
  };

  const handleSelectFile = (file: string) => {
    setActiveFile(file);
    setActiveSymbol(null);
  };

  const handleSelectSymbol = (symbol: SymbolNode, file: string) => {
    setActiveFile(file);
    setActiveSymbol(symbol);
  };

  // Resize Handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingSidebar) {
        setSidebarWidth(Math.max(150, Math.min(600, e.clientX)));
      }
      if (isDraggingCodePanel) {
        // Dragging left border of right panel
        const newWidth = window.innerWidth - e.clientX;
        setCodePanelWidth(Math.max(300, Math.min(800, newWidth)));
      }
      if (isDraggingNotes) {
        // Dragging top border of bottom notes panel
        // e.clientY is cursor Y. Distance from bottom = window.innerHeight - e.clientY
        const newHeight = window.innerHeight - e.clientY;
        setNotesHeight(Math.max(100, Math.min(600, newHeight)));
      }
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

  return (
    <div className="h-screen w-screen flex flex-col bg-gray-900 text-white overflow-hidden">
      {/* Header */}
      <div className="h-12 border-b border-gray-800 flex items-center px-4 bg-gray-950 select-none">
        <span className="font-bold text-lg mr-4 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
          Code Constellation
        </span>
        <button
          onClick={handleOpenFolder}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm transition-colors"
        >
          Open Folder
        </button>
        <span className="ml-4 text-xs text-gray-400">{status}</span>
        <span className="ml-auto text-xs text-gray-500 mr-2">
          {rootDir ? `Project: ${rootDir}` : ''}
        </span>
      </div>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">

        {/* Left Sidebar */}
        <div style={{ width: sidebarWidth }} className="border-r border-gray-800 flex flex-col bg-gray-900">
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
              <div className="text-gray-600 text-sm text-center mt-10">No folder open</div>
            )}
          </div>
        </div>

        {/* Sidebar Resizer */}
        <div
          className="w-1 bg-gray-800 hover:bg-blue-500 cursor-col-resize z-10"
          onMouseDown={() => setIsDraggingSidebar(true)}
        />

        {/* Center Graph */}
        <div className="flex-1 bg-gray-950 relative overflow-hidden flex flex-col">
          <GraphView
            centerSymbol={activeSymbol}
            onNodeSelect={(name) => console.log(name)}
          />
        </div>

        {/* Code Panel Resizer */}
        <div
          className="w-1 bg-gray-800 hover:bg-blue-500 cursor-col-resize z-10"
          onMouseDown={() => setIsDraggingCodePanel(true)}
        />

        {/* Right Panel (Code + Notes) */}
        <div style={{ width: codePanelWidth }} className="flex flex-col bg-gray-900 border-l border-gray-800">

          {/* Code Viewer */}
          <div className="flex-1 overflow-hidden relative flex flex-col">
            <div className="p-2 font-semibold text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800 bg-gray-900 select-none">
              Source Code
            </div>
            <div className="flex-1 overflow-hidden">
              <CodeViewer
                filePath={activeFile}
                highlightLine={activeSymbol?.location?.start?.row}
              />
            </div>
          </div>

          {/* Notes Resizer */}
          <div
            className="h-1 bg-gray-800 hover:bg-blue-500 cursor-row-resize z-10 flex justify-center items-center"
            onMouseDown={() => setIsDraggingNotes(true)}
          >
            <div className="w-8 h-0.5 bg-gray-700 rounded-full" />
          </div>

          {/* Notes Panel */}
          <div style={{ height: notesHeight }} className="flex flex-col bg-gray-900">
            <NotesPanel
              rootDir={rootDir}
              startContext={activeSymbol ? activeSymbol.name : (activeFile ? (activeFile.split(/[/\\]/).pop() || null) : null)}
            />
          </div>

        </div>

      </div>
    </div>
  )
}

export default App

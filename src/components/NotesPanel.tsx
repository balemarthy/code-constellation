import React, { useEffect, useState, useMemo, useRef } from 'react';
import { jsPDF } from 'jspdf';

interface NotesPanelProps {
    rootDir: string | null;
    startContext: string | null;
}

type PanelMode = 'edit' | 'preview' | 'overview';

// ─── Minimal inline markdown renderer ────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
    // Handle **bold**, *italic*, `code` inline
    const parts: React.ReactNode[] = [];
    const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
    let last = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
        if (match.index > last) parts.push(text.slice(last, match.index));
        if (match[2]) parts.push(<strong key={match.index} style={{ color: '#e2e8f0' }}>{match[2]}</strong>);
        else if (match[3]) parts.push(<em key={match.index} style={{ color: '#cbd5e1' }}>{match[3]}</em>);
        else if (match[4]) parts.push(
            <code key={match.index} style={{
                background: '#1e293b', color: '#7dd3fc',
                fontFamily: 'monospace', fontSize: '0.85em',
                padding: '1px 4px', borderRadius: '3px',
            }}>{match[4]}</code>
        );
        last = match.index + match[0].length;
    }
    if (last < text.length) parts.push(text.slice(last));
    return parts;
}

function renderMarkdown(md: string): React.ReactNode {
    const lines = md.split('\n');
    const elements: React.ReactNode[] = [];
    let inCode = false;
    let codeLines: string[] = [];
    let key = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('```')) {
            if (inCode) {
                elements.push(
                    <pre key={key++} style={{
                        background: '#0f172a', color: '#94a3b8',
                        fontFamily: 'monospace', fontSize: '11px',
                        padding: '8px 10px', borderRadius: '4px',
                        overflowX: 'auto', margin: '6px 0',
                        border: '1px solid #1e293b',
                    }}>
                        {codeLines.join('\n')}
                    </pre>
                );
                codeLines = [];
                inCode = false;
            } else {
                inCode = true;
            }
            continue;
        }

        if (inCode) { codeLines.push(line); continue; }

        if (line.startsWith('### ')) {
            elements.push(<h3 key={key++} style={{ color: '#93c5fd', fontSize: '12px', fontWeight: 700, margin: '8px 0 3px', borderBottom: '1px solid #1e3a5f', paddingBottom: '2px' }}>{renderInline(line.slice(4))}</h3>);
        } else if (line.startsWith('## ')) {
            elements.push(<h2 key={key++} style={{ color: '#60a5fa', fontSize: '13px', fontWeight: 700, margin: '10px 0 4px', borderBottom: '1px solid #1e3a5f', paddingBottom: '3px' }}>{renderInline(line.slice(3))}</h2>);
        } else if (line.startsWith('# ')) {
            elements.push(<h1 key={key++} style={{ color: '#3b82f6', fontSize: '14px', fontWeight: 700, margin: '10px 0 4px' }}>{renderInline(line.slice(2))}</h1>);
        } else if (/^[-*] /.test(line)) {
            elements.push(
                <div key={key++} style={{ display: 'flex', gap: '6px', margin: '2px 0', color: '#94a3b8', fontSize: '12px' }}>
                    <span style={{ color: '#3b82f6', flexShrink: 0 }}>•</span>
                    <span>{renderInline(line.slice(2))}</span>
                </div>
            );
        } else if (/^\d+\. /.test(line)) {
            const num = line.match(/^(\d+)\. /)?.[1];
            elements.push(
                <div key={key++} style={{ display: 'flex', gap: '6px', margin: '2px 0', color: '#94a3b8', fontSize: '12px' }}>
                    <span style={{ color: '#3b82f6', flexShrink: 0, minWidth: '16px' }}>{num}.</span>
                    <span>{renderInline(line.replace(/^\d+\. /, ''))}</span>
                </div>
            );
        } else if (line.trim() === '') {
            elements.push(<div key={key++} style={{ height: '6px' }} />);
        } else {
            elements.push(<p key={key++} style={{ color: '#94a3b8', fontSize: '12px', margin: '2px 0', lineHeight: '1.6' }}>{renderInline(line)}</p>);
        }
    }

    return <>{elements}</>;
}

// ─── Component ────────────────────────────────────────────────────────────────

const NotesPanel: React.FC<NotesPanelProps> = ({ rootDir, startContext }) => {
    const [notes, setNotes]               = useState<Record<string, string>>({});
    const [context, setContext]           = useState<string>('General');
    const [currentNote, setCurrentNote]   = useState<string>('');
    const [mode, setMode]                 = useState<PanelMode>('edit');
    const [loading, setLoading]           = useState(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        setContext(startContext || 'General');
    }, [startContext]);

    useEffect(() => {
        if (!rootDir) return;
        const load = async () => {
            setLoading(true);
            try {
                const loaded = await window.api.getNotes(rootDir);
                setNotes(loaded);
            } catch (e) { console.error('Failed to load notes', e); }
            finally { setLoading(false); }
        };
        load();
    }, [rootDir]);

    useEffect(() => {
        setCurrentNote(notes[context] || '');
    }, [context, notes]);

    const handleSave = (text: string) => {
        const updated = { ...notes, [context]: text };
        setNotes(updated);
        setCurrentNote(text);
        if (!rootDir) return;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            try { await window.api.saveNotes(rootDir, updated); }
            catch (e) { console.error('Failed to save notes', e); }
        }, 500);
    };

    // Annotated symbols: all contexts with non-empty notes, excluding current
    const annotatedContexts = useMemo(() =>
        Object.entries(notes)
            .filter(([, text]) => text.trim().length > 0)
            .sort(([a], [b]) => a.localeCompare(b)),
        [notes]
    );

    const wordCount = useMemo(() =>
        currentNote.trim() ? currentNote.trim().split(/\s+/).length : 0,
        [currentNote]
    );

    const exportToPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(20);
        doc.text('Code Constellation — Investigation Journal', 10, 20);
        doc.setFontSize(11);
        doc.setTextColor(120);
        doc.text(`Project: ${rootDir || 'Unknown'}`, 10, 30);
        doc.text(`Exported: ${new Date().toLocaleDateString()}`, 10, 37);

        let y = 50;
        doc.setTextColor(0);
        Object.entries(notes).forEach(([key, content]) => {
            if (!content.trim()) return;
            if (y > 265) { doc.addPage(); y = 20; }
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.text(key, 10, y);
            y += 7;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            const lines = doc.splitTextToSize(content, 180);
            doc.text(lines, 10, y);
            y += (lines.length * 5) + 10;
        });
        doc.save(`CodeConstellation-Journal-${Date.now()}.pdf`);
    };

    if (!rootDir) return <div className="p-4 text-gray-600 text-xs">Open a folder to start your investigation journal.</div>;
    if (loading)  return <div className="p-4 text-gray-600 text-xs">Loading notes…</div>;

    return (
        <div className="h-full flex flex-col bg-gray-900 border-t border-gray-800">

            {/* ── Header bar ── */}
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-950/60 border-b border-gray-800 flex-shrink-0">

                {/* Context chip */}
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="text-[9px] uppercase tracking-widest text-gray-600 font-bold flex-shrink-0">Note for</span>
                    <span
                        className="text-xs font-mono font-semibold text-blue-400 truncate"
                        title={context}
                    >
                        {context}
                    </span>
                    {currentNote.trim() && (
                        <span className="text-[9px] text-gray-600 flex-shrink-0">
                            {wordCount}w
                        </span>
                    )}
                </div>

                {/* Mode toggles */}
                <div className="flex items-center bg-gray-800/80 rounded-md p-0.5 flex-shrink-0">
                    {(['edit', 'preview', 'overview'] as PanelMode[]).map(m => (
                        <button
                            key={m}
                            onClick={() => setMode(m)}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                                mode === m
                                    ? 'bg-gray-700 text-white'
                                    : 'text-gray-500 hover:text-gray-300'
                            }`}
                        >
                            {m === 'overview'
                                ? `All (${annotatedContexts.length})`
                                : m.charAt(0).toUpperCase() + m.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Actions */}
                {context !== 'General' && mode !== 'overview' && (
                    <button
                        onClick={() => setContext('General')}
                        className="text-[10px] text-gray-600 hover:text-gray-400 flex-shrink-0 px-1"
                        title="Switch to General notes"
                    >
                        General
                    </button>
                )}
                <button
                    onClick={exportToPDF}
                    className="flex-shrink-0 text-gray-600 hover:text-blue-400 transition-colors"
                    title="Export all notes to PDF"
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                </button>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-hidden">

                {/* Edit mode */}
                {mode === 'edit' && (
                    <textarea
                        className="w-full h-full bg-transparent text-gray-300 p-3 resize-none focus:outline-none font-mono text-xs leading-relaxed"
                        placeholder={`# ${context}\n\nWrite your investigation notes here…\n\nSupports **bold**, *italic*, \`code\`, ## headings, and - lists.`}
                        value={currentNote}
                        onChange={e => handleSave(e.target.value)}
                        spellCheck={false}
                    />
                )}

                {/* Preview mode */}
                {mode === 'preview' && (
                    <div className="h-full overflow-auto p-3">
                        {currentNote.trim()
                            ? renderMarkdown(currentNote)
                            : <span className="text-gray-700 text-xs italic">Nothing written yet. Switch to Edit to add notes.</span>
                        }
                    </div>
                )}

                {/* Overview: all annotated symbols */}
                {mode === 'overview' && (
                    <div className="h-full overflow-auto p-2 flex flex-col gap-1">
                        {annotatedContexts.length === 0 ? (
                            <div className="text-gray-700 text-xs text-center mt-6 italic">
                                No notes yet. Start investigating symbols to build your journal.
                            </div>
                        ) : (
                            annotatedContexts.map(([ctx, text]) => {
                                const firstLine = text.split('\n').find(l => l.trim()) || '';
                                const preview   = firstLine.replace(/^#+\s*/, '').replace(/\*\*/g, '').slice(0, 80);
                                const isCurrent = ctx === context;
                                return (
                                    <button
                                        key={ctx}
                                        onClick={() => { setContext(ctx); setMode('edit'); }}
                                        className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                                            isCurrent
                                                ? 'bg-blue-950/50 border-blue-800/50'
                                                : 'bg-gray-800/40 border-gray-800/60 hover:bg-gray-800/70'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs font-mono font-semibold truncate ${isCurrent ? 'text-blue-300' : 'text-gray-300'}`}>
                                                {ctx}
                                            </span>
                                            <span className="text-[9px] text-gray-600 ml-auto flex-shrink-0">
                                                {text.trim().split(/\s+/).length}w
                                            </span>
                                        </div>
                                        {preview && (
                                            <div className="text-[10px] text-gray-600 mt-0.5 truncate">{preview}</div>
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default NotesPanel;

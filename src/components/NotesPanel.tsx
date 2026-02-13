import React, { useEffect, useState } from 'react';

interface NotesPanelProps {
    rootDir: string | null;
    startContext: string | null; // The current function/symbol name being viewed
}

const NotesPanel: React.FC<NotesPanelProps> = ({ rootDir, startContext }) => {
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [context, setContext] = useState<string>('General');
    const [currentNote, setCurrentNote] = useState<string>('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (startContext) {
            setContext(startContext);
        } else {
            setContext('General');
        }
    }, [startContext]);

    // Load notes on mount or rootDir change
    useEffect(() => {
        if (!rootDir) return;
        const load = async () => {
            setLoading(true);
            try {
                const loaded = await window.api.getNotes(rootDir);
                setNotes(loaded);
            } catch (e) {
                console.error("Failed to load notes", e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [rootDir]);

    // Sync currentNote with context when context changes or notes load
    useEffect(() => {
        setCurrentNote(notes[context] || '');
    }, [context, notes]);

    const handleSave = async (newContent: string) => {
        if (!rootDir) return;

        const updatedNotes = { ...notes, [context]: newContent };
        setNotes(updatedNotes);
        setCurrentNote(newContent);

        try {
            await window.api.saveNotes(rootDir, updatedNotes);
        } catch (e) {
            console.error("Failed to save notes", e);
        }
    };

    if (!rootDir) return <div className="p-4 text-gray-500">Open a folder to start taking notes.</div>;
    if (loading) return <div className="p-4 text-gray-500">Loading notes...</div>;

    return (
        <div className="h-full flex flex-col bg-gray-900 border-t border-gray-800">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
                <span className="font-semibold text-gray-300 text-sm">
                    Notes for: <span className="text-blue-400">{context}</span>
                </span>
                {context !== 'General' && (
                    <button
                        onClick={() => setContext('General')}
                        className="text-xs text-gray-400 hover:text-white"
                    >
                        Switch to General
                    </button>
                )}
            </div>
            <textarea
                className="flex-1 w-full bg-gray-900 text-gray-300 p-4 resize-none focus:outline-none font-mono text-sm"
                placeholder={`Write your notes for ${context} here... (Markdown supported)`}
                value={currentNote}
                onChange={(e) => handleSave(e.target.value)}
            />
        </div>
    );
};

export default NotesPanel;

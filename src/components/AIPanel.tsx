import React from 'react';

interface AIPanelProps {
    content: string;
    loading: boolean;
    error: string | null;
    context: string;
    onClose: () => void;
    onAddToNotes: (text: string) => void;
}

const AIPanel: React.FC<AIPanelProps> = ({ content, loading, error, context, onClose, onAddToNotes }) => {
    const handleCopy = () => {
        navigator.clipboard.writeText(content);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
            <div
                className="bg-gray-900 border border-gray-700 rounded-xl w-[640px] max-h-[80vh] shadow-2xl flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="w-6 h-6 rounded-full bg-purple-700/60 flex items-center justify-center flex-shrink-0">
                            <svg className="w-3.5 h-3.5 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <div>
                            <div className="text-sm font-semibold text-white">AI Explanation</div>
                            {context && (
                                <div className="text-xs text-gray-500 font-mono truncate max-w-[400px]">{context}</div>
                            )}
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg leading-none ml-4 flex-shrink-0">✕</button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto px-5 py-4 min-h-0">
                    {loading && (
                        <div className="flex items-center gap-3 text-gray-400 text-sm">
                            <div className="flex gap-1">
                                <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                            Analyzing code…
                        </div>
                    )}

                    {error && (
                        <div className="text-red-400 text-sm bg-red-950/40 border border-red-800/50 rounded-lg px-4 py-3">
                            <div className="font-medium mb-1">Error</div>
                            <div className="text-red-300/80">{error}</div>
                        </div>
                    )}

                    {!loading && !error && content && (
                        <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap font-sans">
                            {content}
                        </div>
                    )}

                    {!loading && !error && !content && (
                        <div className="text-gray-500 text-sm">No response yet.</div>
                    )}
                </div>

                {/* Footer actions */}
                {!loading && !error && content && (
                    <div className="px-5 py-3 border-t border-gray-800 flex justify-end gap-2 flex-shrink-0">
                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Copy
                        </button>
                        <button
                            onClick={() => onAddToNotes(content)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors font-medium"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Add to Notes
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AIPanel;

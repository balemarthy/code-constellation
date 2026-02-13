import React, { useEffect, useState } from 'react';

interface CodeViewerProps {
    filePath: string | null;
    highlightLine?: number;
}

const CodeViewer: React.FC<CodeViewerProps> = ({ filePath, highlightLine }) => {
    const [content, setContent] = useState<string>('');
    const [inactiveRanges, setInactiveRanges] = useState<{ start: number, end: number }[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!filePath) {
            setContent('');
            setInactiveRanges([]);
            return;
        }

        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const text = await window.api.readFile(filePath);
                setContent(text);

                // Fetch inactive ranges
                // Note: tree-sitter lines are 0-indexed.
                const ranges = await window.api.getInactiveRanges(filePath);
                setInactiveRanges(ranges);

            } catch (e) {
                console.error(e);
                setError('Failed to load file');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [filePath]);

    if (!filePath) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                Select a file or symbol to view source
            </div>
        );
    }

    if (loading) return <div className="p-4 text-sm text-gray-500">Loading...</div>;
    if (error) return <div className="p-4 text-sm text-red-400">{error}</div>;

    const lines = content.split('\n');

    return (
        <div className="h-full overflow-auto bg-gray-900 border-l border-gray-800 text-sm font-mono text-gray-300">
            <div className="flex flex-col min-w-max">
                {lines.map((line, idx) => {
                    const isInactive = inactiveRanges.some(r => idx >= r.start && idx <= r.end);
                    return (
                        <div
                            key={idx}
                            className={`flex hover:bg-gray-800 ${highlightLine === idx ? 'bg-yellow-900/30' : ''} ${isInactive ? 'opacity-40 select-none grayscale' : ''}`}
                            id={`line-${idx}`}
                        >
                            <span className="w-10 text-right text-gray-600 select-none bg-gray-900 pr-3 border-r border-gray-800 mr-2 flex-shrink-0">
                                {idx + 1}
                            </span>
                            <span className="whitespace-pre">{line}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );

};

export default CodeViewer;

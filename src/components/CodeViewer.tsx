import React, { useEffect, useState, useMemo } from 'react';

interface CodeViewerProps {
    filePath: string | null;
    highlightLine?: number;
}

// ─── Tokenizer ────────────────────────────────────────────────────────────────

type TokenType = 'keyword' | 'string' | 'comment' | 'number' | 'preprocessor' | 'default';
interface Token { text: string; type: TokenType; }

const C_KEYWORDS = new Set([
    'auto','break','case','char','const','continue','default','do','double',
    'else','enum','extern','float','for','goto','if','inline','int','long',
    'register','return','short','signed','sizeof','static','struct','switch',
    'typedef','union','unsigned','void','volatile','while',
    'NULL','true','false','bool',
    'uint8_t','uint16_t','uint32_t','uint64_t','int8_t','int16_t','int32_t','int64_t',
    'size_t','ptrdiff_t','BaseType_t','UBaseType_t','TickType_t',
    'TaskHandle_t','QueueHandle_t','SemaphoreHandle_t','EventGroupHandle_t',
]);

const RUST_KEYWORDS = new Set([
    'as','async','await','break','const','continue','crate','dyn','else','enum',
    'extern','false','fn','for','if','impl','in','let','loop','match','mod',
    'move','mut','pub','ref','return','self','Self','static','struct','super',
    'trait','true','type','unsafe','use','where','while',
    'Box','Vec','String','Option','Result','Some','None','Ok','Err',
    'i8','i16','i32','i64','i128','u8','u16','u32','u64','u128',
    'f32','f64','usize','isize','bool','str','char',
]);

const PYTHON_KEYWORDS = new Set([
    'False','None','True','and','as','assert','async','await','break','class',
    'continue','def','del','elif','else','except','finally','for','from',
    'global','if','import','in','is','lambda','nonlocal','not','or','pass',
    'raise','return','try','while','with','yield','self','cls',
]);

function getKeywords(lang: string): Set<string> {
    if (lang === 'rust')   return RUST_KEYWORDS;
    if (lang === 'python') return PYTHON_KEYWORDS;
    return C_KEYWORDS; // c, cpp
}

function getLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'rs') return 'rust';
    if (ext === 'py') return 'python';
    if (ext === 'cpp' || ext === 'hpp' || ext === 'cc' || ext === 'cxx') return 'cpp';
    return 'c'; // .c, .h and fallback
}

function tokenizeLine(line: string, lang: string, inBlockComment: boolean): [Token[], boolean] {
    const tokens: Token[] = [];
    let pos = 0;

    function push(text: string, type: TokenType) {
        if (text.length > 0) tokens.push({ text, type });
    }

    // Continue through an open block comment
    if (inBlockComment) {
        const end = line.indexOf('*/');
        if (end === -1) {
            push(line, 'comment');
            return [tokens, true];
        }
        push(line.slice(0, end + 2), 'comment');
        pos = end + 2;
        // fall through to tokenize the rest of the line
    }

    // Whole line is a preprocessor directive (after stripping leading whitespace)
    if ((lang === 'c' || lang === 'cpp') && line.slice(pos).trimStart().startsWith('#')) {
        const commentIdx = line.indexOf('//', pos);
        if (commentIdx !== -1) {
            push(line.slice(pos, commentIdx), 'preprocessor');
            push(line.slice(commentIdx), 'comment');
        } else {
            push(line.slice(pos), 'preprocessor');
        }
        return [tokens, false];
    }

    while (pos < line.length) {
        const ch  = line[pos];
        const ch2 = line[pos + 1];

        // Block comment open
        if (ch === '/' && ch2 === '*') {
            const end = line.indexOf('*/', pos + 2);
            if (end === -1) {
                push(line.slice(pos), 'comment');
                return [tokens, true];
            }
            push(line.slice(pos, end + 2), 'comment');
            pos = end + 2;
            continue;
        }

        // Line comment //
        if (ch === '/' && ch2 === '/') {
            push(line.slice(pos), 'comment');
            break;
        }

        // Python / shell comment
        if (lang === 'python' && ch === '#') {
            push(line.slice(pos), 'comment');
            break;
        }

        // Double-quoted string
        if (ch === '"') {
            let j = pos + 1;
            while (j < line.length) {
                if (line[j] === '\\') { j += 2; continue; }
                if (line[j] === '"')  { j++; break; }
                j++;
            }
            push(line.slice(pos, j), 'string');
            pos = j;
            continue;
        }

        // Single-quoted char / string
        if (ch === "'") {
            let j = pos + 1;
            while (j < line.length) {
                if (line[j] === '\\') { j += 2; continue; }
                if (line[j] === "'")  { j++; break; }
                j++;
            }
            push(line.slice(pos, j), 'string');
            pos = j;
            continue;
        }

        // Number (decimal, hex 0x..., float)
        if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(ch2 ?? ''))) {
            let j = pos;
            if (ch === '0' && (ch2 === 'x' || ch2 === 'X')) {
                j += 2;
                while (j < line.length && /[0-9a-fA-F_]/.test(line[j])) j++;
            } else {
                while (j < line.length && /[0-9._eEfFuUlLnN]/.test(line[j])) j++;
            }
            push(line.slice(pos, j), 'number');
            pos = j;
            continue;
        }

        // Identifier / keyword
        if (/[a-zA-Z_]/.test(ch)) {
            let j = pos;
            while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++;
            const word = line.slice(pos, j);
            push(word, getKeywords(lang).has(word) ? 'keyword' : 'default');
            pos = j;
            continue;
        }

        // Punctuation / operator / whitespace — collect a run of them
        push(ch, 'default');
        pos++;
    }

    return [tokens, false];
}

const TOKEN_COLOR: Record<TokenType, string> = {
    keyword:     '#569cd6', // blue
    string:      '#ce9178', // orange-brown
    comment:     '#6a9955', // green
    number:      '#b5cea8', // light green
    preprocessor:'#c586c0', // pink-purple
    default:     '#d4d4d4', // light gray
};

// ─── Component ────────────────────────────────────────────────────────────────

const CodeViewer: React.FC<CodeViewerProps> = ({ filePath, highlightLine }) => {
    const [content, setContent] = useState<string>('');
    const [inactiveRanges, setInactiveRanges] = useState<{ start: number; end: number }[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!filePath) { setContent(''); setInactiveRanges([]); return; }

        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const [text, ranges] = await Promise.all([
                    window.api.readFile(filePath),
                    window.api.getInactiveRanges(filePath),
                ]);
                setContent(text);
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

    useEffect(() => {
        if (highlightLine !== undefined && content) {
            const el = document.getElementById(`line-${highlightLine}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [highlightLine, content]);

    // Precompute inactive line set for O(1) per-line check
    const inactiveLineSet = useMemo(() => {
        const set = new Set<number>();
        for (const r of inactiveRanges) {
            for (let i = r.start; i <= r.end; i++) set.add(i);
        }
        return set;
    }, [inactiveRanges]);

    // Pre-tokenize all lines
    const tokenizedLines = useMemo(() => {
        if (!content || !filePath) return [];
        const lang = getLanguage(filePath);
        let inBlockComment = false;
        return content.split('\n').map(line => {
            const [tokens, nextState] = tokenizeLine(line, lang, inBlockComment);
            inBlockComment = nextState;
            return tokens;
        });
    }, [content, filePath]);

    if (!filePath) {
        return (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                Select a file or symbol to view source
            </div>
        );
    }

    if (loading) return <div className="p-4 text-sm text-gray-500">Loading...</div>;
    if (error)   return <div className="p-4 text-sm text-red-400">{error}</div>;

    return (
        <div className="h-full overflow-auto bg-gray-900 text-sm font-mono text-gray-300">
            <div className="flex flex-col min-w-max">
                {tokenizedLines.map((tokens, idx) => {
                    const isInactive = inactiveLineSet.has(idx);
                    const isHighlighted = highlightLine === idx;
                    return (
                        <div
                            key={idx}
                            id={`line-${idx}`}
                            className={`flex hover:bg-gray-800/60 ${isHighlighted ? 'bg-yellow-900/30 border-l-2 border-yellow-500' : 'border-l-2 border-transparent'} ${isInactive ? 'opacity-30 select-none' : ''}`}
                        >
                            <span className="w-11 text-right text-gray-600 select-none bg-gray-900 pr-3 border-r border-gray-800 mr-2 flex-shrink-0 leading-6">
                                {idx + 1}
                            </span>
                            <span className="whitespace-pre leading-6">
                                {tokens.map((tok, ti) => (
                                    <span key={ti} style={{ color: TOKEN_COLOR[tok.type] }}>
                                        {tok.text}
                                    </span>
                                ))}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default CodeViewer;

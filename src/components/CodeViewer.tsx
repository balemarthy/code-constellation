import React, { useEffect, useState, useMemo, useRef } from 'react';

interface CodeViewerProps {
    filePath: string | null;
    highlightLine?: number;
    onExplainRequest?: (selectedText: string) => void;
    context?: string;
}

// ─── Tokenizer ────────────────────────────────────────────────────────────────

type TokenType = 'keyword' | 'string' | 'comment' | 'number' | 'preprocessor' | 'label' | 'directive' | 'register' | 'default';
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

// ARM/AArch64 + x86 register names (common subset)
const ASM_REGISTERS = new Set([
    // ARM 32-bit
    'r0','r1','r2','r3','r4','r5','r6','r7','r8','r9','r10','r11','r12',
    'sp','lr','pc','fp','ip','sl',
    // AArch64
    'x0','x1','x2','x3','x4','x5','x6','x7','x8','x9','x10','x11','x12',
    'x13','x14','x15','x16','x17','x18','x19','x20','x21','x22','x23',
    'x24','x25','x26','x27','x28','x29','x30',
    'w0','w1','w2','w3','w4','w5','w6','w7','w8','w9','w10','w11','w12',
    'xzr','wzr','xsp','wsp',
    // x86-64
    'rax','rbx','rcx','rdx','rsi','rdi','rsp','rbp',
    'eax','ebx','ecx','edx','esi','edi','esp','ebp',
    'ax','bx','cx','dx','si','di','sp','bp',
    'al','bl','cl','dl','ah','bh','ch','dh',
    // RISC-V
    'zero','ra','gp','tp','t0','t1','t2','s0','s1',
    'a0','a1','a2','a3','a4','a5','a6','a7',
]);

function getKeywords(lang: string): Set<string> {
    if (lang === 'rust')   return RUST_KEYWORDS;
    if (lang === 'python') return PYTHON_KEYWORDS;
    return C_KEYWORDS;
}

function getLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'rs') return 'rust';
    if (ext === 'py') return 'python';
    if (ext === 'cpp' || ext === 'hpp' || ext === 'cc' || ext === 'cxx') return 'cpp';
    if (ext === 's' || ext === 'asm' || ext === 's51') return 'asm';
    return 'c';
}

// ── Assembly tokenizer ────────────────────────────────────────────────────────

function tokenizeAsmLine(line: string): Token[] {
    const tokens: Token[] = [];
    const stripped = line.trimStart();

    // Comment: @, ;, // or /* */
    const commentMatch = stripped.match(/^(@|;|\/\/)(.*)$/);
    if (commentMatch) {
        const leading = line.slice(0, line.length - stripped.length);
        if (leading) tokens.push({ text: leading, type: 'default' });
        tokens.push({ text: stripped, type: 'comment' });
        return tokens;
    }

    // Label: identifier at start of line (no leading whitespace) followed by ':'
    const labelMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)(\s*:)/);
    if (labelMatch) {
        tokens.push({ text: labelMatch[1], type: 'label' });
        tokens.push({ text: labelMatch[2], type: 'default' });
        const rest = line.slice(labelMatch[0].length);
        if (rest.trim()) tokens.push(...tokenizeAsmLine(rest));
        return tokens;
    }

    // Directive: starts with '.'
    const directiveMatch = stripped.match(/^(\.[a-zA-Z_][a-zA-Z0-9_]*)(.*)/);
    if (directiveMatch) {
        const leading = line.slice(0, line.length - stripped.length);
        if (leading) tokens.push({ text: leading, type: 'default' });
        tokens.push({ text: directiveMatch[1], type: 'directive' });
        const rest = directiveMatch[2];
        if (rest) tokenizeAsmRest(rest, tokens);
        return tokens;
    }

    // Instruction line (leading whitespace + mnemonic + operands)
    tokenizeAsmRest(line, tokens);
    return tokens;
}

function tokenizeAsmRest(text: string, tokens: Token[]) {
    let pos = 0;
    while (pos < text.length) {
        const ch = text[pos];

        // Comment: @, ;, //
        if (ch === '@' || ch === ';' || (ch === '/' && text[pos + 1] === '/')) {
            tokens.push({ text: text.slice(pos), type: 'comment' });
            return;
        }

        // String
        if (ch === '"') {
            let j = pos + 1;
            while (j < text.length && text[j] !== '"') {
                if (text[j] === '\\') j++;
                j++;
            }
            j++;
            tokens.push({ text: text.slice(pos, j), type: 'string' });
            pos = j;
            continue;
        }

        // Hex number: 0x... or #0x...
        if ((ch === '0' && (text[pos + 1] === 'x' || text[pos + 1] === 'X')) ||
            (ch === '#' && text[pos + 1] === '0' && (text[pos + 2] === 'x' || text[pos + 2] === 'X'))) {
            let j = pos;
            if (ch === '#') j++;
            j += 2;
            while (j < text.length && /[0-9a-fA-F_]/.test(text[j])) j++;
            tokens.push({ text: text.slice(pos, j), type: 'number' });
            pos = j;
            continue;
        }

        // Immediate: #number
        if (ch === '#' && /[0-9-]/.test(text[pos + 1] ?? '')) {
            let j = pos + 1;
            while (j < text.length && /[0-9_]/.test(text[j])) j++;
            tokens.push({ text: text.slice(pos, j), type: 'number' });
            pos = j;
            continue;
        }

        // Decimal number
        if (/[0-9]/.test(ch)) {
            let j = pos;
            while (j < text.length && /[0-9_]/.test(text[j])) j++;
            tokens.push({ text: text.slice(pos, j), type: 'number' });
            pos = j;
            continue;
        }

        // Identifier: register or keyword
        if (/[a-zA-Z_]/.test(ch)) {
            let j = pos;
            while (j < text.length && /[a-zA-Z0-9_.]/.test(text[j])) j++;
            const word = text.slice(pos, j);
            const lower = word.toLowerCase();
            if (ASM_REGISTERS.has(lower)) {
                tokens.push({ text: word, type: 'register' });
            } else {
                tokens.push({ text: word, type: 'default' });
            }
            pos = j;
            continue;
        }

        tokens.push({ text: ch, type: 'default' });
        pos++;
    }
}

// ── C/Rust/Python tokenizer ───────────────────────────────────────────────────

function tokenizeLine(line: string, lang: string, inBlockComment: boolean): [Token[], boolean] {
    const tokens: Token[] = [];
    let pos = 0;

    function push(text: string, type: TokenType) {
        if (text.length > 0) tokens.push({ text, type });
    }

    if (inBlockComment) {
        const end = line.indexOf('*/');
        if (end === -1) {
            push(line, 'comment');
            return [tokens, true];
        }
        push(line.slice(0, end + 2), 'comment');
        pos = end + 2;
    }

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
        if (ch === '/' && ch2 === '/') { push(line.slice(pos), 'comment'); break; }
        if (lang === 'python' && ch === '#') { push(line.slice(pos), 'comment'); break; }

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
        if (/[a-zA-Z_]/.test(ch)) {
            let j = pos;
            while (j < line.length && /[a-zA-Z0-9_]/.test(line[j])) j++;
            const word = line.slice(pos, j);
            push(word, getKeywords(lang).has(word) ? 'keyword' : 'default');
            pos = j;
            continue;
        }
        push(ch, 'default');
        pos++;
    }
    return [tokens, false];
}

const TOKEN_COLOR: Record<TokenType, string> = {
    keyword:     '#569cd6',
    string:      '#ce9178',
    comment:     '#6a9955',
    number:      '#b5cea8',
    preprocessor:'#c586c0',
    label:       '#4ec9b0', // teal — assembly labels
    directive:   '#c586c0', // same as preprocessor
    register:    '#9cdcfe', // light blue — registers
    default:     '#d4d4d4',
};

// ─── Component ────────────────────────────────────────────────────────────────

const CodeViewer: React.FC<CodeViewerProps> = ({ filePath, highlightLine, onExplainRequest }) => {
    const [content, setContent] = useState<string>('');
    const [inactiveRanges, setInactiveRanges] = useState<{ start: number; end: number }[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // AI selection state
    const [selectedText, setSelectedText] = useState('');
    const [btnPos, setBtnPos] = useState<{ top: number; left: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!filePath) { setContent(''); setInactiveRanges([]); return; }
        const load = async () => {
            setLoading(true);
            setError(null);
            setSelectedText('');
            setBtnPos(null);
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

    const inactiveLineSet = useMemo(() => {
        const set = new Set<number>();
        for (const r of inactiveRanges) {
            for (let i = r.start; i <= r.end; i++) set.add(i);
        }
        return set;
    }, [inactiveRanges]);

    const tokenizedLines = useMemo(() => {
        if (!content || !filePath) return [];
        const lang = getLanguage(filePath);
        if (lang === 'asm') {
            return content.split('\n').map(line => tokenizeAsmLine(line));
        }
        let inBlockComment = false;
        return content.split('\n').map(line => {
            const [tokens, nextState] = tokenizeLine(line, lang, inBlockComment);
            inBlockComment = nextState;
            return tokens;
        });
    }, [content, filePath]);

    // ── Text selection → AI button ────────────────────────────────────────────
    const handleMouseUp = () => {
        if (!onExplainRequest) return;
        const sel = window.getSelection();
        const text = sel?.toString().trim() ?? '';
        if (text.length > 10 && sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            setSelectedText(text);
            setBtnPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
        } else {
            setSelectedText('');
            setBtnPos(null);
        }
    };

    const handleExplain = () => {
        if (onExplainRequest && selectedText) {
            onExplainRequest(selectedText);
            setSelectedText('');
            setBtnPos(null);
            window.getSelection()?.removeAllRanges();
        }
    };

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
        <div ref={containerRef} className="h-full overflow-auto bg-gray-900 text-sm font-mono text-gray-300 relative" onMouseUp={handleMouseUp}>
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

            {/* Floating "Explain with AI" button */}
            {selectedText && btnPos && onExplainRequest && (
                <button
                    className="fixed z-50 flex items-center gap-1.5 px-2.5 py-1 bg-purple-700 hover:bg-purple-600 text-white text-xs rounded shadow-lg border border-purple-500/50 transition-colors"
                    style={{ top: btnPos.top, left: btnPos.left }}
                    onMouseDown={e => e.preventDefault()}
                    onClick={handleExplain}
                >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Explain with AI
                </button>
            )}
        </div>
    );
};

export default CodeViewer;

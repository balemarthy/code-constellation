import * as fs from 'fs';
import * as path from 'path';
import { Parser, Language, Node as SyntaxNode, TreeCursor } from 'web-tree-sitter';
import type { SymbolNode, CallSite, CallPathStep } from '../src/types';

// Map extensions to language names (excludes .h — resolved dynamically)
const EXTENSION_MAP: Record<string, string> = {
    '.c': 'c',
    '.cpp': 'cpp',
    '.hpp': 'cpp',
    '.cc': 'cpp',
    '.rs': 'rust',
    '.py': 'python',
};

// .h files: treat as C++ if the same directory contains any .cpp/.cc file, otherwise C
function resolveHeaderLanguage(filePath: string): string {
    const dir = path.dirname(filePath);
    try {
        const siblings = fs.readdirSync(dir);
        return siblings.some(f => f.endsWith('.cpp') || f.endsWith('.cc')) ? 'cpp' : 'c';
    } catch {
        return 'c';
    }
}

function getFileLang(filePath: string): string | undefined {
    const ext = path.extname(filePath);
    if (ext === '.h') return resolveHeaderLanguage(filePath);
    return EXTENSION_MAP[ext];
}

export class Analyzer {
    private parser: Parser | null = null;
    private languages: Record<string, Language> = {};
    private wasmPath: string;
    private symbolIndex: Map<string, SymbolNode[]> = new Map(); // file -> symbols
    private callIndex: Map<string, CallSite[]> = new Map(); // funcName -> callSites
    private calleeIndex: Map<string, Set<string>> = new Map(); // callerName -> Set<calleeName>
    private nameIndex: Map<string, { symbol: SymbolNode; file: string }> = new Map(); // fast O(1) lookup
    private preprocessorIndex: Map<string, { start: number; end: number }[]> = new Map(); // file -> inactive ranges

    private projectConfig: Map<string, string | boolean> = new Map();

    constructor(wasmPath: string) {
        this.wasmPath = wasmPath;
    }

    async init() {
        await Parser.init({
            locateFile: (scriptName: string) => {
                return path.join(this.wasmPath, scriptName);
            }
        });
        this.parser = new Parser();
    }

    private loadProjectConfig(rootDir: string) {
        this.projectConfig.clear();

        // Try FreeRTOSConfig.h
        // Heuristic: search in root and subdirs (depth 1-2)
        // For simplicity: check root and specifically 'include' or 'config' dirs if we were smarter.
        // Let's just walk files found in scan? Or simplistic verification:
        const potentialPaths = [
            path.join(rootDir, 'FreeRTOSConfig.h'),
            path.join(rootDir, 'include', 'FreeRTOSConfig.h'),
            path.join(rootDir, 'config', 'FreeRTOSConfig.h'),
            path.join(rootDir, '.config') // Kconfig
        ];

        for (const p of potentialPaths) {
            if (fs.existsSync(p)) {
                const content = fs.readFileSync(p, 'utf8');
                if (p.endsWith('.h')) {
                    this.parseHeaderConfig(content);
                } else if (p.endsWith('.config')) {
                    this.parseKconfig(content);
                }
            }
        }
    }

    private parseHeaderConfig(content: string) {
        const lines = content.split('\n');
        for (const line of lines) {
            const match = line.match(/^\s*#define\s+(\w+)\s+(.+)$/);
            if (match) {
                const key = match[1];
                const val = match[2].trim();
                // Simple integer/boolean parsing
                if (val === '1' || val === '(1)') this.projectConfig.set(key, true);
                else if (val === '0' || val === '(0)') this.projectConfig.set(key, false);
                else this.projectConfig.set(key, val);
            }
        }
    }

    private parseKconfig(content: string) {
        const lines = content.split('\n');
        for (const line of lines) {
            if (line.trim().startsWith('#')) continue;
            const parts = line.split('=');
            if (parts.length === 2) {
                const key = parts[0].trim();
                const val = parts[1].trim();
                if (val === 'y') this.projectConfig.set(key, true);
                else if (val === 'n') this.projectConfig.set(key, false);
                else this.projectConfig.set(key, val);
            }
        }
    }


    async scanDirectory(dirPath: string): Promise<Record<string, SymbolNode[]>> {
        this.loadProjectConfig(dirPath);
        const cachePath = path.join(dirPath, '.code-constellation', 'cache.json');

        const files: string[] = [];
        this.getFilesRecursively(dirPath, files);

        if (!this.parser) await this.init();

        const cachedMtimes = this.loadCache(cachePath);

        let needsRescan = false;
        if (!cachedMtimes) {
            needsRescan = true;
        } else {
            // Check if any file is new or modified
            for (const file of files) {
                const currentMtime = fs.statSync(file).mtimeMs;
                if (cachedMtimes.get(file) !== currentMtime) {
                    needsRescan = true;
                    break;
                }
            }
            // Check if any cached file was deleted
            if (!needsRescan) {
                for (const file of cachedMtimes.keys()) {
                    if (!fs.existsSync(file)) { needsRescan = true; break; }
                }
            }
        }

        if (needsRescan) {
            // Clear stale state and re-parse everything
            this.symbolIndex.clear();
            this.callIndex.clear();
            this.calleeIndex.clear();
            this.nameIndex.clear();
            this.preprocessorIndex.clear();

            // Preload all required language WASMs in parallel before serial parsing
            const neededLangs = new Set(
                files.map(f => getFileLang(f)).filter((lang): lang is string => Boolean(lang))
            );
            await Promise.all([...neededLangs].map(lang => this.loadLanguage(lang)));

            for (const file of files) {
                try {
                    await this.analyzeFile(file);
                } catch (e) {
                    console.error(`Failed to analyze ${file}:`, e);
                }
            }
            this.saveCache(cachePath, files);
        } else {
            console.log('Cache up to date:', cachePath);
        }

        const result: Record<string, SymbolNode[]> = {};
        for (const [file, symbols] of this.symbolIndex.entries()) {
            result[file] = symbols;
        }
        return result;
    }

    private getFilesRecursively(dir: string, fileList: string[]) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.code-constellation') continue;
                this.getFilesRecursively(fullPath, fileList);
            } else {
                if (getFileLang(fullPath)) {
                    fileList.push(fullPath);
                }
            }
        }
    }

    private saveCache(cachePath: string, files: string[]) {
        try {
            const cacheDir = path.dirname(cachePath);
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }

            const fileMtimes: [string, number][] = files.map(f => [f, fs.statSync(f).mtimeMs]);

            const data = {
                version: 1,
                fileMtimes,
                symbolIndex: Array.from(this.symbolIndex.entries()),
                callIndex: Array.from(this.callIndex.entries()),
                calleeIndex: Array.from(this.calleeIndex.entries()).map(([k, v]) => [k, Array.from(v)]),
            };

            fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('Failed to save cache:', e);
        }
    }

    // Returns cached file→mtime map on success, null on failure/missing/version mismatch.
    private loadCache(cachePath: string): Map<string, number> | null {
        try {
            if (!fs.existsSync(cachePath)) return null;

            const raw = fs.readFileSync(cachePath, 'utf8');
            const data = JSON.parse(raw);

            if (data.version !== 1) {
                console.log('Cache version mismatch — will re-scan.');
                return null;
            }

            // Restore Maps and Sets
            this.symbolIndex = new Map(data.symbolIndex);
            this.callIndex = new Map(data.callIndex);

            this.calleeIndex = new Map();
            if (data.calleeIndex) {
                for (const [key, value] of data.calleeIndex) {
                    this.calleeIndex.set(key, new Set(value as string[]));
                }
            }

            // Rebuild nameIndex from symbolIndex
            this.nameIndex = new Map();
            for (const [file, symbols] of this.symbolIndex.entries()) {
                for (const sym of symbols) {
                    this.nameIndex.set(sym.name, { symbol: sym, file });
                }
            }

            return new Map(data.fileMtimes as [string, number][]);
        } catch (e) {
            console.error('Failed to load cache:', e);
            return null;
        }
    }

    async loadLanguage(langName: string) {
        if (this.languages[langName]) return this.languages[langName];

        const langFile = path.join(this.wasmPath, `tree-sitter-${langName}.wasm`);
        const lang = await Language.load(langFile);
        this.languages[langName] = lang;
        return lang;
    }

    async analyzeFile(filePath: string): Promise<SymbolNode[]> {
        if (!this.parser) await this.init();

        const langName = getFileLang(filePath);
        if (!langName) return [];

        const lang = await this.loadLanguage(langName);
        this.parser!.setLanguage(lang);

        const source = fs.readFileSync(filePath, 'utf8');
        const sourceLines = source.split('\n');
        const tree = this.parser!.parse(source);
        if (!tree) return [];

        const symbols = this.extractSymbols(tree.rootNode, filePath, langName);
        this.symbolIndex.set(filePath, symbols);

        // Populate fast name lookup
        for (const sym of symbols) {
            this.nameIndex.set(sym.name, { symbol: sym, file: filePath });
        }

        // Index calls
        this.indexCalls(tree.rootNode, filePath, langName, sourceLines);

        // Cache preprocessor inactive ranges for C/C++ (avoids re-parse on every file open)
        if (langName === 'c' || langName === 'cpp') {
            this.preprocessorIndex.set(filePath, this.computeInactiveRanges(tree.rootNode));
        }

        return symbols;
    }

    private indexCalls(node: SyntaxNode, filePath: string, lang: string, sourceLines: string[]) {
        const cursor = node.walk();
        const traverse = (c: TreeCursor) => {
            do {
                const n = c.currentNode;
                if (n.type === 'call_expression') {
                    let functionName = '';
                    // Extract function name based on language
                    if (lang === 'c' || lang === 'cpp' || lang === 'python' || lang === 'rust') {
                        const funcNode = n.childForFieldName('function');
                        if (funcNode) {
                            functionName = funcNode.text;
                        }
                    }

                    if (functionName) {
                        const caller = this.findEnclosingFunction(n, lang) || '<global>';
                        const snippet = (sourceLines[n.startPosition.row] || '').trim();

                        // Index Caller (Inverse)
                        if (!this.callIndex.has(functionName)) {
                            this.callIndex.set(functionName, []);
                        }
                        this.callIndex.get(functionName)!.push({
                            file: filePath,
                            start: n.startPosition,
                            caller,
                            snippet
                        });

                        // Index Callee (Direct)
                        // Key: caller function name. Value: list of unique callees.
                        // Note: colliding names across files will be merged in this simple implementation
                        if (!this.calleeIndex.has(caller)) {
                            this.calleeIndex.set(caller, new Set());
                        }
                        this.calleeIndex.get(caller)!.add(functionName);
                    }

                }

                if (c.gotoFirstChild()) {
                    traverse(c);
                    c.gotoParent();
                }
            } while (c.gotoNextSibling());
        };
        traverse(cursor);
    }

    private findEnclosingFunction(node: SyntaxNode, lang: string): string | null {
        let current: SyntaxNode | null = node.parent;
        while (current) {
            if (lang === 'c' || lang === 'cpp') {
                if (current.type === 'function_definition') {
                    const declarator = current.childForFieldName('declarator');
                    const id = this.findIdentifier(declarator);
                    return id ? id.text : null;
                }
            } else if (lang === 'python') {
                if (current.type === 'function_definition') {
                    const name = current.childForFieldName('name');
                    return name ? name.text : null;
                }
            } else if (lang === 'rust') {
                if (current.type === 'function_item') {
                    const name = current.childForFieldName('name');
                    return name ? name.text : null;
                }
            }
            current = current.parent;
        }
        return null;
    }

    getCallers(functionName: string) {
        return this.callIndex.get(functionName) || [];
    }



    async getInactiveRanges(filePath: string): Promise<{ start: number, end: number }[]> {
        // Return cached result if available
        if (this.preprocessorIndex.has(filePath)) {
            return this.preprocessorIndex.get(filePath)!;
        }

        const langName = getFileLang(filePath);
        if (!langName || (langName !== 'c' && langName !== 'cpp')) return [];

        if (!this.parser) await this.init();
        const lang = await this.loadLanguage(langName);
        this.parser!.setLanguage(lang);
        const source = fs.readFileSync(filePath, 'utf8');
        const tree = this.parser!.parse(source);
        if (!tree) return [];

        const ranges = this.computeInactiveRanges(tree.rootNode);
        this.preprocessorIndex.set(filePath, ranges);
        return ranges;
    }

    private computeInactiveRanges(rootNode: SyntaxNode): { start: number, end: number }[] {
        const inactiveRanges: { start: number, end: number }[] = [];

        const cursor = rootNode.walk();

        const evaluateCondition = (node: SyntaxNode): boolean | null => {
            // Very simple evaluation: check if identifier exists in config and is true/1
            // Real evaluation requires parsing the expression (&&, ||, defined(), etc.)
            // For MVP: recursive check on 'defined' or simple identifiers

            // If node is identifier:
            if (node.type === 'identifier') {
                const val = this.projectConfig.get(node.text);
                return !!val; // true if exists and truthy
            }
            // If call_expression (e.g. defined(X))
            if (node.type === 'call_expression') {
                const func = node.childForFieldName('function');
                if (func?.text === 'defined') {
                    const arg = node.childForFieldName('arguments')?.firstNamedChild;
                    if (arg) {
                        return this.projectConfig.has(arg.text);
                    }
                }
            }
            // If binary_expression (A && B) - simplified
            // Fallback: return null (unknown)
            return null;
        };

        const traverse = (c: TreeCursor) => {
            do {
                const n = c.currentNode;
                if (n.type === 'preproc_ifdef' || n.type === 'preproc_if') {
                    const conditionNode = n.type === 'preproc_ifdef'
                        ? n.childForFieldName('name')
                        : n.childForFieldName('condition');

                    if (conditionNode) {
                        let isActive = false;
                        if (n.type === 'preproc_ifdef') {
                            isActive = this.projectConfig.has(conditionNode.text);
                        } else {
                            // preproc_if
                            // Simplified: if condition contains a known false config variable, treat as inactive
                            // This is hard to do perfectly without full preproc evaluator.
                            // Let's rely on simplistic 'identifier' match for now.
                            const val = evaluateCondition(conditionNode);
                            isActive = val !== false; // Default to active if unknown
                        }

                        if (!isActive) {
                            // Mark whole block inactive? 
                            // preproc_ifdef structure: name, then body nodes...
                            // Tree-sitter struct can be tricky.
                            // Usually: #ifdef X ... #endif is one node?
                            // Let's check typical structure. contents are children.
                            // We want to gray out from End of #ifdef line to Start of #endif line.
                            inactiveRanges.push({
                                start: n.startPosition.row,
                                end: n.endPosition.row
                            });
                        }
                    }
                }

                if (c.gotoFirstChild()) {
                    traverse(c);
                    c.gotoParent();
                }
            } while (c.gotoNextSibling());
        };

        traverse(cursor);
        return inactiveRanges;
    }

    private extractSymbols(node: SyntaxNode, filePath: string, lang: string): SymbolNode[] {

        const symbols: SymbolNode[] = [];
        const cursor = node.walk();

        const traverse = (c: TreeCursor) => {
            do {
                const n = c.currentNode;
                const type = n.type;

                let symbolType: SymbolNode['type'] | null = null;
                let nameNode: SyntaxNode | null = null;

                if (lang === 'python') {
                    if (type === 'function_definition') {
                        symbolType = 'function';
                        nameNode = n.childForFieldName('name');
                    } else if (type === 'class_definition') {
                        symbolType = 'struct'; // Mapping class to struct/container
                        nameNode = n.childForFieldName('name');
                    }
                } else if (lang === 'c' || lang === 'cpp') {
                    if (type === 'function_definition') {
                        symbolType = 'function';
                        const declarator = n.childForFieldName('declarator');
                        // Declarator might be complex (pointer, ref), simplified here
                        nameNode = this.findIdentifier(declarator);
                    } else if (type === 'struct_specifier') {
                        symbolType = 'struct';
                        nameNode = n.childForFieldName('name');
                    }
                } else if (lang === 'rust') {
                    if (type === 'function_item') {
                        symbolType = 'function';
                        nameNode = n.childForFieldName('name');
                    } else if (type === 'struct_item') {
                        symbolType = 'struct';
                        nameNode = n.childForFieldName('name');
                    }
                }

                if (symbolType && nameNode) {
                    symbols.push({
                        name: nameNode.text,
                        type: symbolType,
                        location: {
                            file: filePath,
                            start: n.startPosition,
                            end: n.endPosition
                        }
                    });
                }

                if (c.gotoFirstChild()) {
                    traverse(c);
                    c.gotoParent();
                }
            } while (c.gotoNextSibling());
        };

        traverse(cursor);
        return symbols;
    }

    private findIdentifier(node: SyntaxNode | null): SyntaxNode | null {
        if (!node) return null;
        if (node.type === 'identifier') return node;
        if (node.type === 'function_declarator') return this.findIdentifier(node.childForFieldName('declarator'));
        if (node.type === 'pointer_declarator') return this.findIdentifier(node.childForFieldName('declarator'));
        // Add more recursions as needed
        return node.children.find(c => c.type === 'identifier') || null;
    }

    public clearCache(dirPath: string) {
        const cachePath = path.join(dirPath, '.code-constellation', 'cache.json');
        try {
            if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
        } catch (e) {
            console.error('Failed to delete cache:', e);
        }
        this.symbolIndex.clear();
        this.callIndex.clear();
        this.calleeIndex.clear();
        this.nameIndex.clear();
        this.preprocessorIndex.clear();
    }

    public getCallees(funcName: string): string[] {
        const callees = this.calleeIndex.get(funcName);
        return callees ? Array.from(callees) : [];
    }

    public findSymbolByName(name: string): { symbol: SymbolNode, file: string } | null {
        return this.nameIndex.get(name) ?? null;
    }

    private bfsPath(from: string, to: string, maxDepth = 20): string[] | null {
        if (from === to) return [from];
        const visited = new Set<string>();
        // Queue entries: [currentName, pathSoFar]
        const queue: [string, string[]][] = [[from, [from]]];
        visited.add(from);
        while (queue.length > 0) {
            if (visited.size > 50_000) return null;
            const [current, pathSoFar] = queue.shift()!;
            if (pathSoFar.length > maxDepth) continue;
            const callees = this.calleeIndex.get(current);
            if (!callees) continue;
            for (const callee of callees) {
                if (callee === to) return [...pathSoFar, callee];
                if (!visited.has(callee)) {
                    visited.add(callee);
                    queue.push([callee, [...pathSoFar, callee]]);
                }
            }
        }
        return null;
    }

    public findCallPath(from: string, to: string): CallPathStep[] | null {
        const namePath = this.bfsPath(from, to);
        if (!namePath) return null;
        return namePath.map((name, idx) => {
            const symResult = this.findSymbolByName(name);
            const step: CallPathStep = {
                name,
                file: symResult?.file ?? '',
                line: symResult?.symbol.location.start.row ?? 0,
            };
            if (idx > 0) {
                const prevName = namePath[idx - 1];
                const callers = this.callIndex.get(name);
                const site = callers?.find(c => c.caller === prevName);
                if (site) {
                    step.callSite = {
                        file: site.file,
                        line: site.start.row,
                        snippet: site.snippet,
                    };
                }
            }
            return step;
        });
    }
}

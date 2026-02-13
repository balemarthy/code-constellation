import * as fs from 'fs';
import * as path from 'path';
import { Parser, Language, Node as SyntaxNode, TreeCursor } from 'web-tree-sitter';

// Map extensions to language names
const EXTENSION_MAP: Record<string, string> = {
    '.c': 'c',
    '.h': 'c', // Simplified
    '.cpp': 'cpp',
    '.hpp': 'cpp',
    '.cc': 'cpp',
    '.rs': 'rust',
    '.py': 'python',
};

export interface SymbolNode {
    name: string;
    type: 'function' | 'struct' | 'enum' | 'variable';
    location: {
        file: string;
        start: { row: number; column: number };
        end: { row: number; column: number };
    };
    children?: SymbolNode[];
}

export class Analyzer {
    private parser: Parser | null = null;
    private languages: Record<string, Language> = {};
    private wasmPath: string;
    private symbolIndex: Map<string, SymbolNode[]> = new Map(); // file -> symbols
    private callIndex: Map<string, { file: string, start: { row: number, column: number }, caller: string }[]> = new Map(); // funcName -> callSites
    private calleeIndex: Map<string, Set<string>> = new Map(); // callerName -> Set<calleeName>


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
        this.loadProjectConfig(dirPath); // Load config first
        const cachePath = path.join(dirPath, '.code-constellation', 'cache.json');


        // Try to load from cache
        if (this.loadCache(cachePath)) {
            console.log('Loaded from cache:', cachePath);
            const result: Record<string, SymbolNode[]> = {};
            for (const [file, symbols] of this.symbolIndex.entries()) {
                result[file] = symbols;
            }
            return result;
        }

        const files: string[] = [];
        this.getFilesRecursively(dirPath, files);

        // Initialize parser if not already
        if (!this.parser) {
            await this.init();
        }

        for (const file of files) {
            try {
                await this.analyzeFile(file);
            } catch (e) {
                console.error(`Failed to analyze ${file}:`, e);
            }
        }

        // Save to cache
        this.saveCache(cachePath);

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
                if (EXTENSION_MAP[path.extname(fullPath)]) {
                    fileList.push(fullPath);
                }
            }
        }
    }

    private saveCache(cachePath: string) {
        try {
            const cacheDir = path.dirname(cachePath);
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }

            const data = {
                symbolIndex: Array.from(this.symbolIndex.entries()),
                callIndex: Array.from(this.callIndex.entries()),
                calleeIndex: Array.from(this.calleeIndex.entries()).map(([k, v]) => [k, Array.from(v)]) // Set to Array
            };

            fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('Failed to save cache:', e);
        }
    }

    private loadCache(cachePath: string): boolean {
        try {
            if (!fs.existsSync(cachePath)) {
                return false;
            }

            const raw = fs.readFileSync(cachePath, 'utf8');
            const data = JSON.parse(raw);

            // Restore Maps and Sets
            this.symbolIndex = new Map(data.symbolIndex);
            this.callIndex = new Map(data.callIndex);

            // Restore Set for calleeIndex
            this.calleeIndex = new Map();
            if (data.calleeIndex) {
                for (const [key, value] of data.calleeIndex) {
                    this.calleeIndex.set(key, new Set(value as string[]));
                }
            }

            return true;
        } catch (e) {
            console.error('Failed to load cache:', e);
            return false;
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

        const ext = path.extname(filePath);
        const langName = EXTENSION_MAP[ext];
        if (!langName) return [];

        const lang = await this.loadLanguage(langName);
        this.parser!.setLanguage(lang);

        const source = fs.readFileSync(filePath, 'utf8');
        const tree = this.parser!.parse(source);
        if (!tree) return [];

        const symbols = this.extractSymbols(tree.rootNode, filePath, langName);
        this.symbolIndex.set(filePath, symbols);

        // Index calls
        this.indexCalls(tree.rootNode, filePath, langName);

        return symbols;
    }

    private indexCalls(node: SyntaxNode, filePath: string, lang: string) {
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

                        // Index Caller (Inverse)
                        if (!this.callIndex.has(functionName)) {
                            this.callIndex.set(functionName, []);
                        }
                        this.callIndex.get(functionName)!.push({
                            file: filePath,
                            start: n.startPosition,
                            caller
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

    getCallees(_filePath: string, functionName: string): string[] {
        // We currently ignore filePath for the look up as our index is name-based (simplified)
        const callees = this.calleeIndex.get(functionName);
        return callees ? Array.from(callees) : [];
    }


    async getInactiveRanges(filePath: string): Promise<{ start: number, end: number }[]> {
        if (!this.parser) await this.init();

        const ext = path.extname(filePath);
        const langName = EXTENSION_MAP[ext];
        if (!langName || (langName !== 'c' && langName !== 'cpp')) return []; // Only C/C++ usually use preprocessor in this way

        const lang = await this.loadLanguage(langName);
        this.parser!.setLanguage(lang);
        const source = fs.readFileSync(filePath, 'utf8');
        const tree = this.parser!.parse(source);
        if (!tree) return [];

        const inactiveRanges: { start: number, end: number }[] = [];

        const cursor = tree.rootNode.walk();

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
}

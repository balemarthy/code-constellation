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

export interface CallSite {
    file: string;
    start: { row: number; column: number };
    caller: string;
}

declare global {
    interface Window {
        api: {
            openDirectoryDialog: () => Promise<string>;
            scanDirectory: (path: string) => Promise<Record<string, SymbolNode[]>>;
            getCallers: (funcName: string) => Promise<CallSite[]>;
            getCallees: (funcName: string) => Promise<string[]>;
            getInactiveRanges: (filePath: string) => Promise<{ start: number; end: number }[]>;

            readFile: (path: string) => Promise<string>;

            saveNotes: (rootDir: string, notes: Record<string, string>) => Promise<void>;
            getNotes: (rootDir: string) => Promise<Record<string, string>>;
            saveSession: (rootDir: string, session: any) => Promise<void>;
            getSession: (rootDir: string) => Promise<any>;


        };
    }
}

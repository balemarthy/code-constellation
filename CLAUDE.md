# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Run in development mode (Electron + Vite hot reload)
npm run dev

# Build distributable (TypeScript compile → Vite bundle → electron-builder package)
npm run build

# Lint TypeScript/TSX files (zero warnings policy)
npm run lint
```

There are no test commands; the project has no test suite.

## Architecture

Code Constellation is an **Electron + React + TypeScript** desktop app. The build pipeline uses **Vite** with `vite-plugin-electron`, which compiles both the Electron main process and the React renderer in one pass.

### Process Boundary

All file system access and code analysis runs in the **Electron main process**. The renderer (React UI) communicates exclusively via IPC using a typed `window.api` bridge.

- **`electron/main.ts`** — Creates the `BrowserWindow`, instantiates `Analyzer`, and registers all `ipcMain.handle` channels.
- **`electron/preload.ts`** — Exposes `window.api` to the renderer via `contextBridge`. This is the complete contract between renderer and main.
- **`electron/analyzer.ts`** — The `Analyzer` class: parses source files with `web-tree-sitter`, builds the symbol/call indexes, handles project config detection, manages the on-disk cache.
- **`src/types.ts`** — Shared TypeScript types (`SymbolNode`, `CallSite`) and the `Window.api` interface declaration that must stay in sync with `preload.ts`.

### Analyzer Internals (`electron/analyzer.ts`)

The `Analyzer` maintains three in-memory indexes built from AST traversal:

| Index | Type | Purpose |
|---|---|---|
| `symbolIndex` | `Map<filePath, SymbolNode[]>` | All extracted symbols per file |
| `callIndex` | `Map<calleeName, CallSite[]>` | Reverse lookup: who calls a given function |
| `calleeIndex` | `Map<callerName, Set<calleeName>>` | Forward lookup: what a function calls |

On `scanDirectory`, the analyzer first checks for a cache at `<projectRoot>/.code-constellation/cache.json`. If valid, it skips re-parsing. Otherwise it walks all `.c/.h/.cpp/.hpp/.cc/.rs/.py` files (skipping `node_modules`, `.git`, `.code-constellation`), parses each with the appropriate Tree-sitter WASM grammar, then saves the cache.

The WASM grammar files (`tree-sitter-c.wasm`, `tree-sitter-cpp.wasm`, `tree-sitter-rust.wasm`, `tree-sitter-python.wasm`, `web-tree-sitter.wasm`) live in `public/` and are served from `process.env.VITE_PUBLIC` at runtime.

**To invalidate the cache during development:** delete `<projectRoot>/.code-constellation/cache.json`.

### React UI (`src/`)

`App.tsx` is the root component that owns all shared state: `rootDir`, `symbols`, `activeFile`, `activeSymbol`, navigation history, and resizable panel dimensions. It autosaves layout state to `<projectRoot>/.code-constellation/session.json` after a 2-second debounce.

Four child components:
- **`FileTree`** — Left sidebar tree of files → symbols.
- **`GraphView`** — Center panel; uses **ReactFlow** to render a 3-tier constellation (callers above → selected function → callees below). Wraps in `ReactFlowProvider` in `App.tsx`.
- **`CodeViewer`** — Right panel; plain line-by-line source renderer. Dims inactive `#ifdef` blocks using row ranges returned from `getInactiveRanges`. Highlights the selected symbol's start line.
- **`NotesPanel`** — Bottom-right; per-context (file or symbol name) freeform notes saved to `<projectRoot>/.code-constellation/notes.json`. Supports PDF export via **jsPDF**.

### Persisted Data (inside the scanned project directory)

All persistence files are written inside the user's **opened project**, not the app directory:

```
<project-root>/
  .code-constellation/
    cache.json      # AST parse cache (symbolIndex + callIndex + calleeIndex)
    session.json    # UI state (activeFile, panel widths)
    notes.json      # Learning journal (context → text map)
```

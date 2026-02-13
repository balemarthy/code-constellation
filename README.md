# Code Constellation 🌌
Visualize code relationships across C, C++, Rust, and Python codebases with high performance and context-aware insights.
Code Constellation helps developers navigate large, complex embedded projects (like FreeRTOS or Zephyr) by providing a dynamic "constellation" view of function calls and definitions, alongside a context-aware learning journal.
## ✨ Key Features
- **🚀 Smart Caching**: Near-instant project re-scans using AST-based indexing.
- **🛰️ Constellation Graph**: Interactive 2D visualization of callers and callees.
- **📓 Learning Journal**: Attach manual notes to symbols or files to document your investigation.
- **📏 Contextual Highlighting**: Automatically identifies and dims inactive code blocks based on project configuration (FreeRTOSConfig.h, Kconfig, etc.).
- **💾 Session Persistence**: Remembers your layout, active files, and symbols across restarts.
## 📥 Installation
### Download the App
You can download the latest Windows installer here:
[Download Code Constellation Setup (v1.0.0)](https://github.com/balemarthy/code-constellation/releases/download/v1.0.0/Code.Constellation-Windows-1.0.0-Setup.exe)
> [!NOTE]
> If you have the `setup.exe` in the root of the repo, you can simply run it to install. 
## 🛠️ How to Use
1. **Open a Project**: Click "Open Folder" and select the root directory of your codebase.
2. **Explore Symbols**: Use the left sidebar to navigate files. Expand files to see functions and structs.
3. **Visualize Relationships**: Click on a function name to center it in the graph.
    - **Nodes Above**: Functions that call the selected symbol.
    - **Nodes Below**: Functions called by the selected symbol.
4. **Take Notes**: Use the bottom-right panel to write notes for the current file or symbol.
5. **View Code**: The center panel shows the source code with line highlighting for the selected symbol.
## 👩‍💻 For Developers
### Prerequisites
- Node.js (v18+)
- npm
### Setup
```bash
# Install dependencies
npm install
# Run in development mode
npm run dev
# Build the distribution
npm run build
```
---
Built with Electron, React, TypeScript, and Tree-sitter.

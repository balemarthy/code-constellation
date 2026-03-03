# Code Constellation — Market Brief

## Problem

Developers working on large embedded codebases (FreeRTOS, Zephyr, Linux kernel,
legacy C/C++ projects) spend a disproportionate amount of time answering one
question: **"How does execution reach this function?"** The tools available today
force them to either grep through thousands of files or click through a call graph
hop by hop. Neither scales.

## Target Users

- **Embedded/systems engineers** onboarding onto codebases they didn't write
- **Firmware reviewers** tracing security-critical call paths
- **Open-source contributors** navigating unfamiliar RTOS internals
- **Senior engineers** doing architecture reviews or planning refactors

## Product Tiers

| Tier | Price | Core value |
|------|-------|------------|
| **Free — Local** | $0 | Full offline analysis: constellation graph, call path finder, syntax highlighting, learning journal. No data leaves the machine. |
| **Pro — AI** | ~$15 / month | AI-powered function summarizer: one click auto-populates the notes panel with a plain-English explanation of what a function does, using the user's own Claude API key. |
| **Team** | ~$49 / month / team | Shared annotations: notes and highlights sync across the team. Colour-coded by author on the graph. Useful for code review hand-offs and onboarding. |

## Key Differentiators

1. **Works fully offline** — the free tier never phones home. This is the main
   trust signal for enterprise/embedded shops with strict data policies.
2. **Language-native parsing** — uses Tree-sitter WASM grammars, not regex hacks.
   Handles real C/C++ preprocessor blocks, Rust, Python.
3. **Learning journal built in** — notes are scoped per-symbol and per-file,
   stored inside the project repo (`.code-constellation/notes.json`), so they
   travel with the codebase in version control.
4. **Call path finder** — BFS from any function to any other function in one
   query, with exact call-site code lines at each hop. No competing desktop tool
   for C/C++ does this today.

## Roadmap (priority order)

1. **AI function summarizer** (unlocks Pro tier)
   - User supplies their own Claude API key (their cost, our margin = zero infra)
   - Right-click a node or press a button in the notes panel
   - Reads function source + callees' sources → sends to Claude API
   - Auto-populates the current note
   - API key stored in `<project>/.code-constellation/settings.json` or
     Electron's `app.getPath('userData')`

2. **Team shared annotations** (unlocks Team tier)
   - Notes synced to a shared backend (e.g. a simple key-value store per project)
   - Author colour shown on graph nodes
   - Conflict resolution: last-write-wins with timestamp

3. **Cross-reference export** — export the full call graph as a DOT/Mermaid
   diagram for inclusion in design documents

4. **VSCode extension** — renderer-only version of the constellation graph as a
   VSCode panel (same IPC contract, different host)

## Why Now

- Embedded software teams are growing faster than good tooling
- LLM-assisted code understanding is now viable but requires accurate call graphs
  to give the model the right context — Code Constellation provides exactly that
- Electron + Tree-sitter means the entire analysis stack is cross-platform and
  ships as a single installer, no server required

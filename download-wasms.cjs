const fs = require('fs');
const path = require('path');

const languages = [
    { name: 'tree-sitter-c', url: 'https://unpkg.com/tree-sitter-c@latest/tree-sitter-c.wasm' },
    { name: 'tree-sitter-cpp', url: 'https://unpkg.com/tree-sitter-cpp@latest/tree-sitter-cpp.wasm' },
    { name: 'tree-sitter-rust', url: 'https://unpkg.com/tree-sitter-rust@latest/tree-sitter-rust.wasm' },
    { name: 'tree-sitter-python', url: 'https://unpkg.com/tree-sitter-python@latest/tree-sitter-python.wasm' },
];

const outputDir = path.join(__dirname, 'public');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Also copy tree-sitter.wasm from node_modules if available
const webTreeSitterPath = path.join(__dirname, 'node_modules/web-tree-sitter/tree-sitter.wasm');
if (fs.existsSync(webTreeSitterPath)) {
    fs.copyFileSync(webTreeSitterPath, path.join(outputDir, 'tree-sitter.wasm'));
    console.log('Copied tree-sitter.wasm from node_modules');
} else {
    console.log('tree-sitter.wasm not found in node_modules, downloading...');
    languages.push({ name: 'tree-sitter', url: 'https://cdn.jsdelivr.net/npm/web-tree-sitter@0.22.6/tree-sitter.wasm' });
}

async function downloadFile(url, outputPath) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
            return;
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(outputPath, buffer);
        console.log(`Downloaded ${path.basename(outputPath)}`);
    } catch (error) {
        console.error(`Error downloading ${url}:`, error);
    }
}

(async () => {
    for (const lang of languages) {
        await downloadFile(lang.url, path.join(outputDir, `${lang.name}.wasm`));
    }
})();

#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');
const includeDirs = ['public/js', 'server'];
const jsFiles = [];

function collectJsFiles(dirPath) {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git') {
            continue;
        }
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            collectJsFiles(fullPath);
            continue;
        }
        if (entry.isFile() && fullPath.endsWith('.js')) {
            jsFiles.push(fullPath);
        }
    }
}

for (const relativeDir of includeDirs) {
    collectJsFiles(path.join(rootDir, relativeDir));
}

jsFiles.sort();

let failed = false;

for (const filePath of jsFiles) {
    const result = spawnSync(process.execPath, ['--check', filePath], {
        cwd: rootDir,
        stdio: 'inherit',
    });
    if (result.status !== 0) {
        failed = true;
    }
}

if (failed) {
    process.exit(1);
}

console.log(`Syntax check passed for ${jsFiles.length} JavaScript files.`);

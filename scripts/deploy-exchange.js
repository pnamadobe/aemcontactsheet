#!/usr/bin/env node
// Selects the Adobe Plugin Developers (`393012`) workspace JSON (`aemcontactsheets-393012-Production.json`
// or `aemcontactsheets-393012-Stage.json`), builds & verifies the clean Exchange bundle, and deploys.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const preloadPath = path.join(__dirname, 'use-ow-basic-auth.cjs');

const envArg = process.argv[2] === 'stage' ? 'Stage' : 'Production';
const extraArgs = process.argv[2] === 'stage' || process.argv[2] === 'prod' ? process.argv.slice(3) : process.argv.slice(2);
const workspaceJson = path.join(rootDir, `aemcontactsheets-393012-${envArg}.json`);

if (fs.existsSync(workspaceJson)) {
  console.log(`🔹 Selecting Adobe Exchange workspace: aemcontactsheets-393012-${envArg}.json (Adobe Plugin Developers)…`);
  const useRes = spawnSync('npx', ['aio', 'app', 'use', workspaceJson, '--merge', '--no-input'], {
    cwd: rootDir,
    stdio: 'inherit',
  });
  if (useRes.status !== 0) process.exit(useRes.status ?? 1);
}

const buildRes = spawnSync('npm', ['run', 'build:exchange'], {
  cwd: rootDir,
  stdio: 'inherit',
});
if (buildRes.status !== 0) process.exit(buildRes.status ?? 1);

// Ensure all actions deploy cleanly to the selected target namespace
fs.rmSync(path.join(rootDir, 'dist', 'last-deployed-actions.json'), { force: true });

const defaultFlags = extraArgs.length > 0 ? extraArgs : ['--no-publish', '--no-log-forwarding-update'];
const deployRes = spawnSync('npx', ['aio', 'app', 'deploy', '--no-build', ...defaultFlags], {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${preloadPath}`.trim(),
  },
});
process.exit(deployRes.status ?? 1);

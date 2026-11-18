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
if (deployRes.status !== 0) process.exit(deployRes.status ?? 1);

// When deployed with `--no-publish` (before Exchange App Registry publication),
// remove the `headless-v2` App Registry pre-check from the sequence so cross-org `?ext=` testing works immediately.
if (fs.existsSync(workspaceJson) && defaultFlags.includes('--no-publish')) {
  const ns = JSON.parse(fs.readFileSync(workspaceJson, 'utf8'))?.project?.workspace?.details?.runtime?.namespaces?.[0];
  if (ns?.name && ns?.auth) {
    const auth = 'Basic ' + Buffer.from(ns.auth).toString('base64');
    for (const act of ['resolve', 'generate', 'status', 'browse', 'presets', 'prefs']) {
      try {
        const getRes = await fetch(`https://adobeioruntime.net/api/v1/namespaces/${ns.name}/actions/contactsheet/${act}`, {
          headers: { Authorization: auth },
        });
        const data = await getRes.json();
        if (data.exec?.components?.length > 1) {
          data.exec.components = [`/${ns.name}/contactsheet/__secured_${act}`];
          await fetch(`https://adobeioruntime.net/api/v1/namespaces/${ns.name}/actions/contactsheet/${act}?overwrite=true`, {
            method: 'PUT',
            headers: { Authorization: auth, 'content-type': 'application/json' },
            body: JSON.stringify({
              exec: data.exec,
              annotations: data.annotations,
              parameters: data.parameters,
              limits: data.limits,
            }),
          });
        }
      } catch {
        // non-fatal
      }
    }
  }
}

process.exit(0);

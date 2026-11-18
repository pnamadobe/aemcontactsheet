#!/usr/bin/env node
// Runs an `aio app` command (e.g. `build` or `deploy`) using `internal/app.config.demo.yaml`
// and `internal/ui/cloud-canvas-slot.js` (and selects `547DimSquid-767251-Production.json` on deploy),
// then restores the clean Exchange files afterward.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const mainConfigPath = path.join(rootDir, 'app.config.yaml');
const demoConfigPath = path.join(rootDir, 'internal', 'app.config.demo.yaml');
const mainSlotPath = path.join(rootDir, 'src', 'shared-ui', 'cloud-canvas-slot.js');
const demoSlotPath = path.join(rootDir, 'internal', 'ui', 'cloud-canvas-slot.js');
const rawArgs = process.argv.slice(2);
const envArg = rawArgs[1] === 'stage' ? 'Stage' : 'Production';
const args =
  rawArgs[1] === 'stage' || rawArgs[1] === 'prod'
    ? [rawArgs[0], ...rawArgs.slice(2)]
    : rawArgs;
const demoWorkspaceJson = path.join(rootDir, `547DimSquid-767251-${envArg}.json`);
const preloadPath = path.join(__dirname, 'use-ow-basic-auth.cjs');

if (args.length === 0) {
  console.error('Usage: node scripts/with-demo-config.js <build|deploy> [prod|stage] [...aio args]');
  process.exit(1);
}

const originalYaml = fs.readFileSync(mainConfigPath, 'utf8');
const demoYaml = fs.readFileSync(demoConfigPath, 'utf8');
const originalSlot = fs.readFileSync(mainSlotPath, 'utf8');
const demoSlot = fs.readFileSync(demoSlotPath, 'utf8');

let exitCode = 0;
try {
  if (args[0] === 'deploy' && fs.existsSync(demoWorkspaceJson)) {
    console.log(`🔹 Selecting internal demo workspace: 547DimSquid-767251-${envArg}.json (Adobe Internal Peter Nam)…`);
    spawnSync('npx', ['aio', 'app', 'use', demoWorkspaceJson, '--merge', '--no-input'], {
      cwd: rootDir,
      stdio: 'inherit',
    });
  }

  fs.writeFileSync(mainConfigPath, demoYaml, 'utf8');
  fs.writeFileSync(mainSlotPath, demoSlot, 'utf8');
  fs.rmSync(path.join(rootDir, '.parcel-cache'), { recursive: true, force: true });
  fs.rmSync(path.join(rootDir, 'dist'), { recursive: true, force: true });

  const effectiveArgs =
    args[0] === 'deploy' && args.length === 1
      ? ['deploy', '--no-publish', '--no-log-forwarding-update']
      : args;

  const res = spawnSync('npx', ['aio', 'app', ...effectiveArgs], {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${preloadPath}`.trim(),
    },
  });
  exitCode = res.status ?? 1;

  if (exitCode === 0 && args[0] === 'deploy' && fs.existsSync(demoWorkspaceJson)) {
    const ns = JSON.parse(fs.readFileSync(demoWorkspaceJson, 'utf8'))?.project?.workspace?.details?.runtime?.namespaces?.[0];
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
} finally {
  fs.writeFileSync(mainConfigPath, originalYaml, 'utf8');
  fs.writeFileSync(mainSlotPath, originalSlot, 'utf8');
}

process.exit(exitCode);

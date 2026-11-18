#!/usr/bin/env node
// Verifies that the Adobe Exchange build (`dist/`, `src/`, `actions/`, `packages/`, `app.config.yaml`)
// contains zero internal-only Firefly Boards / Adobe Express endpoints, API keys, or token-profile strings.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const FORBIDDEN_PATTERNS = [
  { pattern: 'aura_webapp', reason: 'Internal Firefly Boards web client ID' },
  { pattern: 'projectx_webapp', reason: 'Internal Adobe Express web client ID' },
  { pattern: 'hz-aura-doc-service', reason: 'Internal Firefly Boards document service endpoint' },
  { pattern: 'sensei.adobe.io/services/v2/predict', reason: 'Internal Sensei CPF HzJSON endpoint' },
  { pattern: 'senseicore', reason: 'Internal Sensei status polling endpoint' },
  { pattern: 'invitations.adobe.io', reason: 'Internal invitations/ACL sharing endpoint' },
  { pattern: 'adobe-copilot', reason: 'Internal Federated MCP gateway' },
  { pattern: 'boards_create_new_board', reason: 'Internal Firefly Boards MCP tool' },
  { pattern: 'cs_saved_boards_profiles', reason: 'Internal demo saved token profiles in localStorage' },
  { pattern: 'savedBoardsProfiles', reason: 'Internal demo saved token profiles in prefs' },
  { pattern: 'boardsBearerToken', reason: 'Internal demo Boards/Express token parameter' },
  { pattern: 'internal/actions', reason: 'Reference to internal-only action path' },
  { pattern: 'p59602-e520244', reason: 'Hardcoded internal demo AEM environment hostname' },
  { pattern: '767251-547dimsquid', reason: 'Hardcoded internal demo App Builder runtime namespace' },
];

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
    } else if (/\.(js|mjs|cjs|json|yaml|yml|html)$/i.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const filesToScan = [
  path.join(rootDir, 'app.config.yaml'),
  ...walkFiles(path.join(rootDir, 'src')),
  ...walkFiles(path.join(rootDir, 'actions')),
  ...walkFiles(path.join(rootDir, 'packages')),
  ...walkFiles(path.join(rootDir, 'dist')),
];

if (!fs.existsSync(path.join(rootDir, 'dist'))) {
  console.error('❌ dist/ directory not found. Run `npm run build:exchange` before `npm run check:exchange`.');
  process.exit(1);
}

const violations = [];
for (const filePath of filesToScan) {
  const rel = path.relative(rootDir, filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (content.includes(pattern)) {
      violations.push({ file: rel, pattern, reason });
    }
  }
}

if (violations.length > 0) {
  console.error('❌ Exchange Readiness Check FAILED — internal identifiers found in Exchange build/source:');
  for (const v of violations) {
    console.error(`  • ${v.file}: found "${v.pattern}" (${v.reason})`);
  }
  process.exit(1);
}

console.log(`✅ Exchange Readiness Check PASSED (${filesToScan.length} files scanned across app.config.yaml, src/, actions/, packages/, and dist/).`);

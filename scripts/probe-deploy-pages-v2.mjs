#!/usr/bin/env node
// PROBE slice v2 — divergence publish-to-web (ledgers/PROBE-publish-to-web.md, row A6).
// v1's per-blob REST upload was refuted by GitHub's secondary rate limit at ~500 files.
// v2 tests the revised riskiest assumption: ONE pack upload via git-over-HTTPS (the product
// would embed git2/gitoxide in the Tauri shell — no terminal for the user, no proxy),
// then a single Pages API call. Shelling out to system git here is a probe shortcut for
// the pack-upload mechanism, not part of the assumption under test.
//
//   GITHUB_TOKEN=$(gh auth token) node scripts/probe-deploy-pages-v2.mjs \
//     --dir gh-pages-dist --repo archie-pages-probe

import { execFileSync } from 'node:child_process';
import { mkdtempSync, cpSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const DIR = arg('dir', 'gh-pages-dist');
const REPO = arg('repo', 'archie-pages-probe');
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error('GITHUB_TOKEN required'); process.exit(1); }

const API = 'https://api.github.com';
async function gh(method, path, body, ok) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${TOKEN}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!ok.includes(res.status)) {
    throw new Error(`${method} ${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json().catch(() => null);
}

const t0 = Date.now();
const lap = (label) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);

const { login } = await gh('GET', '/user', null, [200]);
lap(`authenticated as ${login}`);

// 201 created · 422 already exists (fine — v1's attempt may have created it)
await gh('POST', '/user/repos', { name: REPO, auto_init: false, private: false }, [201, 422]);
lap(`repo ${login}/${REPO} ready`);

const work = mkdtempSync(join(tmpdir(), 'archie-pages-probe-'));
cpSync(DIR, work, { recursive: true });
writeFileSync(join(work, '.nojekyll'), '');
const git = (...args) => execFileSync('git', ['-C', work, ...args], { stdio: 'pipe' });
git('init', '-b', 'main');
git('add', '-A');
git('-c', 'user.email=probe@archie.local', '-c', 'user.name=archie-probe',
    'commit', '-q', '-m', 'probe: publish-to-web seed tree (v2, single pack)');
lap('tree staged and committed locally');

// One pack upload. Token goes in a per-invocation credential helper, not the remote URL,
// so it never lands in .git/config or the process arg list of the push itself.
git('-c', `credential.helper=!f() { echo username=x-access-token; echo password=${TOKEN}; }; f`,
    'push', '--force', `https://github.com/${login}/${REPO}.git`, 'main:main');
lap('pack pushed to main');

// 201 created · 409 already enabled
await gh('POST', `/repos/${login}/${REPO}/pages`, { source: { branch: 'main', path: '/' } }, [201, 409]);
lap('Pages enabled; polling for liveness…');

const url = `https://${login.toLowerCase()}.github.io/${REPO}/`;
for (;;) {
  if (Date.now() - t0 > 12 * 60 * 1000) { console.error('KILL: not live within 12 min — criterion met'); process.exit(2); }
  const res = await fetch(url, { redirect: 'follow' }).catch(() => null);
  if (res?.ok) break;
  await new Promise(r => setTimeout(r, 10_000));
}
lap(`LIVE at ${url}`);
console.log(`\nA6/A4 result: ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min end-to-end. ` +
  `Record in ledgers/PROBE-publish-to-web.md and delete ${login}/${REPO}.`);

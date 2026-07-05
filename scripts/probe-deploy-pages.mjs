#!/usr/bin/env node
// PROBE slice — divergence publish-to-web (ledgers/PROBE-publish-to-web.md, rows A2/A4).
// Times built-tree → live GitHub Pages URL using ONLY the REST API, the same calls the
// Studio flow (flag: archie.deployToPages) would make. Never merges; throwaway by design.
//
//   GITHUB_TOKEN=<fine-grained PAT> node scripts/probe-deploy-pages.mjs \
//     --dir gh-pages-dist --repo archie-pages-probe
//
// Kill criterion (fixed before this file existed): any terminal step required by the *product*
// flow, any proxy server, or >10 min to a live URL on the seed exhibit.

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, posix } from 'node:path';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const DIR = arg('dir', 'gh-pages-dist');
const REPO = arg('repo', 'archie-pages-probe');
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error('GITHUB_TOKEN required'); process.exit(1); }

const API = 'https://api.github.com';
async function gh(method, path, body, ok = [200, 201, 202, 204, 409]) {
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
  return res.status === 204 ? null : res.json();
}

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const t0 = Date.now();
const lap = (label) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);

const { login } = await gh('GET', '/user');
lap(`authenticated as ${login}`);

await gh('POST', '/user/repos', { name: REPO, auto_init: true, private: false });
lap(`repo ${login}/${REPO} ready`);
// auto_init needs a beat before the ref exists
let base;
for (let i = 0; i < 10; i++) {
  try { base = await gh('GET', `/repos/${login}/${REPO}/git/ref/heads/main`); break; }
  catch { await new Promise(r => setTimeout(r, 1500)); }
}
if (!base) throw new Error('main ref never appeared after auto_init');

const files = [];
for await (const f of walk(DIR)) files.push(f);
lap(`uploading ${files.length} blobs from ${DIR}/`);

const entries = [];
let done = 0;
const CONCURRENCY = 20;
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (files.length) {
    const f = files.pop();
    const content = (await readFile(f)).toString('base64');
    const { sha } = await gh('POST', `/repos/${login}/${REPO}/git/blobs`, { content, encoding: 'base64' });
    entries.push({ path: posix.join(...relative(DIR, f).split(/[\\/]/)), mode: '100644', type: 'blob', sha });
    if (++done % 100 === 0) lap(`  ${done} blobs`);
  }
}));
// Pages must not run Jekyll over the tree
const noj = await gh('POST', `/repos/${login}/${REPO}/git/blobs`, { content: '', encoding: 'utf-8' });
entries.push({ path: '.nojekyll', mode: '100644', type: 'blob', sha: noj.sha });
lap(`${entries.length} blobs uploaded`);

const tree = await gh('POST', `/repos/${login}/${REPO}/git/trees`, { tree: entries });
const commit = await gh('POST', `/repos/${login}/${REPO}/git/commits`, {
  message: 'probe: publish-to-web seed tree', tree: tree.sha, parents: [base.object.sha],
});
await gh('PATCH', `/repos/${login}/${REPO}/git/refs/heads/main`, { sha: commit.sha, force: true });
lap('tree committed to main');

await gh('POST', `/repos/${login}/${REPO}/pages`, { source: { branch: 'main', path: '/' } });
lap('Pages enabled; polling for liveness…');

const url = `https://${login.toLowerCase()}.github.io/${REPO}/`;
for (;;) {
  if (Date.now() - t0 > 12 * 60 * 1000) { console.error(`KILL: not live within 12 min — criterion met`); process.exit(2); }
  const res = await fetch(url, { redirect: 'follow' }).catch(() => null);
  if (res?.ok) break;
  await new Promise(r => setTimeout(r, 10_000));
}
lap(`LIVE at ${url}`);
console.log(`\nA2/A4 result: ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min end-to-end. ` +
  `Record in ledgers/PROBE-publish-to-web.md and delete ${login}/${REPO}.`);

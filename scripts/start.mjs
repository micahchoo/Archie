#!/usr/bin/env node
// Friendly launcher for Archie. No dependencies — runs with plain Node.
//
// Usage:
//   node scripts/start.mjs            interactive menu
//   node scripts/start.mjs studio     start the Studio (authoring)
//   node scripts/start.mjs viewer     start the Viewer (reading)
//   node scripts/start.mjs both       start both
//   node scripts/start.mjs install    install dependencies only
//
// Non-technical users normally reach this through start.sh / start.command /
// start.cmd in the repo root — those just check Node exists and call here.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IS_WIN = process.platform === 'win32';
const MIN_NODE_MAJOR = 22;

const APPS = {
  studio: {
    title: 'Studio (authoring)',
    filter: '@archie/studio',
    expectedUrl: 'http://localhost:5174/studio/',
    tag: '\x1b[35m[Studio]\x1b[0m',
  },
  viewer: {
    title: 'Viewer (reading)',
    filter: '@archie/viewer',
    expectedUrl: 'http://localhost:4321/',
    tag: '\x1b[36m[Viewer]\x1b[0m',
  },
};

// "both" runs the SINGLE-ORIGIN stack (Q-3): Studio + Viewer behind one front-door proxy at
// FRONT_DOOR, mirroring the deployed layout. Same origin is what lets the Viewer show exhibits
// you author in the Studio live (shared browser storage) — two separate ports cannot do that.
const FRONT_DOOR = 'http://localhost:5173';

main().catch((err) => {
  console.error(`\n  Something went wrong: ${err.message}\n`);
  process.exit(1);
});

async function main() {
  banner();
  checkNodeVersion();
  const pnpm = resolvePnpm();

  const choice = process.argv[2] || (await askChoice());
  if (choice === 'help' || choice === '--help' || choice === '-h') {
    printHelp();
    return;
  }
  if (!['studio', 'viewer', 'both', 'install'].includes(choice)) {
    console.error(`  Unknown option "${choice}".`);
    printHelp();
    process.exit(1);
  }

  ensureInstalled(pnpm, choice === 'install');
  if (choice === 'install') {
    console.log('\n  Done. Run this script again to start an app.\n');
    return;
  }

  const children = [];
  if (choice === 'both') {
    console.log('\n  Starting Studio + Viewer behind one front door (single origin) —');
    console.log(`  exhibits you author in the Studio appear in the Viewer with a "Local" badge.`);
    console.log(`    Studio: ${FRONT_DOOR}/studio/    Viewer: ${FRONT_DOOR}/viewer/`);
    // Open the browser at the FRONT DOOR when the Studio is ready (not at the bare app ports —
    // separate origins don't share the working store, the trap this stack exists to avoid).
    children.push(startApp(pnpm, 'studio', { openUrl: `${FRONT_DOOR}/studio/` }));
    // SITE_BASE makes Astro serve under /viewer/ so the front door's path routing lines up
    // (scripts/dev.sh sets the same; without it the proxy 404s every /viewer/ request).
    children.push(startApp(pnpm, 'viewer', { openUrl: null, env: { SITE_BASE: '/viewer/' } }));
    children.push(startFrontDoor());
  } else {
    children.push(startApp(pnpm, choice));
  }

  const shutdown = () => {
    console.log('\n  Stopping...');
    for (const child of children) killTree(child);
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('\n  Press Ctrl+C to stop.\n');
}

function banner() {
  console.log('\n  Archie launcher');
  console.log('  ---------------');
}

function printHelp() {
  console.log(`
  Usage: node scripts/start.mjs [studio|viewer|both|install]

    studio    start the Studio (authoring app)   -> ${APPS.studio.expectedUrl}
    viewer    start the Viewer (published site)  -> ${APPS.viewer.expectedUrl}
    both      start both behind ONE front door   -> ${FRONT_DOOR}/studio/ + ${FRONT_DOOR}/viewer/
              (single origin: exhibits you author appear in the Viewer live, no publish step)
    install   install dependencies and exit

  With no argument, an interactive menu is shown.
`);
}

function checkNodeVersion() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major >= MIN_NODE_MAJOR) return;
  console.error(`
  Your Node.js version is ${process.versions.node}, but Archie needs ${MIN_NODE_MAJOR} or newer.

  How to fix:
    1. Go to https://nodejs.org and download the LTS installer (or use
       your version manager: "nvm install 22" / "fnm use 22").
    2. Install it, close this window, and run the start script again.
`);
  process.exit(1);
}

// Find a way to run pnpm: directly, via corepack, or via npx as a last resort.
function resolvePnpm() {
  if (commandWorks('pnpm', ['--version'])) return ['pnpm'];
  if (commandWorks('corepack', ['--version'])) {
    console.log('  pnpm not found — using the one bundled with Node (corepack).');
    return ['corepack', 'pnpm'];
  }
  console.log('  pnpm not found — fetching it via npx (first run may take a minute).');
  return ['npx', '--yes', 'pnpm@10'];
}

function commandWorks(cmd, args) {
  const result = spawnSync(cmd, args, { shell: IS_WIN, stdio: 'ignore' });
  return result.status === 0;
}

function ensureInstalled(pnpm, force) {
  const installed =
    existsSync(path.join(ROOT, 'node_modules')) &&
    existsSync(path.join(ROOT, 'apps', 'studio', 'node_modules')) &&
    existsSync(path.join(ROOT, 'apps', 'viewer', 'node_modules'));
  if (installed && !force) return;

  console.log('\n  Installing dependencies (one-time, a few minutes on first run)...\n');
  const result = spawnSync(pnpm[0], [...pnpm.slice(1), 'install'], {
    cwd: ROOT,
    shell: IS_WIN,
    stdio: 'inherit',
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
  });
  if (result.status !== 0) {
    throw new Error('dependency install failed — see the output above.');
  }
}

function startApp(pnpm, key, opts = {}) {
  const app = APPS[key];
  const willOpen = opts.openUrl !== null;
  console.log(`\n  Starting ${app.title}...${willOpen ? ' it will open in your browser when ready.' : ''}`);

  const child = spawn(pnpm[0], [...pnpm.slice(1), '--filter', app.filter, 'dev'], {
    cwd: ROOT,
    shell: IS_WIN,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', ...(opts.env ?? {}) },
  });

  // Echo server output under a tag, and open the browser on the first
  // "Local: http://localhost:NNNN" line (the port can shift if busy).
  let opened = false;
  const onData = (data) => {
    const text = data.toString();
    for (const line of text.split('\n')) {
      if (line.trim()) console.log(`  ${app.tag} ${line.trimEnd()}`);
    }
    if (!opened) {
      const match = stripAnsi(text).match(/Local[:\s]+(https?:\/\/[\w.-]+:\d+\/?)/);
      if (match) {
        opened = true;
        if (opts.openUrl !== null) {
          const url = opts.openUrl ?? match[1];
          console.log(`\n  ${app.title} is ready: ${url}\n`);
          openBrowser(url);
        } else {
          console.log(`\n  ${app.title} is ready.\n`);
        }
      }
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`\n  ${app.title} stopped unexpectedly (exit code ${code}).`);
    }
  });

  return child;
}

// The single-origin front door (scripts/dev-proxy.mjs): /studio* → :5174, everything else → :4321.
function startFrontDoor() {
  const tag = '\x1b[33m[Door]\x1b[0m';
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'dev-proxy.mjs')], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const onData = (data) => {
    for (const line of data.toString().split('\n')) {
      if (line.trim()) console.log(`  ${tag} ${line.trimEnd()}`);
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`\n  Front door stopped unexpectedly (exit code ${code}).`);
    }
  });
  return child;
}

function openBrowser(url) {
  const [cmd, args] = IS_WIN
    ? ['cmd', ['/c', 'start', '""', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    console.log(`  (Could not open a browser automatically — visit ${url} yourself.)`);
  }
}

function killTree(child) {
  if (!child || child.killed) return;
  if (IS_WIN) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGINT');
  }
}

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function askChoice() {
  console.log(`
  What would you like to do?

    1) Start the Studio (create and edit exhibits)     ${APPS.studio.expectedUrl}
    2) Start the Viewer (browse the published site)    ${APPS.viewer.expectedUrl}
    3) Start both — one address (${FRONT_DOOR}); what you author shows in the Viewer live
    4) Install dependencies only
    q) Quit
`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question('  Pick an option [1]: ', (answer) => {
      rl.close();
      const map = { '': 'studio', 1: 'studio', 2: 'viewer', 3: 'both', 4: 'install' };
      const choice = map[answer.trim()];
      if (choice) return resolve(choice);
      if (answer.trim().toLowerCase() === 'q') {
        console.log('  Bye!');
        process.exit(0);
      }
      resolve(answer.trim());
    });
  });
}

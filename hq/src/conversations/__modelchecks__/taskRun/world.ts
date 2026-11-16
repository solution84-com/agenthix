/**
 * The task runs' world (W7, W12–W14 of the live preview walk): a shop app in a code workspace, its task on a branch,
 * and the branch's live preview, open with the shop running or not open at all. Fixed, so every run meets the same
 * answers.
 */
import type { RunCodeWork, RunOpenLivePreview } from '@agenthix/core'

export const SHOP_TASK = {
  id: '5d1c7a40-8b2e-4f63-a9d1-2c4e6b8f0a17',
  key: 'SHOP-7',
  title: 'Free delivery over $50',
  description: 'Add a banner to the shop\'s home page saying deliveries over $50 are free.',
}

/** The shop's project and its agent, as list_projects and list_agents answer them. */
export const SHOP_PROJECT = { id: 'project-shop', key: 'SHOP', name: 'Shop' }
export const KERNEL = { id: 'agent-kernel', handle: 'kernel', name: 'Kernel' }

/** Another task of the project, with Kernel as its agent and no run yet. */
export const NEXT_TASK = {
  id: '9a2e4c61-3f7b-4d18-b6c0-5e1a8d2f7b39',
  key: 'SHOP-8',
  title: 'Free delivery email',
  description: 'Tell customers on the mailing list about free delivery over $50.',
}

/** A routine of the project: every weekday at 9:00, Kernel reviews the shop's open orders. */
export const MORNING_ROUTINE = { id: 'rt-morning', title: 'Morning review', cron: '0 9 * * 1-5', timezone: 'Europe/London' }

export const WORKING_FOLDER = '/projects/shop/clones/7a1f'
export const PAGE = 'public/index.html'

export const PAGE_TEXT = [
  '<!doctype html>',
  '<html><head><title>Fernhill Shop</title>',
  '<style>.banner { background: #2e7d32; color: white; padding: 8px; }</style></head>',
  '<body>',
  '  <div class="banner">Free delivery over $50</div>',
  '  <h1>Fernhill Shop</h1>',
  '  <ul id="products"><li>Oak chopping board, $45</li><li>Wool blanket, $60</li></ul>',
  '</body></html>',
].join('\n')

export const PACKAGE_JSON = JSON.stringify({ name: 'shop', version: '1.0.0', scripts: { start: 'node server.js' } }, null, 2)

export const SERVER_JS = [
  "const http = require('node:http')",
  "const fs = require('node:fs')",
  "http.createServer((req, res) => res.end(fs.readFileSync(__dirname + '/public/index.html'))).listen(3000)",
].join('\n')

/** The page on main: the branch's last commit added the banner. */
export const MAIN_PAGE_TEXT = PAGE_TEXT.split('\n').filter(l => !l.includes('class="banner"')).join('\n')
export const MAIN_FOLDER = '/projects/shop/main'

/**
 * The branch's files at the start of every run, by their path in the working folder, and main's, read-only, by their
 * full path.
 */
/** The project's roadmap, as hq seeds every project's files with it (storage/filesService.ts). */
export const ROADMAP = '/projects/shop/files/ROADMAP.md'
const ROADMAP_TEXT = [
  '# Shop — Roadmap', '', '## Mission / Vision', '', '_Describe the project goal and success criteria here._', '',
  '## Current Week', '', '_No activity yet._', '', '## Previous Weeks', '', '_None yet._',
].join('\n')

export const FILES: Readonly<Record<string, string>> = {
  [PAGE]: PAGE_TEXT, 'package.json': PACKAGE_JSON, 'server.js': SERVER_JS, [ROADMAP]: ROADMAP_TEXT,
  [`${MAIN_FOLDER}/${PAGE}`]: MAIN_PAGE_TEXT, [`${MAIN_FOLDER}/package.json`]: PACKAGE_JSON, [`${MAIN_FOLDER}/server.js`]: SERVER_JS,
}

export const SHOP_APP = { name: 'shop', folder: '', command: 'npm start', port: 3000 }

export const RUNNING: RunOpenLivePreview = { paused: false, runningApps: [SHOP_APP.name] }

export function codeWork(openLivePreview: RunOpenLivePreview | null, behindMain = 0): RunCodeWork {
  return {
    workspace: { ownerType: 'project', ownerId: 'project-shop', workspaceId: 'workspace-shop-app' },
    copyId: '7a1f0000-0000-4000-8000-000000000007',
    branch: 'add-free-delivery-over-50-banner-to-shop-s-home',
    main: 'main',
    behindMain,
    otherBranches: [],
    author: { name: 'Kernel', email: 'kernel@agents.hq.invalid' },
    onBehalfOf: { name: 'Mia Novak', email: 'mia@fernhill.example' },
    ...(openLivePreview ? { openLivePreview } : {}),
  }
}

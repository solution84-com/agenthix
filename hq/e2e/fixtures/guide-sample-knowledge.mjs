// The sample organisation's Knowledge: a few pages in sections for Website relaunch, and one organisation page, so
// the Knowledge screens have something to show. Pages are files on the site's disk, so this writes them under
// SITE_ROOT, the same directory the guide's site is started with; without it nothing is written (the dev site's
// own storage is never touched). Wired into seed-guide-data.mjs as seedKnowledge.
//
// The pages are the demo's seed data (demo/seed/site.json), the one data set both read: the guide takes the folders
// marked `inGuide` and leaves out what only the demo adds (Knowledge for the other projects), and a page's `guide`
// text where the demo's has grown, so the guide's sample stays as it is.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function writePages(pagesDir, pages) {
  rmSync(pagesDir, { recursive: true, force: true })
  for (const { path, content } of pages) {
    const file = join(pagesDir, path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }
}

export async function seedKnowledge({ projects, hqRoot }) {
  const siteRoot = process.env.SITE_ROOT
  if (!siteRoot) {
    console.warn('[seed-guide-data] SITE_ROOT is not set, so no Knowledge pages were written. Set it to the directory the guide site is started with, then run this again.')
    return
  }
  const core = await import(pathToFileURL(resolve(hqRoot, '../core/dist/index.js')).href)
  const { knowledge } = JSON.parse(readFileSync(resolve(hqRoot, '../demo/seed/site.json'), 'utf8'))
  for (const k of knowledge.filter((entry) => entry.inGuide)) {
    const where = 'project' in k.owner
      ? join(siteRoot, 'knowledge', 'projects', String(projects[k.owner.project].id), 'pages')
      : join(siteRoot, 'knowledge', 'org', core.KNOWLEDGE_ORG_OWNER_ID, 'pages')
    writePages(where, k.pages.map(({ path, content, guide }) => ({ path, content: guide ?? content })))
  }
}

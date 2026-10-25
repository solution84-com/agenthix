// The sample organisation's Knowledge: a few pages in sections for Website relaunch, and one organisation page, so
// the Knowledge screens have something to show. Pages are files on the site's disk, so this writes them under
// SITE_ROOT, the same directory the guide's site is started with; without it nothing is written (the dev site's
// own storage is never touched). Wired into seed-guide-data.mjs as seedKnowledge.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const WEB_PAGES = {
  'processes/launching-a-page.md': `---
title: Launching a page
description: How a page goes from draft to live, and who signs it off.
tags: [launch, review]
owner: Priya
---

## Steps

1. Draft the page in the staging site.
2. Ask a second person to read it.
3. Publish on a weekday morning, so the client can answer quickly.
`,
  'decisions/0001-static-site.md': `---
title: Build the site as static pages
description: Why the relaunch is built as static pages rather than with a content system.
tags: [decision, architecture]
status: accepted
date: 2026-05-12
---

## Why

The site changes a few times a month. Static pages are cheaper to host and have nothing to keep patched.
`,
  'decisions/0002-case-study-format.md': `---
title: One format for case studies
description: Every case study follows the same four headings.
tags: [decision, writing]
status: proposed
date: 2026-06-02
supersedes: 0001-static-site
---

## The four headings

The brief, what we did, the result, and what we would do differently.
`,
  'reference/brand-voice.md': `---
title: Brand voice
description: How Fernhill & Co writes for clients: plain, warm and specific.
tags: [writing]
---

Write short sentences. Name the thing, not the category it belongs to.
`,
  // Written without a description, as a file put on the disk outside the gate: Needs fixing lists it.
  'reference/old-notes.md': `---
title: Old notes
---

Left over from the first draft of the site.
`,
}

const ORG_PAGES = {
  'how-we-work/review-and-approval.md': `---
title: Review and approval
description: Who reads client work before it goes out, and who may approve it.
tags: [process]
---

Every piece of client work is read by a second person. An organisation admin approves anything that spends money.
`,
}

function writePages(pagesDir, pages) {
  rmSync(pagesDir, { recursive: true, force: true })
  for (const [name, text] of Object.entries(pages)) {
    const file = join(pagesDir, name)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
}

export async function seedKnowledge({ projects, hqRoot }) {
  const siteRoot = process.env.SITE_ROOT
  if (!siteRoot) {
    console.warn('[seed-guide-data] SITE_ROOT is not set, so no Knowledge pages were written. Set it to the directory the guide site is started with, then run this again.')
    return
  }
  const core = await import(pathToFileURL(resolve(hqRoot, '../core/dist/index.js')).href)
  writePages(join(siteRoot, 'knowledge', 'projects', String(projects.WEB.id), 'pages'), WEB_PAGES)
  writePages(join(siteRoot, 'knowledge', 'org', core.KNOWLEDGE_ORG_OWNER_ID, 'pages'), ORG_PAGES)
}

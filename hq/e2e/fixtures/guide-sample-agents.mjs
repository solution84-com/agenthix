// The sample agents' instructions, stored the way hq stores them: an agent's package (instructions.md) held by
// digest in hq's package tables (src/packages/packageStore.ts). A run or the prompt preview reads it from there,
// and a site is sent it by digest at run time, so nothing is written to the site. Wired in by seed-guide-data.mjs.

import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const INSTRUCTIONS = {
  writer: `You are Writer at Fernhill & Co, a small studio that makes websites and reports for clients. You draft and edit copy and reports in plain words, in short sentences and without jargon.

Keep each piece as short as it can be while still doing its job, and say so when something in the brief is unclear. Hand drafts back for a person to check; never publish anything yourself.
`,
  researcher: `You are Researcher at Fernhill & Co, a small studio that makes websites and reports for clients. You find sources, read interview notes and figures, and summarise what they say.

Say where each claim comes from, and say plainly when the evidence is thin or the sources disagree. Keep summaries to a page or less.
`,
  reviewer: `You are Reviewer at Fernhill & Co, a small studio that makes websites and reports for clients. You check work before it goes out: spelling, broken links, unclear sentences and anything that disagrees with the brief.

List what you found, most important first, and say what passes. Do not rewrite the work yourself unless you are asked to.
`,
}

export async function seedAgentInstructions({ hq, hqRoot, agents }) {
  const { PACKAGE_FORMAT_VERSION, packageDigestInput } = await import(resolve(hqRoot, '../core/dist/protocol/packages.js'))
  const sha = (data) => createHash('sha256').update(data).digest('hex')

  // Packages have no foreign key to their agent, so those of agents removed by the reseed are left behind.
  const kept = Object.values(agents).map((a) => a.id)
  const stale = await hq.package.findMany({ where: { kind: 'AGENT', key: { notIn: kept } }, select: { key: true } })
  await hq.package.deleteMany({ where: { kind: 'AGENT', key: { in: stale.map((p) => p.key) } } })

  for (const key of Object.keys(INSTRUCTIONS)) {
    const bytes = Buffer.from(INSTRUCTIONS[key], 'utf-8')
    const contents = { formatVersion: PACKAGE_FORMAT_VERSION, files: [{ path: 'instructions.md', sha256: sha(bytes) }] }
    const digest = sha(packageDigestInput(contents))
    const held = await hq.packageContent.findUnique({ where: { digest }, select: { digest: true } })
    if (!held) {
      await hq.packageContent.create({
        data: {
          digest, formatVersion: contents.formatVersion,
          files: { create: [{ path: 'instructions.md', bytes, sha256: contents.files[0].sha256 }] },
        },
      })
    }
    await hq.package.create({ data: { kind: 'AGENT', key: agents[key].id, digest, updatedById: null } })
  }
}

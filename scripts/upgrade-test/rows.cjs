// The rows the upgrade test puts in HQ's database and looks for again after each upgrade and put-back: an
// organisation, a person, a project with a task, a conversation with a message, and a stored provider. Each is marked
// with a word of the run (`one`, `two`), so a later check can ask for the rows of every mark seeded so far.
//
// It runs inside the installation's hq-server container, fed on standard input, so its database address stays in
// that container's environment, and it uses that version's own Prisma client:
//   docker exec -i <namespace>-hq-server node - seed one < scripts/upgrade-test/rows.cjs
//   docker exec -i <namespace>-hq-server node - check one two < scripts/upgrade-test/rows.cjs
//   docker exec -i <namespace>-hq-server node - counts < scripts/upgrade-test/rows.cjs
// `counts` prints every table's row count as JSON, so the test can say no table lost rows. The container's working
// folder is the server's, from which its Prisma client resolves.
'use strict'

const MARK = /^[a-z]{1,12}$/

/** The rows of one mark, by the Prisma model each goes in, with the fields a check compares. */
function rowsOf(mark) {
  if (!MARK.test(mark)) throw new Error(`Not a mark: ${mark}. Use a short lower-case word.`)
  const id = (what) => `upgrade-test-${mark}-${what}`
  const user = { id: id('person'), displayName: `Upgrade test person ${mark}` }
  const project = { id: id('project'), name: `Upgrade test project ${mark}`, key: `UT${mark.toUpperCase()}` }
  const conversation = { id: id('conversation'), home: 'PROJECT', projectId: project.id, openedById: user.id, title: `Upgrade test ${mark}` }
  return [
    ['org', { id: id('org'), name: `Upgrade test organisation ${mark}` }],
    ['user', user],
    ['project', project],
    ['task', { id: id('task'), title: `Upgrade test task ${mark}`, projectId: project.id, number: 1, onBehalfOfUserId: user.id }],
    ['conversation', conversation],
    ['conversationMessage', { id: id('message'), conversationId: conversation.id, seq: 1, role: 'PERSON', kind: 'TEXT', body: `Upgrade test message ${mark}` }],
    // The person's own, since an organisation holds one provider of each vendor, and each mark seeds one.
    ['aiProvider', { id: id('provider'), name: `Upgrade test provider ${mark}`, vendor: 'openai_compatible', credentialKind: 'none', baseUrl: 'http://127.0.0.1:9/v1', ownerUserId: user.id }],
  ]
}

/** What differs between a row as seeded and as found, in words; empty when it is all there. */
function differences(model, wanted, found) {
  if (!found) return [`${model} ${wanted.id} is missing`]
  return Object.entries(wanted).filter(([k, v]) => found[k] !== v).map(([k, v]) => `${model} ${wanted.id}: ${k} is ${JSON.stringify(found[k])}, not ${JSON.stringify(v)}`)
}

async function main(mode, marks) {
  const { PrismaClient } = require('@prisma/client')
  const db = new PrismaClient()
  try {
    if (mode === 'seed') {
      for (const [model, data] of rowsOf(marks[0])) await db[model].create({ data })
      console.log(`Seeded the rows of ${marks[0]}.`)
    } else if (mode === 'check') {
      const problems = []
      for (const mark of marks) {
        for (const [model, data] of rowsOf(mark)) problems.push(...differences(model, data, await db[model].findUnique({ where: { id: data.id } })))
      }
      if (problems.length) throw new Error(`Rows lost or changed:\n  ${problems.join('\n  ')}`)
      console.log(`Every row of ${marks.join(', ')} is there.`)
    } else if (mode === 'counts') {
      const tables = await db.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename")
      const counts = {}
      for (const { tablename } of tables) {
        const [{ n }] = await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tablename.replace(/"/g, '""')}"`)
        counts[tablename] = n
      }
      console.log(JSON.stringify(counts))
    } else {
      throw new Error('Usage: node - seed <mark> | check <mark>... | counts')
    }
  } finally {
    await db.$disconnect()
  }
}

if (process.argv[1] === '-') {
  main(process.argv[2], process.argv.slice(3)).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  })
}

module.exports = { rowsOf, differences }

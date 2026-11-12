import { hashWorkflowVersion, idFor, type WorkflowDefinition, type WorkflowVersionContent } from '@agenthix/core'
import type { SeedWorkflow } from '@agenthix/core'
import { seedPlaceSkills } from './placeSkills'
import type { SeedContext } from './types'

/** Why a seeded version has no flags and no reviewer's points: both are advice a model would give, and none is called. */
const NO_CHECKS = 'Checked: nothing to flag.'

/**
 * What the guide's sample leaves empty (spec, Today §4): an organisation skill, a workflow with two past runs, a
 * secret's name with no value anyone knows, and the variable the workflow names. Starting a workflow is refused in
 * the demo (its steps need executor containers), so these only show.
 */
export async function seedLibrary(c: SeedContext): Promise<void> {
  const l = c.seed.library
  for (const s of l.skills) {
    // Quoted as JSON, which YAML reads as a double-quoted string, so a colon in the words cannot break the front matter.
    const text = `---\nname: ${JSON.stringify(s.name)}\ndescription: ${JSON.stringify(s.description)}\n---\n\n${s.body}`
    const published = await c.deps.publishSkill(c.db, {
      name: s.name, files: [{ path: 'SKILL.md', content: Buffer.from(text, 'utf-8') }], givenToAll: s.givenToAll, grantedTo: s.grantedTo,
      byId: idFor(c.ids.people, s.madeBy, 'person'), at: c.at(s.at),
    }, c.ids.agents)
    await seedPlaceSkills(c, s, published)
  }
  for (const w of l.workflows) await seedWorkflow(c, w)

  for (const v of l.variables) {
    const by = idFor(c.ids.people, v.createdBy, 'person')
    await c.db.placeVariable.create({ data: { placeType: 'project', placeId: idFor(c.ids.projects, v.project, 'project'), name: v.name, value: v.value, createdById: by } })
  }
}

async function seedWorkflow(c: SeedContext, w: SeedWorkflow): Promise<void> {
  const { db, ids } = c
  const projectId = idFor(ids.projects, w.project, 'project')
  const approvedBy = idFor(ids.people, w.approvedBy, 'person')
  const definition: WorkflowDefinition = {
    name: w.name, description: w.description,
    steps: w.steps.map(s => ({ name: s.name, run: s.run, secrets: [], timeoutSeconds: null })),
    variables: [...w.variables].sort(), parameters: [], hosts: [], github: {}, timeoutSeconds: 600, files: [],
  }
  const content: WorkflowVersionContent = { definition, files: [], githubSecretNames: [], executorImageDigest: c.deps.executorImageDigest }
  const hash = await hashWorkflowVersion(content)
  const approvedAt = c.at(w.approvedAt)

  await db.workflow.create({
    data: { id: w.id, placeType: 'project', placeId: projectId, name: w.name, enabled: true, enabledChangedById: approvedBy, enabledChangedAt: approvedAt, createdAt: approvedAt },
  })
  const version = await db.workflowVersion.create({
    data: {
      workflowId: w.id, number: 1, hash, definition: definition as unknown as object, githubSecretNames: [], executorImageDigest: c.deps.executorImageDigest,
      state: 'APPROVED', origin: 'PROPOSED', proposedByAgentId: null, proposedForUserId: approvedBy,
      checkFlags: [], checkSummary: NO_CHECKS, cardMayApprove: true, reviewLevel: 'LOW', reviewPoints: { points: [] }, reviewedAt: approvedAt, createdAt: approvedAt,
    },
  })
  await db.workflowApproval.create({ data: { workflowId: w.id, placeType: 'project', placeId: projectId, versionId: version.id, hash, approvedById: approvedBy, approvedAt } })

  for (const r of w.runs) {
    const started = c.at(r.at)
    const ended = new Date(started.getTime() + r.durationSeconds * 1000)
    await db.workflowRun.create({
      data: {
        id: r.id, workflowId: w.id, versionId: version.id, hash, placeType: 'project', placeId: projectId, siteId: c.siteLogicalId,
        onBehalfOfUserId: idFor(ids.people, r.person, 'person'), parameters: {}, state: r.state,
        failureCode: r.failure?.code ?? null, failureMessage: r.failure?.message ?? null, startedAt: started, endedAt: ended, createdAt: started,
        steps: {
          create: w.steps.map((s, index) => {
            const step = r.steps[index]
            const state = step.skipped ? 'SKIPPED' : step.exitCode === 0 ? 'PASSED' : 'FAILED'
            return { index, name: s.name, state, exitCode: step.exitCode, output: step.output, startedAt: step.skipped ? null : started, endedAt: step.skipped ? null : ended }
          }),
        },
      },
    })
  }
}

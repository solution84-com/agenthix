import { PrismaClient } from '@prisma/client'
import { hashPassword } from 'wasp/auth/password'
import { projectTasksBoardCreate } from '../projects/boardColumns'
import { firstSprintDates, DEFAULT_SPRINT_DAYS } from '../projects/sprintDates'

const prisma = new PrismaClient()

/**
 * Dev-only login bypass (toggle in .env.server). When DEV_LOGIN_ENABLED=true and
 * credentials are set, seeds an ADMIN user so you always have a known login after a
 * DB reset. Turn it OFF (or unset) to test the real bootstrap/invite flow instead.
 * Gated by the flag — never seeds unless explicitly enabled (so it can't run in prod).
 */
async function seedDevUser() {
  if (process.env.DEV_LOGIN_ENABLED !== 'true') return
  const username = process.env.DEV_LOGIN_USERNAME
  const password = process.env.DEV_LOGIN_PASSWORD
  if (!username || !password) {
    console.log('DEV_LOGIN_ENABLED=true but DEV_LOGIN_USERNAME/PASSWORD missing — skipping dev user')
    return
  }
  const existing = await prisma.authIdentity.findFirst({
    where: { providerName: 'username', providerUserId: username },
  })
  if (existing) {
    console.log(`Dev user '${username}' already exists — skipping`)
    return
  }
  const providerData = JSON.stringify({ hashedPassword: await hashPassword(password) })
  try {
    const newUser = await prisma.user.create({
      // As the first account an install makes: organisation admin and fleet admin.
      data: { fleetAdmin: true, auth: { create: { identities: { create: { providerName: 'username', providerUserId: username, providerData } } } } },
    })
    await prisma.userSettings.create({ data: { userId: newUser.id, role: 'ADMIN', config: {} } })
    console.log(`Seeded DEV login user '${username}' (ADMIN, fleet admin). DEV_LOGIN_ENABLED=true.`)
  } catch (e: unknown) {
    // Wasp may invoke the seed twice; swallow the duplicate-user race so the seed stays exit-0.
    if (e && typeof e === 'object' && (e as { code?: string }).code === 'P2002') {
      console.log(`Dev user '${username}' already exists (concurrent seed) — skipping`)
      return
    }
    throw e
  }
}

export async function seed() {
  await seedDevUser()

  // Seed SiteConfig singleton
  const existingConfig = await prisma.siteConfig.findFirst()
  if (!existingConfig) {
    await prisma.siteConfig.create({
      data: {
        name: 'Agenthix Site',
        description: '',
      },
    })
    console.log('Seeded SiteConfig')
  }

  // Seed Org singleton
  const existingOrg = await prisma.org.findFirst()
  if (!existingOrg) {
    await prisma.org.create({
      data: {
        name: 'My Organisation',
        vision: '',
        mission: '',
      },
    })
    console.log('Seeded Org')
  }

  // Demo data only on a fresh DB — makes the seed safe to re-run (e.g. after a reset).
  if ((await prisma.project.count({ where: { personalOwnerId: null } })) > 0) {
    console.log('Projects already exist — skipping demo data seed')
    return
  }

  // Every task is done on behalf of a person (adr-0089), so the demo tasks need one.
  const owner = await prisma.userSettings.findFirst({ where: { role: 'ADMIN' }, select: { userId: true } })
  if (!owner) {
    console.log('No admin user yet — skipping demo data seed')
    return
  }
  const origin = { onBehalfOfUserId: owner.userId }

  // A project's tasks run on its Execution Site; hq creates the default site at its first boot.
  const site = await prisma.executionSite.findFirst({ select: { id: true } })
  if (!site) {
    console.log('No Execution Site yet — start hq once, then seed, so the demo projects have one to run on')
    return
  }

  console.log('Seeding projects, boards, and tasks...')

  // Two demo projects, each made with its Project Tasks (adr-0097).
  const project1 = await prisma.project.create({
    data: {
      name: 'Website Redesign',
      executionSiteId: site.id,
      key: 'WEB',
      slug: 'website-redesign',
      description: 'Redesign the company website with new branding',
      // Its admin, so someone can administer it (assign agents, settings) — an org admin is not one by default.
      members: { create: { userId: owner.userId, role: 'ADMIN' } },
      boards: { create: projectTasksBoardCreate() },
    },
  })

  const project2 = await prisma.project.create({
    data: {
      name: 'API Integration',
      executionSiteId: site.id,
      key: 'API',
      slug: 'api-integration',
      description: 'Build REST API integrations for external partners',
      // Its admin, so someone can administer it (assign agents, settings) — an org admin is not one by default.
      members: { create: { userId: owner.userId, role: 'ADMIN' } },
      boards: { create: projectTasksBoardCreate() },
    },
  })

  const project1Tasks = (await prisma.board.findFirstOrThrow({ where: { projectId: project1.id, kind: 'PROJECT_TASKS' } })).id

  // A sprint board for project 1, in its first sprint, and a workflow board for project 2.
  const sprintDates = firstSprintDates(new Date(), DEFAULT_SPRINT_DAYS)
  const board1 = await prisma.board.create({
    data: {
      name: 'Website sprints',
      projectId: project1.id,
      kind: 'SPRINTS',
      columns: JSON.parse('[{"name":"todo","label":"To Do","status":"TODO","color":"#6b7280","order":0},{"name":"in_progress","label":"In Progress","status":"IN_PROGRESS","color":"#f59e0b","order":1},{"name":"review","label":"Review","status":"IN_PROGRESS","color":"#8b5cf6","order":2},{"name":"done","label":"Done","status":"DONE","color":"#10b981","order":3}]'),
      sprints: { create: { number: 1, ...sprintDates } },
    },
    include: { sprints: true },
  })
  const sprint1 = board1.sprints[0]

  const board3 = await prisma.board.create({
    data: { name: 'Integration Board', projectId: project2.id, kind: 'WORKFLOW' },
  })

  // Get first agent for assignment (if exists)
  const agent = await prisma.agent.findFirst()
  // A task may name only an agent on its project's roster.
  if (agent) {
    await prisma.projectAgent.createMany({
      data: [{ projectId: project1.id, agentId: agent.id }, { projectId: project2.id, agentId: agent.id }],
      skipDuplicates: true,
    })
  }

  // Tasks for project 1. No run states: every task starts with no run pending,
  // whatever column it sits in — a run state is the system's to set. A task
  // in a column of the sprint board is in its sprint; the rest wait in Project
  // Tasks' Backlog.
  const tasks = [
    { title: 'Design new homepage mockup', description: 'Create wireframes and high-fidelity mockups for the new homepage', column: 'done', status: 'DONE' as const, priority: 'HIGH' as const },
    { title: 'Implement responsive nav', description: 'Build the responsive navigation component', column: 'in_progress', status: 'IN_PROGRESS' as const, priority: 'HIGH' as const },
    { title: 'Set up CI/CD pipeline', description: 'Configure GitHub Actions for automated deployment', column: 'review', status: 'IN_PROGRESS' as const, priority: 'MEDIUM' as const },
    { title: 'Write landing page copy', column: 'todo', status: 'TODO' as const, priority: 'MEDIUM' as const },
    { title: 'Optimize images for web', column: 'todo', status: 'TODO' as const, priority: 'LOW' as const },
    { title: 'SEO audit and fixes', column: null, status: 'TODO' as const, priority: 'LOW' as const },
    { title: 'Analytics integration', column: null, status: 'TODO' as const, priority: 'MEDIUM' as const },
  ]

  let p1Counter = 0
  for (const task of tasks) {
    p1Counter++
    const onSprintBoard = task.column !== null
    await prisma.task.create({
      data: {
        title: task.title,
        description: task.description,
        projectId: project1.id,
        boardId: onSprintBoard ? board1.id : project1Tasks,
        column: task.column,
        sprintId: onSprintBoard ? sprint1.id : null,
        status: task.status,
        priority: task.priority,
        assignedAgentId: onSprintBoard && agent ? agent.id : undefined,
        labels: task.priority === 'HIGH' ? ['urgent'] : [],
        number: p1Counter,
        ...origin,
      },
    })
  }

  // Tasks for project 2
  const p2Tasks = [
    { title: 'Design API schema', column: 'done', status: 'DONE' as const, priority: 'HIGH' as const },
    { title: 'Implement auth endpoints', column: 'in_progress', status: 'IN_PROGRESS' as const, priority: 'HIGH' as const },
    { title: 'Write API documentation', column: 'todo', status: 'TODO' as const, priority: 'MEDIUM' as const },
  ]

  let p2Counter = 0
  for (const task of p2Tasks) {
    p2Counter++
    await prisma.task.create({
      data: {
        title: task.title,
        projectId: project2.id,
        boardId: board3.id,
        column: task.column,
        status: task.status,
        priority: task.priority,
        assignedAgentId: agent ? agent.id : undefined,
        labels: [],
        number: p2Counter,
        ...origin,
      },
    })
  }

  console.log(`Seeded: 2 projects, 4 boards, ${tasks.length + p2Tasks.length} tasks`)
  if (agent) {
    console.log(`  - Assigned tasks to agent: ${agent.name} (${agent.id})`)
  } else {
    console.log('  - No agent found — tasks created without agent assignment')
  }
}

// NOTE: do not self-invoke seed() here. Wasp's db-seed runner imports this module and
// calls the exported `seed` itself — a top-level call would run the seed twice (causing
// duplicate Orgs and unique-constraint failures on re-seed).

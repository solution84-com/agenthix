import { prisma } from 'wasp/server'
import path from 'node:path'
import fs from 'node:fs/promises'
import { getHqAssetsRoot } from '../server/hqAssets'
import { builtIn } from './packages/builtIn'

interface SystemTemplateColumn {
  name: string
  label: string
  status: 'TODO' | 'IN_PROGRESS' | 'DONE'
  color: string
  order: number
  description: string
  hint: string
}

interface SystemTemplate {
  id: string      // stable, hardcoded — never changes
  version: number // bump when name, description, or columns change
  name: string
  description: string
  columns: SystemTemplateColumn[]
}

// IDs are stable and hardcoded. Never reassign them.
export const SYSTEM_TEMPLATE_IDS = {
  KANBAN:              'sys-tpl-0001-kanban',
  SPRINT_BOARD:        'sys-tpl-0002-sprint',
  ISSUE_TRACKER:       'sys-tpl-0003-issues',
  IDEATION:            'sys-tpl-0004-ideation',
  PRODUCT_ROADMAP:     'sys-tpl-0005-roadmap',
  WORKFORCE_ASSEMBLY:  'sys-tpl-0006-workforce-assembly',
} as const

const SYSTEM_TEMPLATES: SystemTemplate[] = [
  {
    id: SYSTEM_TEMPLATE_IDS.KANBAN,
    version: 1,
    name: 'Kanban',
    description: 'Simple general-purpose board for continuous flow work.',
    columns: [
      {
        name: 'todo', label: 'To Do', status: 'TODO', color: '#6b7280', order: 0,
        description: 'Work that has not started yet.',
        hint: 'Move here when a task is defined and ready to be picked up.',
      },
      {
        name: 'in_progress', label: 'In Progress', status: 'IN_PROGRESS', color: '#f59e0b', order: 1,
        description: 'Work actively being done right now.',
        hint: 'Move here as soon as you begin working on the task.',
      },
      {
        name: 'done', label: 'Done', status: 'DONE', color: '#10b981', order: 2,
        description: 'Completed and verified work.',
        hint: 'Move here only when the task is fully complete and verified.',
      },
    ],
  },
  {
    id: SYSTEM_TEMPLATE_IDS.SPRINT_BOARD,
    version: 1,
    name: 'Sprint Board',
    description: 'Scrum-style board for time-boxed development sprints.',
    columns: [
      {
        name: 'todo', label: 'To Do', status: 'TODO', color: '#6b7280', order: 0,
        description: 'Tasks accepted into this sprint but not yet started.',
        hint: 'Move here when a task is committed to the sprint scope and ready to be picked up.',
      },
      {
        name: 'in_progress', label: 'In Progress', status: 'IN_PROGRESS', color: '#f59e0b', order: 1,
        description: 'Tasks actively being implemented.',
        hint: 'Move here when you begin work on the task.',
      },
      {
        name: 'in_review', label: 'In Review', status: 'IN_PROGRESS', color: '#8b5cf6', order: 2,
        description: 'Implementation complete, awaiting code review or QA.',
        hint: 'Move here when your implementation is done and needs human review or testing.',
      },
      {
        name: 'done', label: 'Done', status: 'DONE', color: '#10b981', order: 3,
        description: 'Reviewed, approved, and merged.',
        hint: 'Move here after review passes and the work is merged or deployed.',
      },
    ],
  },
  {
    id: SYSTEM_TEMPLATE_IDS.ISSUE_TRACKER,
    version: 1,
    name: 'Issue Tracker',
    description: 'Track bugs, feature requests, and support issues through to resolution.',
    columns: [
      {
        name: 'open', label: 'Open', status: 'TODO', color: '#ef4444', order: 0,
        description: 'Newly reported issues that have not been triaged.',
        hint: 'Move here when a bug or request is first reported.',
      },
      {
        name: 'triaged', label: 'Triaged', status: 'TODO', color: '#6b7280', order: 1,
        description: 'Issues reviewed, scoped, and accepted for work.',
        hint: 'Move here once priority and scope are confirmed and the issue is ready to assign.',
      },
      {
        name: 'in_progress', label: 'In Progress', status: 'IN_PROGRESS', color: '#f59e0b', order: 2,
        description: 'Issues actively being fixed or implemented.',
        hint: 'Move here when work begins on the fix or feature.',
      },
      {
        name: 'resolved', label: 'Resolved', status: 'DONE', color: '#10b981', order: 3,
        description: 'Issue fixed, verified, and closed.',
        hint: 'Move here when the fix is deployed and confirmed by tests or the reporter.',
      },
    ],
  },
  {
    id: SYSTEM_TEMPLATE_IDS.IDEATION,
    version: 1,
    name: 'Ideation',
    description: 'Capture, evaluate, and execute on new ideas.',
    columns: [
      {
        name: 'ideas', label: 'Ideas', status: 'TODO', color: '#6b7280', order: 0,
        description: 'Raw ideas captured for future evaluation.',
        hint: 'Move here to capture any idea worth considering, no matter how rough.',
      },
      {
        name: 'evaluating', label: 'Evaluating', status: 'TODO', color: '#f59e0b', order: 1,
        description: 'Ideas under active assessment for viability and fit.',
        hint: 'Move here when the idea is being researched, discussed, or prototyped.',
      },
      {
        name: 'approved', label: 'Approved', status: 'IN_PROGRESS', color: '#8b5cf6', order: 2,
        description: 'Ideas validated and committed for execution.',
        hint: 'Move here once the idea has stakeholder buy-in and a clear scope.',
      },
      {
        name: 'executing', label: 'Executing', status: 'IN_PROGRESS', color: '#3b82f6', order: 3,
        description: 'Approved ideas actively being built or shipped.',
        hint: 'Move here when active development or implementation begins.',
      },
      {
        name: 'done', label: 'Done', status: 'DONE', color: '#10b981', order: 4,
        description: 'Ideas fully realized and delivered.',
        hint: 'Move here when the idea has been fully implemented and is live.',
      },
    ],
  },
  {
    id: SYSTEM_TEMPLATE_IDS.WORKFORCE_ASSEMBLY,
    version: 1,
    name: 'Workforce Assembly',
    description: 'Track the creation of agents, teams, and projects when building out an agent workforce.',
    columns: [
      {
        name: 'planned', label: 'Planned', status: 'TODO', color: '#6b7280', order: 0,
        description: 'Entity planned but not yet started.',
        hint: 'Move here when a task is defined and waiting for execution.',
      },
      {
        name: 'in_progress', label: 'In Progress', status: 'IN_PROGRESS', color: '#f59e0b', order: 1,
        description: 'Currently being created by the kernel.',
        hint: 'Move here when the kernel begins creating this entity.',
      },
      {
        name: 'in_review', label: 'In Review', status: 'IN_PROGRESS', color: '#8b5cf6', order: 2,
        description: 'Created — waiting for user approval before going live.',
        hint: 'Move here once the entity is created and pending user review.',
      },
      {
        name: 'approved', label: 'Approved', status: 'IN_PROGRESS', color: '#3b82f6', order: 3,
        description: 'User has reviewed and approved — entity can be enabled.',
        hint: 'Move here once the user has confirmed this entity looks correct.',
      },
      {
        name: 'done', label: 'Done', status: 'DONE', color: '#10b981', order: 4,
        description: 'Entity live and active.',
        hint: 'Move here once the entity is enabled and in use.',
      },
    ],
  },
  {
    id: SYSTEM_TEMPLATE_IDS.PRODUCT_ROADMAP,
    version: 1,
    name: 'Product Roadmap',
    description: 'Plan and track features from concept to release.',
    columns: [
      {
        name: 'planned', label: 'Planned', status: 'TODO', color: '#6b7280', order: 0,
        description: 'Features committed to the roadmap but work has not started.',
        hint: 'Move here when a feature is scoped and added to the roadmap.',
      },
      {
        name: 'in_development', label: 'In Development', status: 'IN_PROGRESS', color: '#f59e0b', order: 1,
        description: 'Features actively being built.',
        hint: 'Move here when engineering work begins on the feature.',
      },
      {
        name: 'in_review', label: 'In Review', status: 'IN_PROGRESS', color: '#8b5cf6', order: 2,
        description: 'Development complete — in QA, design review, or stakeholder sign-off.',
        hint: 'Move here when development is done and the feature needs validation before release.',
      },
      {
        name: 'released', label: 'Released', status: 'DONE', color: '#10b981', order: 3,
        description: 'Feature shipped to production and available to users.',
        hint: 'Move here when the feature is live and the release is announced.',
      },
    ],
  },
]

/**
 * Ensures system board templates exist in the database and are up to date.
 * Reads from assets/library/boards/*.json — only upserts when version changes.
 * Stores assetPath; columns are read from disk at board-creation time.
 */
export async function ensureSystemTemplates(): Promise<void> {
  const boardsDir = path.join(getHqAssetsRoot(), 'library', 'boards')
  let files: string[]
  try {
    files = (await fs.readdir(boardsDir)).filter((f) => f.endsWith('.json'))
  } catch {
    return
  }

  for (const file of files) {
    const raw = await fs.readFile(path.join(boardsDir, file), 'utf-8')
    const data = JSON.parse(raw) as { id: string; version: number; name: string; description?: string }
    const assetPath = `library/boards/${file}`

    const existing = await prisma.boardTemplate.findUnique({
      where: { id: data.id },
      select: { version: true },
    })
    if (existing?.version === data.version) continue

    await prisma.boardTemplate.upsert({
      where: { id: data.id },
      create: { id: data.id, name: data.name, description: data.description ?? '', assetPath, isSystem: true, version: data.version, ...builtIn(data.version) },
      update: { name: data.name, description: data.description ?? '', assetPath, version: data.version, ...builtIn(data.version) },
    })
  }
}

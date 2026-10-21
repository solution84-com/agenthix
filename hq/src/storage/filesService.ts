/**
 * Files Service (ADR-0039)
 * ========================
 * Every owner (project / user) has one intrinsic `files/` dir — its
 * working/knowledge home. It is NOT a record; the owner is the anchor.
 *
 * That directory is on the disk of the Execution Site that holds the owner's
 * storage, so hq asks the site to create and seed it rather than writing to a
 * filesystem the two happen to share today (ADR-0042).
 *
 * The starter documents themselves stay here, as string literals: hq decides
 * what a new project begins with, and the site writes what it is given.
 * Sending a template name instead would move that decision onto the site and
 * leave two places to change it.
 */
import { ensureDirOnSite, seedFilesOnSite } from './locationFileStore'

/**
 * Provision a project's files/ home (ADR-0039 §1; ROADMAP.md per ADR-0031),
 * keyed by the immutable project id. Idempotent — never overwrites existing docs.
 *
 * Creates, under the project's files home:
 *   ROADMAP.md   (only if absent)
 *   AGENTS.md    (only if absent) — the project's instructions for every agent,
 *                put into every run's prompt
 */
export async function provisionProjectFiles(projectId: string, projectName: string): Promise<void> {
  const location = { ownerType: 'project' as const, ownerId: projectId }

  // The files home itself, before anything is written into it.
  await ensureDirOnSite(location)

  await seedFilesOnSite(location, [
    {
      relPath: 'ROADMAP.md',
      ifAbsent: true,
      content: [
        `# ${projectName} — Roadmap`,
        '',
        '## Mission / Vision',
        '',
        '_Describe the project goal and success criteria here._',
        '',
        '## Current Week',
        '',
        '_No activity yet._',
        '',
        '## Previous Weeks',
        '',
        '_None yet._',
      ].join('\n'),
    },
    {
      relPath: 'AGENTS.md',
      ifAbsent: true,
      content: [
        `# ${projectName}`,
        '',
        'Instructions for every agent working in this project. Each run reads this file.',
        '',
        `Vision: _Describe what success looks like for ${projectName}._`,
        '',
        `Mission: _Describe the immediate goal and delivery target._`,
        '',
      ].join('\n'),
    },
  ])
}

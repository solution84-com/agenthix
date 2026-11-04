/**
 * The two folders of a runner's run staging (harnessHomes.ts, adr-0173): what the site checks and hands to the
 * runner's runs, which they may read and never change.
 *
 * - `skills/`: the skills checked for each turn, which the harness loads from there — Claude's as a local plugin
 *   (`skills/skills-<random>/.claude/`), OpenCode's one folder per conversation (`skills/conversation-<id>/skills/`).
 * - `pinned-memory/`: each conversation's pinned memory from HQ, `pinned-memory/<session id>/pinned.md`.
 *
 * Its own module, with no imports, because the code that stages into each folder, the container start that mounts
 * them and the removal at a conversation's end have to agree on the names.
 */
export const RUN_STAGING_SKILLS = 'skills'
export const RUN_STAGING_PINNED_MEMORY = 'pinned-memory'

export type RunStagingFolder = typeof RUN_STAGING_SKILLS | typeof RUN_STAGING_PINNED_MEMORY

/** A runner's run staging: where the site writes it, and where the run sees it (`/run/staging` in a container). */
export type RunStaging = { serverDir: string; visibleDir: string }

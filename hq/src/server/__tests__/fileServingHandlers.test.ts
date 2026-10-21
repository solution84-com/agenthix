/**
 * Path resolution for task attachments: a request is contained to its task's
 * own directory under hq's storage. The two routes themselves — who they serve,
 * who they refuse, and what the bytes arrive as — are
 * fileServing.integration.test.ts.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('../hqStoragePaths', () => ({
  getHqStorageRoot: () => `/deploy/hq-storage`,
  getTaskAttachmentDir: (taskId: string, uuid: string) => `/deploy/hq-storage/tasks/${taskId}/${uuid}`,
}))

import { resolveTaskArtefactPath } from '../fileServingHandlers'

const TASK_ID = 'tsk_bbb'
const TASKS_BASE = `/deploy/hq-storage/tasks`

// ── resolveTaskArtefactPath ───────────────────────────────────────────────────

describe('resolveTaskArtefactPath', () => {
  const UUID = 'a1b2c3d4'

  it('resolves workforce-application.json', () => {
    expect(resolveTaskArtefactPath(TASK_ID, UUID, 'workforce-application.json')).toBe(
      `${TASKS_BASE}/${TASK_ID}/${UUID}/workforce-application.json`
    )
  })

  it('returns null for ../../etc/passwd (traversal)', () => {
    expect(resolveTaskArtefactPath(TASK_ID, UUID, '../../etc/passwd')).toBeNull()
  })

  it('returns null for uuid ../other-task traversal', () => {
    expect(resolveTaskArtefactPath(TASK_ID, '../other-task', 'secret.json')).toBeNull()
  })

  it('returns null for taskId traversal', () => {
    expect(resolveTaskArtefactPath('../other', UUID, 'file.json')).toBeNull()
  })

  it('returns null for empty filename', () => {
    expect(resolveTaskArtefactPath(TASK_ID, UUID, '')).toBeNull()
  })
})

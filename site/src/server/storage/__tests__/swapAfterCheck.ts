/**
 * Stages the race a shared location allows, deterministically: another agent
 * swapping a directory for a symbolic link AFTER containment has approved a
 * path and BEFORE it is used.
 *
 * `fs.realpath` is the check's own last step, so it is wrapped: the first time
 * it resolves a path under `watched`, the swap runs, and the check still
 * answers with what it saw. Whatever the code under test does next with that
 * path meets the swapped link.
 */
import fs from 'node:fs/promises'
import { vi, type MockInstance } from 'vitest'

const originalRealpath = fs.realpath

export function swapAfterCheck(watched: string, swap: () => Promise<void>): MockInstance<typeof fs.realpath> {
  let done = false
  return vi.spyOn(fs, 'realpath').mockImplementation((async (p: string) => {
    const real = await originalRealpath(p)
    if (!done && String(p).startsWith(watched)) {
      done = true
      await swap()
    }
    return real
  }) as typeof fs.realpath)
}

/** Moves `dir` aside and puts a link to `target` where it stood. */
export async function replaceWithLink(dir: string, target: string): Promise<void> {
  await fs.rename(dir, `${dir}.moved`)
  await fs.symlink(target, dir)
}

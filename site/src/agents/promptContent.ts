/**
 * The text a prompt takes from packages: the agent's instructions
 * and the org's ORG.md — plus a boundary's own instructions override (P18),
 * appended after the package's, and the place's `AGENTS.md`.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ResolvedRunPackages } from '../packages/runPackages'
import type { LocationRef } from '@agenthix/core'
import { readBoundaryFile, type BoundaryOverride } from '../packages/boundaryOverrides'
import { readPlaceInstructions } from './placeInstructions'

/** `place` is the place's `AGENTS.md`, for every agent working there; absent for a preview, which has no place. */
export type PromptContent = { instructions: string | null; org: string | null; place?: string | null }

async function readTrimmed(file: string): Promise<string | null> {
  try {
    const text = (await fs.readFile(file, 'utf-8')).trim()
    return text || null
  } catch {
    return null
  }
}

export async function loadPromptContent(
  packages: Pick<ResolvedRunPackages, 'agentDir' | 'orgDir'>,
  boundaryOverride: BoundaryOverride | null = null,
  place: Pick<LocationRef, 'ownerType' | 'ownerId'> | null = null,
): Promise<PromptContent> {
  const own = await readTrimmed(path.join(packages.agentDir, 'instructions.md'))
  // Recheck containment at the moment of this read rather
  // than trust resolveBoundaryOverrideDir's earlier resolution — this call
  // happens after container prep, seconds into a run on the boundary's own
  // writable disk.
  const override = boundaryOverride
    ? (await readBoundaryFile(boundaryOverride, 'instructions.md'))?.trim() || null
    : null
  return {
    // A boundary's instructions come after the package's (P18).
    instructions: [own, override].filter(Boolean).join('\n\n') || null,
    org: packages.orgDir ? await readTrimmed(path.join(packages.orgDir, 'ORG.md')) : null,
    ...(place ? { place: await readPlaceInstructions(place) } : {}),
  }
}

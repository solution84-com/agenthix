/**
 * What this site's live previews use, against what the machine has (core's `LivePreviewsCapacity`), for its health
 * report: how many are open, the limit, and the machine's memory and processor use in whole percents only. From the
 * host service's figures where one runs this site; from the machine itself otherwise. Absent where the site makes no
 * containers, so runs no live preview.
 */
import os from 'node:os'
import { percentOf, type LivePreviewsCapacity } from '@agenthix/core'
import { hostFigures } from '../host/hostFigures'
import { livePreviewSettings } from './livePreviewSettings'
import { readLiveLivePreviews } from './livePreviewRows'

function ownUse(): { memoryPercent: number | null; cpuPercent: number | null } {
  const memory = percentOf(os.totalmem() - os.freemem(), os.totalmem())
  return { memoryPercent: memory === null ? null : Math.min(100, memory), cpuPercent: percentOf(os.loadavg()[0] ?? 0, os.cpus().length) }
}

export async function livePreviewsCapacity(): Promise<LivePreviewsCapacity | null> {
  if (process.env.AGENT_CONTAINER_ISOLATION !== 'true') return null
  const use = hostFigures.managed ? hostFigures.use() : ownUse()
  return { open: (await readLiveLivePreviews()).length, limit: livePreviewSettings().limit, memoryPercent: use.memoryPercent, cpuPercent: use.cpuPercent }
}

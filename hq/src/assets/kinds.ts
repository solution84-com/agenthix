import type { AssetKind } from '@agenthix/core'

const TO_ROW = { skill: 'SKILL', agent: 'AGENT', board: 'BOARD', team: 'TEAM', 'task-template': 'TASK_TEMPLATE' } as const
const FROM_ROW = { SKILL: 'skill', AGENT: 'agent', BOARD: 'board', TEAM: 'team', TASK_TEMPLATE: 'task-template' } as const

/** core's asset kind as hq's `AssetKind` enum stores it, and back. */
export function kindRow(kind: AssetKind): (typeof TO_ROW)[AssetKind] {
  return TO_ROW[kind]
}

export function kindOfRow(row: keyof typeof FROM_ROW): AssetKind {
  return FROM_ROW[row]
}

/** A conversation's segments as stored: read and opened, oldest first. Segments are only ever created, never updated. */
import { prisma } from 'wasp/server'
import type { ConversationSegment } from '@prisma/client'
import { openText } from '../sealing'
import type { OpenedSegment } from './block'
import type { KeptEntry } from './ledgerHead'

export function openSegment(row: ConversationSegment): OpenedSegment {
  return {
    id: row.id,
    firstSeq: row.firstSeq,
    lastSeq: row.lastSeq,
    firstAt: row.firstAt.toISOString(),
    lastAt: row.lastAt.toISOString(),
    brief: openText(row.brief),
    summary: openText(row.summary),
    ledgerHead: (row.ledgerHead as unknown as KeptEntry[]).map(e => ({ ...e, text: openText(e.text) })),
  }
}

export async function readSegments(conversationId: string): Promise<OpenedSegment[]> {
  const rows = await prisma.conversationSegment.findMany({ where: { conversationId }, orderBy: { firstSeq: 'asc' } })
  return rows.map(openSegment)
}

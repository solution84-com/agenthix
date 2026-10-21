/**
 * The ledger's store (long conversations spec, The ledger): `Conversation.ledger`, each entry's text sealed, every
 * change made under the conversation's row lock so two events never write over each other. Kept from events — an
 * operation starting and ending, an approval answered — and by the lead's `ledger` tool. A repeat of the same event
 * records nothing.
 */
import { prisma } from 'wasp/server'
import type { Prisma } from '@prisma/client'
import type { LedgerKeeper } from '../contract'
import type { LedgerEntryKind } from '../../shared/conversations/protocol'
import { openText, sealText } from '../sealing'
import { boundedHead, type KeptEntry } from './ledgerHead'

/** Past this many entries, the oldest closed ones are let go: the head never shows them anyway. */
export const LEDGER_MAX_ENTRIES = 300

type Tx = Prisma.TransactionClient

async function lockedLedger(tx: Tx, conversationId: string): Promise<KeptEntry[] | null> {
  await tx.$queryRaw`SELECT id FROM "Conversation" WHERE id = ${conversationId} FOR UPDATE`
  const row = await tx.conversation.findUnique({ where: { id: conversationId }, select: { ledger: true } })
  return row ? (row.ledger as unknown as KeptEntry[]) : null
}

async function save(tx: Tx, conversationId: string, sealed: KeptEntry[]): Promise<void> {
  await tx.conversation.update({ where: { id: conversationId }, data: { ledger: sealed as unknown as Prisma.InputJsonValue } })
}

const opened = (sealed: readonly KeptEntry[]): KeptEntry[] => sealed.map(e => ({ ...e, text: openText(e.text) }))

function nextId(sealed: readonly KeptEntry[]): string {
  const highest = sealed.reduce((max, e) => Math.max(max, Number(e.id.replace(/^L/, '')) || 0), 0)
  return `L${highest + 1}`
}

function pruned(sealed: KeptEntry[]): KeptEntry[] {
  let over = sealed.length - LEDGER_MAX_ENTRIES
  if (over <= 0) return sealed
  return sealed.filter(e => !(e.closed && over-- > 0))
}

function sameEvent(e: KeptEntry, entry: { kind: LedgerEntryKind; operationId?: string; sourceSeq?: number }): boolean {
  if (e.kind !== entry.kind) return false
  if (entry.kind === 'open-operation') return !!entry.operationId && e.operationId === entry.operationId
  return entry.sourceSeq !== undefined && e.sourceSeq === entry.sourceSeq
}

export interface Ledger extends LedgerKeeper {
  /** Every entry kept, opened, oldest first. */
  entries(conversationId: string): Promise<KeptEntry[]>
  /** The lead's own entry: returns its id. */
  add(conversationId: string, entry: { kind: LedgerEntryKind; text: string }): Promise<string | null>
  /** Marks an entry done, which trims it to one line; false when there is no such entry. */
  markDone(conversationId: string, id: string): Promise<boolean>
}

export function createLedger(now: () => Date = () => new Date()): Ledger {
  async function append(conversationId: string, entry: { kind: LedgerEntryKind; text: string; operationId?: string; sourceSeq?: number }): Promise<string | null> {
    return prisma.$transaction(async (tx) => {
      const sealed = await lockedLedger(tx, conversationId)
      if (!sealed) return null
      const repeat = sealed.find(e => sameEvent(e, entry))
      if (repeat) return repeat.id
      const id = nextId(sealed)
      const kept: KeptEntry = {
        id, kind: entry.kind, text: sealText(entry.text), at: now().toISOString(),
        ...(entry.operationId ? { operationId: entry.operationId } : {}),
        ...(entry.sourceSeq !== undefined ? { sourceSeq: entry.sourceSeq } : {}),
      }
      await save(tx, conversationId, pruned([...sealed, kept]))
      return id
    })
  }

  async function close(conversationId: string, match: (e: KeptEntry) => boolean, line?: string): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const sealed = await lockedLedger(tx, conversationId)
      const index = sealed?.findIndex(e => match(e) && !e.closed) ?? -1
      if (!sealed || index < 0) return false
      const entry = sealed[index]!
      sealed[index] = { ...entry, closed: true, ...(line !== undefined ? { text: sealText(line) } : {}) }
      await save(tx, conversationId, pruned(sealed))
      return true
    })
  }

  const ledger: Ledger = {
    async record(conversationId, entry) {
      await append(conversationId, entry)
    },
    async closeOperation(conversationId, operationId, line) {
      await close(conversationId, e => e.kind === 'open-operation' && e.operationId === operationId, line)
    },
    async head(conversationId) {
      return boundedHead(await ledger.entries(conversationId))
    },
    async entries(conversationId) {
      const row = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { ledger: true } })
      return row ? opened(row.ledger as unknown as KeptEntry[]) : []
    },
    add: (conversationId, entry) => append(conversationId, entry),
    markDone: (conversationId, id) => close(conversationId, e => e.id === id),
  }
  return ledger
}

export const ledger: Ledger = createLedger()

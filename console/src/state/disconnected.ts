/**
 * Machines a fleet admin disconnected here (spec §6), or that a restore of their site onto another machine replaced
 * (adr-0119): still listed on the fleet — who disconnected it and when, or which machine replaced it — until a fleet
 * admin removes it from the list or the machine is added again. Names only: the machine's identity is forgotten with
 * its pin, so nothing here lets it be trusted again.
 */
import { randomUUID } from 'node:crypto'
import { isFingerprint } from '@agenthix/core'
import type { StateFolder } from './folder'

const FILE = 'disconnected.json'

export type DisconnectedMachine = {
  id: string
  fingerprint: string
  machineName: string
  siteName: string
  by: { userId: string; name: string }
  at: string
  /** Its site was restored onto this machine, which replaced it; `by` is the fleet admin who confirmed the restore. */
  replacedBy?: { machineName: string }
}

export class DisconnectedMachines {
  private machines: DisconnectedMachine[]

  constructor(private readonly state: StateFolder) {
    this.machines = DisconnectedMachines.read(state)
  }

  list(): DisconnectedMachine[] {
    return [...this.machines]
  }

  add(machine: Omit<DisconnectedMachine, 'id' | 'at'>): DisconnectedMachine {
    const record = { id: randomUUID(), ...machine, at: new Date().toISOString() }
    this.machines = [...this.machines.filter(m => m.fingerprint !== machine.fingerprint), record]
    this.save()
    return record
  }

  /** Removed from the list by a fleet admin; false when there was no such record. */
  dismiss(id: string): boolean {
    const before = this.machines.length
    this.machines = this.machines.filter(m => m.id !== id)
    if (this.machines.length === before) return false
    this.save()
    return true
  }

  /** The machine was added again: it is listed as connected, not as disconnected. */
  forget(fingerprint: string): void {
    if (!this.machines.some(m => m.fingerprint === fingerprint)) return
    this.machines = this.machines.filter(m => m.fingerprint !== fingerprint)
    this.save()
  }

  private save(): void {
    this.state.writeJson([FILE], { machines: this.machines })
  }

  private static read(state: StateFolder): DisconnectedMachine[] {
    const data = state.readJson(FILE) as { machines?: unknown } | null
    if (!data) return []
    if (!Array.isArray(data.machines)) throw new Error(`${state.path(FILE)} holds no list of machines.`)
    return data.machines.map(m => {
      if (!isDisconnected(m)) throw new Error(`${state.path(FILE)} holds an entry that is not a disconnected machine.`)
      return m
    })
  }
}

function isDisconnected(v: unknown): v is DisconnectedMachine {
  if (!v || typeof v !== 'object') return false
  const m = v as Record<string, unknown>
  const by = m.by as Record<string, unknown> | null
  const replacedBy = m.replacedBy as Record<string, unknown> | null | undefined
  return typeof m.id === 'string' && isFingerprint(m.fingerprint) && typeof m.machineName === 'string' &&
    typeof m.siteName === 'string' && typeof m.at === 'string' &&
    !!by && typeof by === 'object' && typeof by.userId === 'string' && typeof by.name === 'string' &&
    (replacedBy === undefined || (!!replacedBy && typeof replacedBy === 'object' && typeof replacedBy.machineName === 'string'))
}

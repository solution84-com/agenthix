import type { SeedDb } from '../types'

export type Call = { model: string; method: string; args: any } // eslint-disable-line @typescript-eslint/no-explicit-any -- recorded Prisma arguments are any shape

let counter = 0

/** Gives every nested `create` list in a created row its own ids, as the database would, so a test can read them back. */
function withNestedIds(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data }
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && Array.isArray((value as { create?: unknown }).create)) {
      out[key] = (value as { create: Record<string, unknown>[] }).create.map(row => ({ id: `nested-${(counter += 1)}`, ...row }))
    }
  }
  return out
}

/** A Prisma stand-in that records every call and answers a create with the row it was given, plus an id. */
export function fakeDb(): { db: SeedDb; calls: Call[] } {
  const calls: Call[] = []
  const db = new Proxy({}, {
    get: (_t, model: string) => new Proxy({}, {
      get: (_m, method: string) => async (args: { data?: Record<string, unknown> } | undefined) => {
        calls.push({ model, method, args })
        if (method === 'create' && args?.data) return { id: `row-${(counter += 1)}`, ...withNestedIds(args.data) }
        if (method === 'createMany' || method === 'updateMany' || method === 'update') return { count: 1 }
        return null
      },
    }),
  }) as unknown as SeedDb
  return { db, calls }
}

export const created = (calls: Call[], model: string) => calls.filter(c => c.model === model && c.method === 'create').map(c => c.args.data)

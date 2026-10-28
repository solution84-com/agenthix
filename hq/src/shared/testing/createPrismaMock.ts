import { vi, type Mock } from 'vitest'

/**
 * Reusable Prisma mock factory for site vitest suites.
 *
 * Each model exposes the standard delegate methods as `vi.fn()` stubs so
 * tests can stub return values via e.g. `prisma.product.findMany.mockResolvedValue([...])`.
 *
 * `$transaction` accepts either:
 *  - an array of promises (returns `Promise.all(array)`), or
 *  - a callback `(tx) => ...` invoked with the same mock object (so `tx.X.method()`
 *    routes through the same stubs the test set up).
 *
 * Use `createPrismaMock(overrides)` to merge per-test or per-suite overrides. Overrides
 * are shallow-merged at the model level (the helper's stub methods remain present unless
 * a specific method is overridden in the override object).
 *
 * NOTE: The helper intentionally mirrors only the methods we currently use. When a new
 * delegate or model is needed by a future test, extend `DELEGATE_METHODS` or
 * `MODEL_NAMES` below.
 */

const DELEGATE_METHODS = [
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
] as const

type DelegateMethod = (typeof DELEGATE_METHODS)[number]

const MODEL_NAMES = [
  'agent',
  'agentSession',
  'agentSkill',
  'attachment',
  'board',
  'librarySkill',
  'personConnection',
  'notification',
  'org',
  'product',
  'program',
  'project',
  'projectMember',
  'projectAgent',
  'task',
  'taskAttachment',
  'taskComment',
  'team',
  'teamMember',
  'user',
  'userSettings',
  'voiceProvider',
  'siteConfig',
  'executionSite',
  'projectAutomation',
  'automationStart',
  'routine',
] as const

type ModelName = (typeof MODEL_NAMES)[number]

type DelegateStub = Record<DelegateMethod, Mock>

export type PrismaMockDelegate = DelegateStub

export type PrismaMock = Record<ModelName, PrismaMockDelegate> & {
  $transaction: Mock
  $connect: Mock
  $disconnect: Mock
  $executeRaw: Mock
  $executeRawUnsafe: Mock
  $queryRaw: Mock
  $queryRawUnsafe: Mock
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]
}

function buildDelegate(): DelegateStub {
  const delegate = {} as DelegateStub
  for (const method of DELEGATE_METHODS) {
    delegate[method] = vi.fn()
  }
  return delegate
}

export function createPrismaMock(overrides: DeepPartial<PrismaMock> = {}): PrismaMock {
  const mock = {} as PrismaMock

  for (const model of MODEL_NAMES) {
    mock[model] = buildDelegate()
  }

  // $transaction: accept either an array of promises or a callback.
  const $transaction = vi.fn(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: PrismaMock) => unknown)(mock)
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg)
    }
    return undefined
  })

  mock.$transaction = $transaction
  mock.$connect = vi.fn()
  mock.$disconnect = vi.fn()
  mock.$executeRaw = vi.fn()
  mock.$executeRawUnsafe = vi.fn()
  mock.$queryRaw = vi.fn()
  mock.$queryRawUnsafe = vi.fn()

  // Apply overrides shallow-by-model: replace specific methods, keep the rest.
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue
    const existing = (mock as Record<string, unknown>)[key]
    if (existing && typeof existing === 'object' && typeof value === 'object' && value !== null) {
      Object.assign(existing as object, value)
    } else {
      ;(mock as Record<string, unknown>)[key] = value
    }
  }

  return mock
}

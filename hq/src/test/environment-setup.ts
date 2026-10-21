import { inject } from 'vitest'
import { withoutPrismaEnvFileAsync } from './prismaEnvFile'

// Loads Prisma's client before any test does, so the copy of .env.server it
// brings into the environment is removed before a test can read it (see
// prismaEnvFile). Node caches the module, so later imports do not load it again.
await withoutPrismaEnvFileAsync(() => import('@prisma/client'))

// The run's own storage folder (storage-root.ts), whatever HQ_STORAGE_ROOT the shell had.
process.env.HQ_STORAGE_ROOT = inject('hqStorageRoot')

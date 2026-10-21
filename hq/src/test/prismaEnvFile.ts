// Prisma's generated client copies `.wasp/out/server/.env` — Wasp's copy of the
// developer's .env.server — into process.env when it loads, and again whenever
// a client is constructed. A test would then see that developer's own settings
// (dev-only switches, NODE_ENV, keys) and pass or fail by machine. These undo
// it: whatever key the load added is removed again; keys already set are never
// overwritten by it, so they are left as they were.

export function withoutPrismaEnvFile<T>(load: () => T): T {
  const before = new Set(Object.keys(process.env))
  try {
    return load()
  } finally {
    for (const key of Object.keys(process.env)) if (!before.has(key)) delete process.env[key]
  }
}

export async function withoutPrismaEnvFileAsync<T>(load: () => Promise<T>): Promise<T> {
  const before = new Set(Object.keys(process.env))
  try {
    return await load()
  } finally {
    for (const key of Object.keys(process.env)) if (!before.has(key)) delete process.env[key]
  }
}

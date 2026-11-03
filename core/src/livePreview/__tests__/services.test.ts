import { describe, expect, it } from 'vitest'
import { readServicesFile } from '../servicesFile.js'
import { checkImage, readCommand, readDuration } from '../serviceValues.js'
import { SERVICE_WIDENING_FIELDS, serviceDeclarationHash, type ServiceProblem } from '../services.js'

const file = (postgres: Record<string, unknown> = {}, more: Record<string, unknown> = {}) => ({
  services: {
    postgres: {
      image: 'postgres:16', environment: { POSTGRES_PASSWORD: 'dev' }, volumes: ['data:/var/lib/postgresql/data'], ...postgres,
    },
  },
  volumes: { data: {} },
  ...more,
})

const problems = (v: unknown): ServiceProblem[] => {
  const read = readServicesFile(v)
  return read.ok ? [] : read.problems
}
const codes = (v: unknown) => problems(v).map(p => p.code)

describe('the services file @SC-1742', () => {
  it('reads the spec\'s example into the template\'s values', () => {
    const read = readServicesFile(file())
    expect(read).toEqual({
      ok: true, volumes: ['data'],
      services: [{
        name: 'postgres', image: 'postgres:16', command: null, environment: [['POSTGRES_PASSWORD', 'dev']], expose: [],
        healthcheck: null, dependsOn: [], volume: { name: 'data', target: '/var/lib/postgresql/data', readOnly: false },
      }],
    })
  })

  it('refuses every field that would widen the sandbox, saying why, before any container exists (X6)', () => {
    for (const field of Object.keys(SERVICE_WIDENING_FIELDS)) {
      const found = problems(file({ [field]: true }))
      expect(found.map(p => p.code), field).toEqual(['widens'])
      expect(found[0].at).toBe(`services.postgres.${field}`)
      expect(found[0].message).toContain(SERVICE_WIDENING_FIELDS[field])
    }
    expect(codes(file({ entrypoint: ['sh'] }))).toEqual(['notAllowed'])
    expect(codes(file({}, { networks: {} }))).toEqual(['notAllowed'])
  })

  it('refuses host paths, unnamed volumes, options and a volume two services share', () => {
    expect(codes(file({ volumes: ['/home/mia:/data'] }))).toEqual(['hostPath'])
    expect(codes(file({ volumes: ['./src:/data'] }))).toEqual(['hostPath'])
    expect(codes(file({ volumes: [{ type: 'bind', source: '/', target: '/host' }] }))).toEqual(['hostPath'])
    expect(codes(file({ volumes: ['other:/data'] }))).toEqual(['unknownVolume'])
    expect(codes(file({ volumes: ['data:/a', 'data:/b'] }))).toEqual(['oneVolume'])
    expect(codes(file({}, { volumes: { data: { driver: 'local', driver_opts: { device: '/' } } } }))).toContain('volumeOptions')
    const two = file()
    ;(two.services as Record<string, unknown>).redis = { image: 'redis:7', volumes: ['data:/data'] }
    expect(codes(two)).toEqual(['volumeShared'])
  })

  it('fills nothing in from variables', () => {
    expect(codes(file({ environment: { POSTGRES_PASSWORD: '${PASSWORD}' } }))).toEqual(['interpolation'])
    expect(codes(file({ environment: ['POSTGRES_PASSWORD'] }))).toEqual(['badName'])
    expect(codes(file({ environment: { POSTGRES_PASSWORD: null } }))).toEqual(['interpolation'])
    expect(codes(file({ command: 'postgres -c $HOME' }))).toEqual(['interpolation'])
    expect(codes(file({ environment: { POSTGRES_PASSWORD: 'a$1' } }))).toEqual([])
  })

  it('takes images by DNS name only', () => {
    for (const image of ['postgres:16', 'ghcr.io/owner/name:1.2', 'redis@sha256:' + 'a'.repeat(64), 'library/redis']) {
      expect(checkImage(image), image).toEqual({ image })
    }
    for (const image of ['10.0.0.5/x:1', 'localhost/x', 'registry.local:5000/x', 'Postgres', 'a b', '${IMAGE}', '']) {
      expect(typeof checkImage(image), image).toBe('string')
    }
    expect(codes(file({ image: '192.168.1.2/evil' }))).toEqual(['badImage'])
  })

  it('reads healthchecks, depends_on and expose, and refuses a circle or a stranger', () => {
    const read = readServicesFile({
      services: {
        web: { image: 'nginx:1', depends_on: { db: { condition: 'service_healthy' } }, expose: [80, '8080/tcp', 80] },
        db: { image: 'postgres:16', healthcheck: { test: ['CMD', 'pg_isready'], interval: '1m30s', retries: 5 } },
      },
    })
    expect(read.ok && read.services.map(s => s.name)).toEqual(['db', 'web'])
    if (!read.ok) return
    expect(read.services[0].healthcheck).toEqual({ test: ['CMD', 'pg_isready'], intervalMs: 90_000, timeoutMs: 30_000, retries: 5, startPeriodMs: 0 })
    expect(read.services[1]).toMatchObject({ dependsOn: [['db', 'service_healthy']], expose: [80, 8080] })
    expect(codes({ services: { a: { image: 'x', depends_on: ['b'] }, b: { image: 'y', depends_on: ['a'] } } })).toEqual(['dependsCycle'])
    expect(codes({ services: { a: { image: 'x', depends_on: ['ghost'] } } })).toEqual(['unknownService'])
    expect(codes(file({ expose: ['8000-8010'] }))).toEqual(['badValue'])
  })

  it('refuses a file that is not one, and finds every problem at once', () => {
    expect(codes('services: x')).toEqual(['notAFile'])
    expect(codes({ services: {} })).toEqual(['notAFile'])
    expect(codes({ services: { Bad_Name: { image: 'x' } } })).toEqual(['badName'])
    expect(codes(file({ privileged: true, pid: 'host', image: 'localhost/x' })).sort()).toEqual(['badImage', 'widens', 'widens'])
  })
})

describe('a service\'s declaration hash @SC-1742', () => {
  it('is the same for the same declaration however the file wrote it, and changes with any value', async () => {
    const a = readServicesFile(file({ environment: { B: '2', A: '1' } }))
    const b = readServicesFile(file({ environment: ['A=1', 'B=2'] }))
    const c = readServicesFile(file({ environment: { A: '1', B: '3' } }))
    if (!a.ok || !b.ok || !c.ok) throw new Error('not read')
    const hash = await serviceDeclarationHash(a.services[0])
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(await serviceDeclarationHash(b.services[0])).toBe(hash)
    expect(await serviceDeclarationHash(c.services[0])).not.toBe(hash)
  })
})

describe('a service\'s values @SC-1742', () => {
  it('splits a command line as a shell splits words, running nothing', () => {
    expect(readCommand('postgres -c "shared_buffers=256MB" -c \'log statement=all\'')).toEqual({
      command: ['postgres', '-c', 'shared_buffers=256MB', '-c', 'log statement=all'],
    })
    expect(readCommand('echo "unclosed')).toHaveProperty('problem')
    expect(readCommand(['redis-server', '--port', 6380])).toEqual({ command: ['redis-server', '--port', '6380'] })
  })

  it('reads durations', () => {
    expect([readDuration('10s'), readDuration('1m30s'), readDuration('500ms'), readDuration(2), readDuration('soon')])
      .toEqual([10_000, 90_000, 500, 2000, null])
  })
})

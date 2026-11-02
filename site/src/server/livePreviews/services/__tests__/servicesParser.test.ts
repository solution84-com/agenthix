/**
 * The services file's parser, run here with Node directly against a temporary folder standing in for `/w` (X6). The
 * container's own walls (no Docker socket, no network) are the container test's.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { beforeEach, describe, expect, it } from 'vitest'
import { withFeature } from '@agenthix/core/testing'
import { readServicesFile } from '@agenthix/core'
import { SERVICES_PARSER } from '../servicesParser'

let w = ''

function parser(): Record<string, unknown> {
  const r = spawnSync(process.execPath, ['-e', SERVICES_PARSER], { env: { TOOL_ROOT: w }, encoding: 'utf8' })
  return JSON.parse(r.stdout.trim().split('\n').pop()!)
}
const write = (body: string) => {
  fs.mkdirSync(path.join(w, '.agents'), { recursive: true })
  fs.writeFileSync(path.join(w, '.agents/services.yaml'), body)
}
const parsed = (body: string) => {
  write(body)
  const a = parser()
  expect(a.ok, JSON.stringify(a)).toBe(true)
  return a.parsed
}
const refusal = (body: string) => {
  write(body)
  const a = parser()
  expect(a.refused).toBe('notAFile')
  return String(a.detail)
}

beforeEach(() => {
  w = fs.mkdtempSync(path.join(os.tmpdir(), 'services-parser-'))
})

withFeature('livePreview', () => {
  describe('reading the file @SC-1742', () => {
    it('says absent when there is no file', () => {
      expect(parser()).toEqual({ absent: true })
    })

    it('refuses a link, for the file or its folder', () => {
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'outside-'))
      fs.writeFileSync(path.join(outside, 'services.yaml'), 'services: {}')
      fs.symlinkSync(outside, path.join(w, '.agents'))
      expect(parser()).toMatchObject({ refused: 'notAFile', detail: expect.stringContaining('link') })
      fs.unlinkSync(path.join(w, '.agents'))
      fs.mkdirSync(path.join(w, '.agents'))
      fs.symlinkSync(path.join(outside, 'services.yaml'), path.join(w, '.agents/services.yaml'))
      expect(parser()).toMatchObject({ refused: 'notAFile', detail: expect.stringContaining('link') })
    })

    it('refuses a file that is too large', () => {
      write(`# ${'x'.repeat(70 * 1024)}\nservices: {}\n`)
      expect(parser()).toMatchObject({ refused: 'notAFile', detail: expect.stringContaining('64 KiB') })
    })
  })

  describe('the YAML it reads @SC-1742', () => {
    it('reads the spec\'s example into what core accepts', () => {
      const value = parsed([
        '# the database',
        'services:',
        '  postgres:',
        '    image: postgres:16   # pinned',
        '    environment:',
        '      POSTGRES_PASSWORD: dev',
        '      COUNT: 3',
        '    volumes:',
        '      - data:/var/lib/postgresql/data',
        '    healthcheck:',
        '      test: ["CMD", "pg_isready", "-U", "postgres"]',
        '      interval: 2s',
        '    expose: [5432]',
        'volumes:',
        '  data: {}',
        '',
      ].join('\n'))
      expect(value).toEqual({
        services: {
          postgres: {
            image: 'postgres:16',
            environment: { POSTGRES_PASSWORD: 'dev', COUNT: 3 },
            volumes: ['data:/var/lib/postgresql/data'],
            healthcheck: { test: ['CMD', 'pg_isready', '-U', 'postgres'], interval: '2s' },
            expose: [5432],
          },
        },
        volumes: { data: {} },
      })
      const read = readServicesFile(value)
      expect(read.ok).toBe(true)
    })

    it('reads lists at the key\'s own indent, mappings in lists, quotes and scalars', () => {
      expect(parsed([
        'services:',
        '  web:',
        '    image: "nginx:1"',
        '    command:',
        '    - nginx',
        "    - 'it''s'",
        '    - "a\\tb\\u00e9"',
        '    volumes:',
        '      - type: volume',
        '        source: data',
        '        target: /d',
        '    depends_on: { db: { condition: service_healthy } }',
        '    environment: [A=1, "B=two"]',
        '  db:',
        '    image: redis',
        '    healthcheck: { disable: true, retries: ~ }',
      ].join('\n'))).toEqual({
        services: {
          web: {
            image: 'nginx:1',
            command: ['nginx', "it's", 'a\tbé'],
            volumes: [{ type: 'volume', source: 'data', target: '/d' }],
            depends_on: { db: { condition: 'service_healthy' } },
            environment: ['A=1', 'B=two'],
          },
          db: { image: 'redis', healthcheck: { disable: true, retries: null } },
        },
      })
    })

    it('keeps a key named like an object\'s own as an ordinary key', () => {
      expect(JSON.stringify(parsed('services:\n  __proto__:\n    image: x\n'))).toBe('{"services":{"__proto__":{"image":"x"}}}')
    })

    it.each([
      ['anchors', 'services:\n  a: &x\n    image: y\n'],
      ['aliases', 'services:\n  a: *x\n'],
      ['tags', 'services:\n  a: !!str x\n'],
      ['block text', 'services:\n  a:\n    command: |\n      x\n'],
      ['merge keys', 'services:\n  a:\n    <<: { image: x }\n'],
      ['several documents', '---\nservices: {}\n'],
      ['a duplicate key', 'services:\n  a:\n    image: x\n    image: y\n'],
      ['tabs', 'services:\n\ta: {}\n'],
      ['an unclosed list', 'services:\n  a: [x, y\n'],
      ['an unclosed quote', 'services:\n  a: "x\n'],
      ['bad indentation', 'services:\n  a:\n    image: x\n      command: y\n'],
      ['a complex key', 'services:\n  ? a\n'],
    ])('refuses %s, saying where', (_what, body) => {
      expect(refusal(body)).toMatch(/line \d+|several|written twice|not accepted/)
    })

    it('refuses nesting past its limit', () => {
      expect(refusal(`services: ${'['.repeat(40)}${']'.repeat(40)}\n`)).toContain('nest')
    })
  })
})

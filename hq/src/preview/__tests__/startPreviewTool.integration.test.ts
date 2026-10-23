// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import { PreviewError, SITE_PROTOCOL_VERSION } from '@agenthix/core'

// The only row this module reads is the site's label and version, for the two
// failures that have to name them — a real row in the test database. The
// boundary, the site and the preview registry are the handler's injected deps.
vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  return { prisma }
})

import { prisma } from '../../test/db'
import { ChannelRequestFailed } from '../../sites/channel'
import { ControlPlaneError } from '../../server/controlplane/types'
import { runStartPreview } from '../startPreviewTool'

const TARGET = {
  agentId: 'a1',
  sessionId: 's1',
  siteId: 'site-b',
  location: { ownerType: 'project' as const, ownerId: 'p1', workspaceId: null, taskId: null },
  ownerSlug: 'acme',
}

function baseDeps(overrides: Record<string, unknown> = {}) {
  return {
    resolveTarget: vi.fn(async () => TARGET),
    request: vi.fn(async () => ({ previewId: 'pv-9' })),
    createPreview: vi.fn(async (i: Record<string, unknown>) => ({ id: 'row1', token: 'tok', status: 'starting', ...i })),
    markStatus: vi.fn(async () => {}),
    hqUrl: 'https://hq.example',
    previewDomain: 'preview.hq.example',
    ttlMs: 60_000,
    ...overrides,
  }
}

/** The refusal as a caller on the control-plane forward would receive it. */
async function refusalFrom(deps: Record<string, unknown>): Promise<ControlPlaneError> {
  try {
    await runStartPreview({ command: 'npm run dev', port: 5173 }, deps as never)
  } catch (err) {
    return err as ControlPlaneError
  }
  throw new Error('expected runStartPreview to refuse')
}

beforeEach(async () => {
  vi.clearAllMocks()
  await prisma.executionSite.create({ data: { siteId: 'site-b', label: 'Studio', status: 'CONNECTED', protocolVersion: SITE_PROTOCOL_VERSION } })
})

describe('start_preview handler @SC-229', () => {
  // adr-0071: a deployed install that sets no preview domain has previews off.
  // Refused before the site is asked, so nothing is started that has no address.
  it('refuses when previews are off, without starting anything', async () => {
    const deps = baseDeps({ previewDomain: null })

    const err = await refusalFrom(deps)

    expect(err.message).toMatch(/Previews are off.*PREVIEW_DOMAIN/)
    expect(deps.resolveTarget).not.toHaveBeenCalled()
    expect(deps.request).not.toHaveBeenCalled()
    expect(deps.createPreview).not.toHaveBeenCalled()
  })

  it("keeps hq's own port on the preview's address", async () => {
    const result = await runStartPreview(
      { command: 'npm run dev', port: 5173 },
      baseDeps({ hqUrl: 'http://localhost:4101', previewDomain: 'preview.localhost' }) as never,
    )
    expect(result.url).toBe('http://p-row1.preview.localhost:4101/')
  })

  it('asks the site that holds the boundary, and records where the answer lives', async () => {
    const deps = baseDeps()

    const result = await runStartPreview({ command: 'npm run dev', port: 5173 }, deps as never)

    expect(deps.request).toHaveBeenCalledWith('site-b', 'preview.start', expect.objectContaining({
      location: { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: null },
      ownerSlug: 'acme',
      sessionId: 's1',
      command: 'npm run dev',
      port: 5173,
    }))
    expect(deps.createPreview).toHaveBeenCalledWith(expect.objectContaining({
      siteId: 'site-b', previewId: 'pv-9', agentId: 'a1', sessionId: 's1',
      ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: null,
      command: 'npm run dev',
    }))
    expect(deps.markStatus).toHaveBeenCalledWith('row1', 'running')
    // The preview's own host under the preview domain, on hq's scheme and port,
    // named by the row id — never a path on hq's own origin, never the token.
    expect(result).toEqual({ url: 'https://p-row1.preview.hq.example/', status: 'running' })
  })

  // The boundary is the one thing that must never be caller-supplied: the
  // method is "run this command in that container", and it is safe only while
  // the caller is a run already inside it.
  it('sends nothing the caller chose but the command and the port', async () => {
    const deps = baseDeps()
    await runStartPreview({ command: 'npm run dev', port: 5173 }, deps as never)
    const [, , params] = deps.request.mock.calls[0] as unknown as [string, string, Record<string, unknown>]
    expect(Object.keys(params).sort()).toEqual(['command', 'location', 'ownerSlug', 'port', 'sessionId'])
  })

  it("names a personal project's person, whose container its task ran in, and only then", async () => {
    const deps = baseDeps({ resolveTarget: vi.fn(async () => ({ ...TARGET, personalOwnerId: 'u-bo' })) })
    await runStartPreview({ command: 'npm run dev', port: 5173 }, deps as never)
    const [, , params] = deps.request.mock.calls[0] as unknown as [string, string, Record<string, unknown>]
    expect(params.personalOwnerId).toBe('u-bo')
  })

  it('never builds a path on a site\'s disk', async () => {
    // A source scan of this one module, not of its import graph: it catches the
    // thing that actually happens — somebody reaching for the site root again
    // while editing here — and it catches nothing else.
    const source = await readFile(new URL('../startPreviewTool.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/siteRoot|docker/)
  })

  // Every refusal below crosses `dataApi.ts`, which answers a plain `Error`
  // with `500 {"error":"internal error"}`. A refusal that is not a
  // ControlPlaneError is a refusal the agent never reads.
  describe('a refusal survives the control-plane forward', () => {
    it('keeps the failure it got when the site does not know preview.start', async () => {
      const deps = baseDeps({
        request: vi.fn(async () => { throw new ChannelRequestFailed('unknown_method', 'unknown_method') }),
      })
      await expect(runStartPreview({ command: 'npm run dev', port: 5173 }, deps as never))
        .rejects.toThrow(/unknown_method/)
    })

    it('says the site is unreachable, rather than that the preview failed', async () => {
      const deps = baseDeps({
        request: vi.fn(async () => { throw new ChannelRequestFailed('gone', 'offline') }),
      })
      const err = await refusalFrom(deps)
      expect(err).toBeInstanceOf(ControlPlaneError)
      expect(err.code).toBe('conflict')
      expect(err.message).toMatch(/Studio.*unreachable/)
    })

    // `no_container` is not a fault — it means nothing is running in that
    // storage yet, which the person fixes by starting a run. Forwarding the
    // wire string would hand them `preview/no_container:` and leave them to
    // guess.
    it('turns a boundary with no run up into the next thing to do', async () => {
      const deps = baseDeps({
        request: vi.fn(async () => { throw new PreviewError('no_container', 'preview.start found no container') }),
      })
      const err = await refusalFrom(deps)
      expect(err).toBeInstanceOf(ControlPlaneError)
      expect(err.code).toBe('conflict')
      expect(err.message).toMatch(/start a run there first/)
      expect(deps.createPreview).not.toHaveBeenCalled()
    })

    it('carries the dev server\'s own output when it never answered', async () => {
      const deps = baseDeps({
        request: vi.fn(async () => { throw new PreviewError('not_ready', 'EADDRINUSE: port 5173 is taken') }),
      })
      const err = await refusalFrom(deps)
      expect(err).toBeInstanceOf(ControlPlaneError)
      expect(err.code).toBe('conflict')
      expect(err.message).toMatch(/EADDRINUSE/)
    })

    it('reports a location the site could not resolve as a bad request, naming the site', async () => {
      const deps = baseDeps({
        request: vi.fn(async () => { throw new PreviewError('invalid', 'preview.start names a location…') }),
      })
      const err = await refusalFrom(deps)
      expect(err).toBeInstanceOf(ControlPlaneError)
      expect(err.code).toBe('invalid')
      expect(err.message).toMatch(/Studio.*could not resolve the storage/)
    })

    it('reports a preview the site does not know as not found, naming the site', async () => {
      const deps = baseDeps({
        request: vi.fn(async () => { throw new PreviewError('not_found', 'no such preview') }),
      })
      const err = await refusalFrom(deps)
      expect(err).toBeInstanceOf(ControlPlaneError)
      expect(err.code).toBe('not_found')
      expect(err.message).toMatch(/Studio.*no longer has that preview/)
    })

    // The reason is in the site's own log on purpose — it may name a path on
    // that machine — so what crosses is the fact and where to look.
    it('points at the site\'s own log when the exec itself failed', async () => {
      const deps = baseDeps({
        request: vi.fn(async () => { throw new PreviewError('exec_failed', 'docker refused') }),
      })
      const err = await refusalFrom(deps)
      expect(err).toBeInstanceOf(ControlPlaneError)
      expect(err.code).toBe('conflict')
      expect(err.message).toMatch(/Studio.*its own log says why/)
      expect(err.message).not.toMatch(/docker refused/)
    })
  })

  it('refuses a run that works in no storage, with the reason', async () => {
    const deps = baseDeps({
      resolveTarget: vi.fn(async () => {
        throw new ControlPlaneError('conflict', 'This run works in no storage, so it has no working tree to preview')
      }),
    })
    await expect(runStartPreview({ command: 'npm run dev', port: 5173 }, deps as never))
      .rejects.toThrow(/no storage/)
    expect(deps.request).not.toHaveBeenCalled()
    expect(deps.createPreview).not.toHaveBeenCalled()
  })

  // The site is holding a dev server and, with it, the boundary's container
  // against idle teardown. With no row written there is nothing for the sweep
  // to find later, so this is the only chance to give it back.
  it('stops the preview it just started when the row cannot be written', async () => {
    const request = vi.fn(async (_siteId: string, method: string) => {
      if (method === 'preview.start') return { previewId: 'pv-9' }
      return { stopped: true }
    })
    const deps = baseDeps({
      request,
      createPreview: vi.fn(async () => { throw new Error('database is down') }),
    })

    await expect(runStartPreview({ command: 'npm run dev', port: 5173 }, deps as never))
      .rejects.toThrow(/database is down/)
    expect(request).toHaveBeenCalledWith('site-b', 'preview.stop', { previewId: 'pv-9' })
  })

  it('still reports the original failure when the stop cannot be delivered either', async () => {
    const request = vi.fn(async (_siteId: string, method: string) => {
      if (method === 'preview.start') return { previewId: 'pv-9' }
      throw new ChannelRequestFailed('gone', 'offline')
    })
    const deps = baseDeps({
      request,
      createPreview: vi.fn(async () => { throw new Error('database is down') }),
    })

    await expect(runStartPreview({ command: 'npm run dev', port: 5173 }, deps as never))
      .rejects.toThrow(/database is down/)
  })
})

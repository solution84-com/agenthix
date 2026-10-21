/**
 * Runtime-support operations. Not domain CRUD like the other
 * `controlplane/*Ops.ts` modules: these exist purely to give site's runtime a
 * data-path forward for hq-only state it has no local equivalent for (which
 * boundary a run works in and what its owner is called, the GitHub App's
 * org-level secret + membership checks). `resolve_git_credential` is data-path-only — registered
 * in `operations.ts` but deliberately kept OUT of
 * `CONTROL_PLANE_TOOLS`/`WORKFORCE_TOOLS` (toolSchemas.ts's
 * `DATA_PATH_ONLY_TOOLS`) so hq's own MCP surface (mcpServer.ts,
 * workforceTools.ts — both iterate those two arrays directly, never this
 * one) is untouched. `start_preview` is registered here as a NEW distinct
 * entry in the `operations` map — hq's existing direct-wired `start_preview`
 * MCP tool (mcpServer.ts:151-184) stays exactly as it is; this is a second,
 * forwarding-only path site's own MCP calls into.
 */
import { prisma } from 'wasp/server'
import { ControlPlaneError, type CallerContext } from './types'
import { actingAgentId } from './authorize'
import { runStartPreview } from '../../preview/startPreviewTool'
import { resolvePreviewBoundary } from '../../preview/previewBoundary'
import { createPreview, markStatus } from '../../preview/previewRegistry'
import { hqBaseUrl, previewDomain, PREVIEW_TTL_MS } from '../../preview/previewWiring'
import { siteChannelRegistry } from '../../sites/channel'
import { assertRunCanAccessOwner } from '../../storage/gitGrantService'
import { getTokenFor } from '../../github/githubApp'
import type { WorkspaceOwnerType } from '@agenthix/core'

// ── start_preview (data-path forward for site's MCP) ────────────────────────

export async function startPreviewOp(ctx: CallerContext, args: { command: string; port: number }) {
  // Mirrors mcpServer.ts's own gate (`if (opts?.claims)`): only an agent-run
  // capability may preview, and it can only ever preview the working tree of
  // the run it belongs to — the agent and the session both come from the
  // verified claims, never from the model (ADR-0036 isolation). The boundary
  // the site is asked to run the command in is derived from those two and from
  // nothing on the wire; see previewBoundary.ts for why that is the property
  // the whole method rests on.
  if (ctx.kind !== 'run') throw new ControlPlaneError('forbidden', 'start_preview requires an agent-run capability')
  const { agentId, sessionId } = ctx.claims

  return runStartPreview(args, {
    resolveTarget: () => resolvePreviewBoundary({ agentId, sessionId }),
    request: (siteId, method, params) => siteChannelRegistry.request(siteId, method, params),
    createPreview,
    markStatus,
    hqUrl: hqBaseUrl(),
    previewDomain: previewDomain(),
    ttlMs: PREVIEW_TTL_MS,
  })
}

// ── resolve_git_credential (data-path forward for site's git-credential endpoint) ──

interface ResolveGitCredentialArgs {
  agentId?: string
  ownerType: WorkspaceOwnerType
  ownerId: string
  workspaceId: string | null
  owner: string
  repo: string
}

export async function resolveGitCredentialOp(ctx: CallerContext, args: ResolveGitCredentialArgs) {
  if (ctx.kind !== 'run') throw new ControlPlaneError('forbidden', 'resolve_git_credential requires an agent-run capability')
  const agentId = actingAgentId(ctx, args.agentId)
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { isKernel: true } })
  if (!agent) throw new ControlPlaneError('not_found', `Unknown agent: ${agentId}`)

  if (!agent.isKernel) {
    try {
      await assertRunCanAccessOwner(ctx, {
        ownerType: args.ownerType,
        ownerId: args.ownerId,
        workspaceId: args.workspaceId,
      })
    } catch (e) {
      // assertRunCanAccessOwner throws a plain Error — translate to
      // ControlPlaneError('forbidden') so dataApi.ts maps it to a 403 with
      // the real reason, not a generic 500 (its default for an un-typed throw).
      throw new ControlPlaneError('forbidden', e instanceof Error ? e.message : String(e))
    }
  }

  const token = await getTokenFor({ owner: args.owner, name: args.repo })
  return { username: 'x-access-token', password: token }
}

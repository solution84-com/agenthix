/**
 * The agent's package tools (adr-0170), served by the site because they act in a container here. Offered to every
 * code-work run, and authorised by what the site itself holds, never by who the run acts for:
 *
 * - **A run whose verified capability names a live preview** installs in the live preview's container: the live
 *   preview must be the one the claim names, here, running, and the calling run going on its branch. A person is asked
 *   on the live preview's strip.
 * - **Any other code-work run** installs in its own container, in its branch's copy, as the site recorded them when
 *   the run started. A person is asked with a card in the branch's task thread or conversation.
 *
 * - `install_packages`: installs with scripts off, then runs the scripts of the packages that pass the rule.
 * - `ask_to_use_package`: for a package the rule blocked, when the agent found no other: a person is asked in HQ, and
 *   their yes is their own.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { livePreviewCapabilityMismatch, type CapabilityLivePreview } from '@agenthix/core'
import type { RunContext } from '../../agents/runtime/types'
import { execInAgentContainer } from '../livePreviews/container/exec'
import { InstallInputProblem } from '../livePreviews/installs/installCommand'
import { installInPreview, installReportText, type InstallDeps, type InstallTarget } from '../livePreviews/installs/previewInstall'
import { packageFacts } from '../livePreviews/installs/registryFacts'
import { askPerson, askPersonInCopy, branchKey, copyKey, type CopyPlace } from '../livePreviews/installs/packages'
import { installRuntime, type HeldPreview, type InstallRuntime } from '../livePreviews/installs/installSeam'
import { maskPreviewText } from '../livePreviews/secrets/previewMasks'

export const INSTALL_PACKAGES_TOOL = 'install_packages'
export const ASK_TO_USE_PACKAGE_TOOL = 'ask_to_use_package'

export type PreviewInstallToolsOptions = {
  claim: CapabilityLivePreview | null
  /** The organisation's trusted npm scopes, as the run's verified capability carries them (`parseCapabilityPackageScopes`). */
  trustedPackageScopes: readonly string[]
  runId: string | null
  /** The calling turn's context, only while it runs: a code-work run's copy and container. */
  context?: RunContext | null
}

const text = (t: string, isError = false) => ({ content: [{ type: 'text' as const, text: t }], ...(isError ? { isError: true as const } : {}) })

/** The live preview this call acts in, checked now, with the calling run going on its branch; or what to tell the agent. */
export async function callersPreview(claim: CapabilityLivePreview | null, runtime: InstallRuntime | null, runId: string | null): Promise<HeldPreview | string> {
  if (!claim) return 'Packages are installed this way only in a live preview. Ask the person to open one on this branch.'
  if (!runtime) return 'This site runs no live previews. Nothing was installed.'
  const held = await runtime.previewById(claim.livePreviewId)
  const mismatch = livePreviewCapabilityMismatch(claim, held && { livePreviewId: held.id, workspaceId: held.workspaceId, branch: held.branch, stopped: held.stopped })
  if (mismatch || !held) return `This run cannot work in the live preview: ${mismatch ?? 'it is not on this site'}. Nothing was installed.`
  if (!held.running) return 'The live preview is paused, so nothing runs in it until it is resumed. Nothing was installed.'
  if (!runId || !runtime.runGoing(held.workspaceId, held.branch, runId)) {
    return 'Packages are installed and asked about only by a run going on this live preview\'s branch, and none is. Nothing was installed.'
  }
  return held
}

/** Where an install runs: a live preview, or the run's own container in its branch's copy. */
export type InstallPlace =
  | { kind: 'preview'; target: HeldPreview; exec: InstallDeps['exec'] }
  | { kind: 'copy'; target: InstallTarget; copy: CopyPlace; runId: string; exec: InstallDeps['exec'] }

export type InstallPlaceDeps = {
  runtime: InstallRuntime | null
  execInContainer: typeof execInAgentContainer
}

const realPlaceDeps = (): InstallPlaceDeps => ({ runtime: installRuntime(), execInContainer: execInAgentContainer })

/** The place this call acts in, checked now; or what to tell the agent. */
export async function callersPlace(opts: PreviewInstallToolsOptions, deps: InstallPlaceDeps = realPlaceDeps()): Promise<InstallPlace | string> {
  if (opts.claim) {
    const held = await callersPreview(opts.claim, deps.runtime, opts.runId)
    if (typeof held === 'string' || !deps.runtime) return typeof held === 'string' ? held : 'This site runs no live previews. Nothing was installed.'
    return { kind: 'preview', target: { ...held, branchKey: branchKey(held.workspaceId, held.branch) }, exec: deps.runtime.exec }
  }
  const ctx = opts.context ?? null
  if (!ctx?.codeWork || !opts.runId || ctx.runId !== opts.runId) {
    return 'Packages are installed this way only by a run working on a branch of a code workspace. Nothing was installed.'
  }
  const { containerName } = ctx
  if (!containerName) return 'This run has no container, so packages are not installed this way here. Nothing was installed.'
  const target: InstallTarget = {
    id: copyKey(ctx.codeWork.copyId), root: ctx.cwd, branchKey: branchKey(ctx.codeWork.workspace.workspaceId, ctx.codeWork.branch),
  }
  return {
    kind: 'copy', target, runId: ctx.runId,
    copy: { workspace: ctx.codeWork.workspace, copyId: ctx.codeWork.copyId, branch: ctx.codeWork.branch },
    exec: (t, argv, o) => deps.execInContainer(containerName, t.root, argv, o),
  }
}

const installing = new Set<string>()

/** What an install in this place runs with: the place's own container, and the scopes the run's capability trusts. */
export function installDeps(place: InstallPlace, trustedPackageScopes: readonly string[]): InstallDeps {
  return {
    exec: place.exec,
    facts: (name, version) => packageFacts(name, version),
    trustedScopes: async () => trustedPackageScopes,
    now: Date.now,
  }
}

/** Whom the agent is told will be asked, in the words the place uses. */
function askedWhere(place: InstallPlace): string {
  return place.kind === 'preview' ? 'on the live preview in HQ' : 'with a card in this branch\'s conversation in HQ'
}

export function registerPreviewInstallTools(server: McpServer, opts: PreviewInstallToolsOptions, deps?: InstallPlaceDeps): void {
  server.tool(
    INSTALL_PACKAGES_TOOL,
    'Install npm packages in your working folder. Use it instead of running npm, pnpm or yarn install yourself: ' +
      'packages install with their install scripts off, then the scripts of well-known, widely used packages run. ' +
      'A package whose script is blocked is listed with the reason: look for another package that does the same job.',
    {
      folder: z.string().max(500).optional().describe('The folder with the package.json, relative to your working folder. Default: "."'),
      manager: z.enum(['npm', 'pnpm', 'yarn']).optional().describe('The package manager the project uses: npm, pnpm or yarn. Default: npm.'),
      packages: z.array(z.string().max(300)).max(50).optional().describe('Packages to add, such as "zod" or "zod@3". Leave it out to install what package.json lists.'),
      dev: z.boolean().optional().describe('Add the packages as development dependencies.'),
    },
    async ({ folder, manager, packages, dev }: { folder?: string; manager?: 'npm' | 'pnpm' | 'yarn'; packages?: string[]; dev?: boolean }) => {
      const place = await callersPlace(opts, deps)
      if (typeof place === 'string') return text(place, true)
      const key = place.target.id
      if (installing.has(key)) return text('Another install is running in this working copy. Wait for it to finish, then try again.', true)
      installing.add(key)
      try {
        const input = { folder: folder ?? '.', manager: manager ?? 'npm', packages: packages ?? [], dev: dev ?? false }
        const report = await installInPreview(place.target, input, installDeps(place, opts.trustedPackageScopes))
        // In a live preview's container, which may hold secrets a workflow handed it, the report is masked.
        const said = installReportText(report)
        return text(place.kind === 'preview' ? await maskPreviewText(place.target.id, said) : said, !report.installed)
      } catch (err) {
        if (err instanceof InstallInputProblem) return text(`${err.message} Nothing was installed.`, true)
        return text(`The install could not be run: ${err instanceof Error ? err.message : String(err)}`, true)
      } finally {
        installing.delete(key)
      }
    },
  )

  server.tool(
    ASK_TO_USE_PACKAGE_TOOL,
    'Ask a person whether a package whose install script install_packages blocked may run it. Only use it when you ' +
      'looked for another package and there is none. The person sees the risk and decides; you cannot decide for them.',
    {
      name: z.string().max(214).describe('The blocked package\'s name, as install_packages listed it.'),
      version: z.string().max(256).describe('The blocked package\'s version, as install_packages listed it.'),
    },
    async ({ name, version }: { name: string; version: string }) => {
      const place = await callersPlace(opts, deps)
      if (typeof place === 'string') return text(place, true)
      const asked = place.kind === 'preview'
        ? askPerson(place.target.id, opts.runId, name, version)
        : askPersonInCopy(place.copy, place.runId, name, version)
      if (!asked) return text(`${name}@${version} was not blocked here. Only a package install_packages blocked in this working copy can be asked about.`, true)
      return text(`A person has been asked ${askedWhere(place)}: "${asked.question}" If they allow it, call install_packages again with the same folder to run its install script. If they do not, carry on without it.`)
    },
  )
}

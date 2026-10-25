/**
 * The library's calls to the site that holds a place's storage: reading a proposal's files, and stopping a run when
 * its workflow is turned off. Nothing here checks who may do it; callers have.
 *
 * A site from before the executor answers `workflow.readFiles` with a refusal and `workflow.stop` with nothing
 * stopped; one from before site protocol 1.4 doesn't know the methods at all. Both are told apart from an
 * unreachable site, so a person is told which it is.
 */
import {
  WORKFLOW_RUN_METHODS,
  type WorkflowReadFilesResult,
  type WorkflowRunWorkspace,
  type WorkflowStopParams,
} from '@agenthix/core'
import { siteChannelRegistry, ChannelRequestFailed } from '../sites/channel'

const TRANSPORT_FAILURES = new Set(['offline', 'timeout', 'disconnected'])

export type SiteCalls = {
  readFiles(siteId: string, workspace: WorkflowRunWorkspace, paths: string[]): Promise<WorkflowReadFilesResult>
  stop(siteId: string, params: WorkflowStopParams): Promise<{ stopped: boolean; reached: boolean }>
}

export const siteCalls: SiteCalls = {
  async readFiles(siteId, workspace, paths) {
    try {
      return await siteChannelRegistry.request(siteId, WORKFLOW_RUN_METHODS.readFiles, { workspace, paths })
    } catch (err) {
      const unreachable = err instanceof ChannelRequestFailed && TRANSPORT_FAILURES.has(err.code)
      return {
        ok: false,
        reason: 'workspace_missing',
        path: null,
        message: unreachable
          ? 'The Execution Site that holds this workspace can\'t be reached; try again once it is back. Nothing was changed.'
          : 'The Execution Site that holds this workspace can\'t read workflow files yet; it needs upgrading. Nothing was changed.',
      }
    }
  },

  async stop(siteId, params) {
    try {
      const answer = await siteChannelRegistry.request(siteId, WORKFLOW_RUN_METHODS.stop, params)
      return { stopped: answer?.stopped === true, reached: true }
    } catch {
      return { stopped: false, reached: false }
    }
  },
}

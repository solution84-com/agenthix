import { describe, expect, it } from 'vitest'
import type { SiteContentMethodName, SiteMethodName } from '../siteMethods.js'
import type { SiteEventName } from '../channelMessages.js'
import { SITE_DATA_METHODS } from '../siteData.js'
import { RUNTIME_METHODS } from '../runtimeData.js'
import { MEMBERSHIP_METHODS } from '../membership.js'
import { PACKAGE_METHODS } from '../packages.js'
import { LOCATION_FILE_METHODS } from '../locationFiles.js'
import { REPO_WORK_METHODS } from '../repoWork.js'
import { PREVIEW_METHODS } from '../preview.js'
import { SITE_DIAGNOSTICS_METHODS } from '../siteDiagnostics.js'
import { SITE_RESTORE_METHODS } from '../siteRestore.js'
import { SITE_HQ_ADDRESS_METHOD } from '../hqAddress.js'
import { CLAUDE_LOGIN_METHODS } from '../claudeLogin.js'
import { SESSION_PATCH_EVENT, RUN_WAITING_EVENT } from '../runtimeEvents.js'
import { SITE_HEALTH_EVENT } from '../siteHealth.js'
import { SCHEDULED_CHANGE_EVENT } from '../../host/scheduledChange.js'
import { WORKFLOW_RESULT_EVENT, WORKFLOW_RUN_METHODS, WORKFLOW_STEP_EVENT } from '../workflowRuns.js'

// The lists are checked against the maps' names by type, so a name the map has and a list lacks, or the other way
// round, fails the typecheck (`npm test` runs it first); the runtime checks below hold every method constant to them.
const CONTROL_LIST = [
  'site.describe', SITE_HQ_ADDRESS_METHOD,
  ...Object.values(SITE_DATA_METHODS), ...Object.values(RUNTIME_METHODS), ...Object.values(MEMBERSHIP_METHODS),
  PACKAGE_METHODS.missing, ...Object.values(REPO_WORK_METHODS), PREVIEW_METHODS.start, PREVIEW_METHODS.stop,
  LOCATION_FILE_METHODS.listFiles, LOCATION_FILE_METHODS.statFile, LOCATION_FILE_METHODS.seedFiles,
  LOCATION_FILE_METHODS.ensureDir, LOCATION_FILE_METHODS.removeLocation, LOCATION_FILE_METHODS.listArtefacts,
  LOCATION_FILE_METHODS.listKnowledge, LOCATION_FILE_METHODS.searchKnowledge,
  ...Object.values(SITE_DIAGNOSTICS_METHODS), ...Object.values(SITE_RESTORE_METHODS), ...Object.values(CLAUDE_LOGIN_METHODS),
  ...Object.values(WORKFLOW_RUN_METHODS),
] as const
type Listed = (typeof CONTROL_LIST)[number]
const listsEveryMethod: [Exclude<SiteMethodName, Listed>] extends [never] ? true : never = true
const listsNoOther: [Exclude<Listed, SiteMethodName>] extends [never] ? true : never = true
void [listsEveryMethod, listsNoOther]
const CONTROL = new Set<string>(CONTROL_LIST)

const CONTENT: Record<SiteContentMethodName, true> = {
  'packages.put': true, 'location.readFile': true, 'location.readArtefact': true, 'location.readKnowledge': true,
  'preview.connect': true,
}

const EVENTS: Record<SiteEventName, true> = {
  'run.status': true, 'run.stream': true, 'site.credentialHealth': true, 'site.subscriptionRefreshed': true,
  [SESSION_PATCH_EVENT]: true, [RUN_WAITING_EVENT]: true, [SITE_HEALTH_EVENT]: true, [SCHEDULED_CHANGE_EVENT]: true,
  [WORKFLOW_STEP_EVENT]: true, [WORKFLOW_RESULT_EVENT]: true,
}

const EVERY_METHOD_CONSTANT = [
  SITE_DATA_METHODS, RUNTIME_METHODS, MEMBERSHIP_METHODS, PACKAGE_METHODS, LOCATION_FILE_METHODS, REPO_WORK_METHODS,
  PREVIEW_METHODS, SITE_DIAGNOSTICS_METHODS, SITE_RESTORE_METHODS, CLAUDE_LOGIN_METHODS, WORKFLOW_RUN_METHODS,
].flatMap(group => Object.values(group) as string[]).concat(SITE_HQ_ADDRESS_METHOD)

describe('the site connection declared whole @SC-1128', () => {
  it('declares every method a constant names, once: on the control channel or the content transport', () => {
    for (const method of EVERY_METHOD_CONSTANT) {
      const served = [CONTROL.has(method), method in CONTENT].filter(Boolean)
      expect(served, method).toHaveLength(1)
    }
  })

  it('declares no method that no constant names but site.describe', () => {
    const named = new Set(EVERY_METHOD_CONSTANT)
    const unnamed = [...CONTROL, ...Object.keys(CONTENT)].filter(m => !named.has(m))
    expect(unnamed).toEqual(['site.describe'])
  })

  it('declares each event a site sends', () => {
    expect(Object.keys(EVENTS).sort()).toEqual([
      'run.status', 'run.stream', 'run.waiting', 'session.patch', 'site.credentialHealth', 'site.health',
      'site.scheduledChange', 'site.subscriptionRefreshed', 'workflow.result', 'workflow.step',
    ])
  })
})

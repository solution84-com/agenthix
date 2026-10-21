/**
 * What a site receives when it is admitted: the lasting machine credential (spec §3). A site is admitted when a
 * fleet admin adds it in the Fleet Console; hq stores only a hash of the credential, so it is not
 * recoverable after the response that carried it.
 */

/** Display prefix, so a value's kind is obvious wherever it is logged or pasted. */
export const MACHINE_CREDENTIAL_PREFIX = 'smc'

/** hq's response. `machineCredential` is the only time the raw value exists outside the site. */
export interface SiteRegisterResponse {
  ok: true
  executionSiteId: string
  orgId: string
  hqUrl: string
  hqWsUrl: string
  machineCredential: string
}

/** A site leaving its hq, authenticated by its own machine credential. */
export const SITE_LEAVE_PATH = '/api/v1/sites/leave'

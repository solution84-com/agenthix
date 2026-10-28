/** Where a row leads. The asset's page, Add and the editor are other lanes' screens; the paths are named once here. */
export const LIBRARY_PATH = '/library'
export const libraryAssetPath = (assetId: string) => `/library/${encodeURIComponent(assetId)}`
export const libraryProposalPath = (proposalId: string) => `/library/proposals/${encodeURIComponent(proposalId)}`
export const LIBRARY_ADD_PATH = '/library/add'
export const LIBRARY_NEW_SKILL_PATH = '/library/new-skill'
export const LIBRARY_MARKETPLACE_PATH = '/library/marketplace'
export const LIBRARY_SETTINGS_PATH = '/admin/settings/library'
/** New skill for a place (and an agent's folder in it): the same screen, told where the skill goes. */
export const libraryNewPlaceSkillPath = (projectId: string, agentId?: string) =>
  `${LIBRARY_NEW_SKILL_PATH}?place=${encodeURIComponent(projectId)}${agentId ? `&agent=${encodeURIComponent(agentId)}` : ''}`
/** A place skill's draft in the editor. */
export const libraryPlaceSkillPath = (placeSkillId: string) => `/library/place-skills/${encodeURIComponent(placeSkillId)}`
/** A team template's review, with no task behind it: the administrator chooses what to make and applies it. */
export const libraryUseTeamPath = (assetId: string) => `/workforce-templates/review?templateId=${encodeURIComponent(assetId)}`

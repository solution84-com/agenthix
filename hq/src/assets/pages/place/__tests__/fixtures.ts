import type { PlaceSkillView, PlaceSkillsData } from '../placeSkillsModel'

export const skill = (over: Partial<PlaceSkillView> = {}): PlaceSkillView => ({
  id: 's1', path: '.agents/skills/release-checklist', name: 'release-checklist', description: 'Steps before tagging a release.',
  group: 'PLACE', agentId: null, workspaceId: null, fingerprint: 'f1', state: 'on', switch: 'ON', switchHolds: true, switchedBy: null, switchedAt: null,
  status: 'published', version: 3, newestVersion: 3, draftRevision: null, gone: false, setAsideReason: null, lastSeenAt: null, origin: null, libraryUpdate: null, ...over,
})

export const MAY_ALL: PlaceSkillsData['may'] = { editDraft: true, publish: true, rollBack: true, remove: true, install: true, settings: true }
export const MAY_NONE: PlaceSkillsData['may'] = { editDraft: false, publish: false, rollBack: false, remove: false, install: false, settings: false }

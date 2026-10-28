import type { LibraryAssetRow } from '../../assetList/types'

export const row = (over: Partial<LibraryAssetRow>): LibraryAssetRow => ({
  key: 'a1', assetId: 'a1', proposalId: null, kind: 'skill', title: 'Code Review', description: '', identity: 'agenthix/dev-code-review',
  version: '1.3.0', signer: 'Signed by Agenthix', has: 'Every agent has it', builtIn: false, switchedOff: false, statuses: [],
  updateTo: null, draftBy: null, proposedBy: null, setAsideFor: null, ...over,
})

export const SAMPLE: LibraryAssetRow[] = [
  row({ key: 's1', assetId: 's1', title: 'Code Review', statuses: ['update'], updateTo: '1.4.0' }),
  row({ key: 's2', assetId: 's2', title: 'Release Notes', identity: 'fernhill/release-notes', signer: 'Made here', has: 'Ada has it', statuses: ['draft'], draftBy: 'Sam' }),
  row({ key: 's3', assetId: 's3', title: 'SEO Audit', identity: 'acme/seo-audit', signer: 'Signed by Acme (github.com/acme)', has: 'No agent has it yet', statuses: ['noAgent'] }),
  row({ key: 'a1', assetId: 'a1', kind: 'agent', title: 'Project manager', identity: 'agenthix/project-manager', has: '1 agent made from it' }),
  row({ key: 'b1', assetId: 'b1', kind: 'board', title: 'Sprint board', identity: 'agenthix/sprint-board', has: 'Used by 2 projects' }),
  row({ key: 's4', assetId: 's4', title: 'Legal Review', identity: 'unsigned/legal-review', signer: 'Unsigned', statuses: ['unsigned'] }),
  row({ key: 'proposal:p1', assetId: null, proposalId: 'p1', title: 'Accessibility Check', identity: 'accessibility-check', has: 'Proposed for the organisation', version: null, statuses: ['waiting'], proposedBy: 'Proposed by Ada for Avery Chen' }),
  row({ key: 's5', assetId: 's5', title: 'Code Review', identity: 'agenthix/code-review', statuses: ['setAside'], setAsideFor: 'fernhill/code-review' }),
]

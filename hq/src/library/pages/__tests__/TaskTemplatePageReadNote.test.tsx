// @vitest-environment jsdom
/** A task template's page draws the asset read's Not up to date line in its body (C3). */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('wasp/client/operations', () => ({ useQuery: () => ({ data: undefined }), useAction: () => vi.fn() }))
vi.mock('../../../shared/layouts/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('../../../shared/layouts/TopBar', () => ({ BackButton: () => null, TopBar: () => null, TopBarTitle: () => null }))
vi.mock('../../../org/components/menus', () => ({ MoreMenu: () => null }))
vi.mock('../../../shared/hooks/useIsAdmin', () => ({ useIsAdmin: () => true }))
vi.mock('../../../assets/pages/asset/dialogs/RemoveDialog', () => ({ RemoveDialog: () => null }))
vi.mock('../../../assets/pages/asset/sections/AboutSection', () => ({ AboutSection: () => null }))
vi.mock('../../../assets/pages/asset/sections/VersionsSection', () => ({ VersionsSection: () => null }))
vi.mock('../../../assets/pages/asset/sections/WhoCanEdit', () => ({ WhoCanEdit: () => null }))
vi.mock('../../components/useLibraryTransfer', () => ({ useLibraryTransfer: () => ({ dialog: null, exportOne: vi.fn() }) }))
vi.mock('../../components/AddToProjectDialog', () => ({ AddToProjectDialog: () => null }))
vi.mock('../../components/TaskTemplateHolds', () => ({ TaskTemplateHolds: () => null }))

import { TaskTemplatePage } from '../TaskTemplatePage'

afterEach(cleanup)
const page = { assetId: 'a1', kind: 'task-template', title: 'Bug triage', description: 'Triage.', identity: 'fernhill/bug-triage', version: '1.0.0', builtIn: false, unsigned: false, signedBy: 'Made here', madeFrom: [], holds: null, can: { remove: true } } as never

describe('TaskTemplatePage @SC-1910 @SC-1929', () => {
  it('draws the read note it is given', () => {
    render(<MemoryRouter><TaskTemplatePage page={page} onChanged={vi.fn()} readNote={<p>Not up to date · read 10:00 ·</p>} /></MemoryRouter>)
    expect(screen.getByText(/Not up to date/)).toBeTruthy()
  })
})

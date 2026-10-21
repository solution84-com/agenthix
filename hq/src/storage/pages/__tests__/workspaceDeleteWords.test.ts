import { describe, it, expect } from 'vitest'
import { workspaceDeleteConfirm } from '../workspaceDeleteWords'

describe('what a workspace delete says it loses', () => {
  it('says plainly when nothing is backed up', () => {
    expect(workspaceDeleteConfirm(null, { hasFiles: true })).toBe('Delete — its files are not on GitHub, so they go with it')
  })
  it('says unpushed files go, when a repository is connected', () => {
    expect(workspaceDeleteConfirm('https://github.com/acme/web', { hasFiles: true })).toMatch(/not yet pushed to GitHub go with it; the repository is not affected/)
  })
  it('does not alarm for an empty workspace, and hedges while the site has not answered', () => {
    expect(workspaceDeleteConfirm('https://github.com/acme/web', { hasFiles: false })).toBe('Delete — it holds no files')
    expect(workspaceDeleteConfirm('https://github.com/acme/web', null)).toMatch(/^Delete — any files not yet pushed/)
    expect(workspaceDeleteConfirm(null, null)).toMatch(/^Delete — any files it holds are not on GitHub/)
  })
})

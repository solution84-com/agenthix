/**
 * `WorkspaceService`'s path derivation and its containment refusal. These cases
 * moved here from hq's own suite when hq's copy of the class went: the class is
 * site's alone now, and site is where its callers are — the memory sweep, the
 * workspace lock, the run's own tool registry and the location containment
 * check.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { WorkspaceService } from '../agentDiskPaths'
import path from 'node:path'

describe('WorkspaceService Security & Isolation @SC-139', () => {
  const originalSiteRoot = process.env.SITE_ROOT

  afterEach(() => {
    if (originalSiteRoot !== undefined) {
      process.env.SITE_ROOT = originalSiteRoot
    } else {
      delete process.env.SITE_ROOT
    }
  })

  describe('getWorkspaceRoot', () => {
    it('returns <site_root>/agents', () => {
      process.env.SITE_ROOT = '/opt/gateway/site'
      expect(WorkspaceService.getWorkspaceRoot()).toBe('/opt/gateway/site/agents')
    })

    it('defaults to <cwd>/site/agents', () => {
      delete process.env.SITE_ROOT
      expect(WorkspaceService.getWorkspaceRoot()).toBe(path.join(process.cwd(), 'site', 'agents'))
    })
  })

  describe('validatePath', () => {
    it('resolves and returns valid paths inside root', () => {
      delete process.env.SITE_ROOT
      const root = WorkspaceService.getWorkspaceRoot()
      const target = path.join(root, 'project-a')
      const result = WorkspaceService.validatePath(target)
      expect(result).toBe(target)
    })

    it('blocks access to parent directories (path traversal)', () => {
      delete process.env.SITE_ROOT
      const escapedPath = path.join(WorkspaceService.getWorkspaceRoot(), '..', '..', 'etc')
      expect(() => WorkspaceService.validatePath(escapedPath))
        .toThrow(/Forbidden/)
    })

    it('blocks access to absolute host paths', () => {
      delete process.env.SITE_ROOT
      expect(() => WorkspaceService.validatePath('/etc/passwd'))
        .toThrow(/Forbidden/)
    })
  })

  describe('getVirtualPaths', () => {
    it('calculates virtualPath correctly for root', () => {
      delete process.env.SITE_ROOT
      const root = WorkspaceService.getWorkspaceRoot()
      const result = WorkspaceService.getVirtualPaths(root)
      expect(result.virtualPath).toBe('/')
      expect(result.virtualParentPath).toBe('/')
    })

    it('calculates virtualPath correctly for subfolder', () => {
      delete process.env.SITE_ROOT
      const root = WorkspaceService.getWorkspaceRoot()
      const target = path.join(root, 'subdir')
      const result = WorkspaceService.getVirtualPaths(target)
      expect(result.virtualPath).toBe('subdir')
      expect(result.virtualParentPath).toBe('/')
    })
  })

  describe('Project workspace paths', () => {
    afterEach(() => {
      delete process.env.SITE_ROOT
    })

    it('getProjectsRoot returns <site_root>/projects', () => {
      process.env.SITE_ROOT = '/opt/gateway/site'
      expect(WorkspaceService.getProjectsRoot()).toBe('/opt/gateway/site/projects')
    })
  })
})

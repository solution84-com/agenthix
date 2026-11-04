// @vitest-environment jsdom
/**
 * @SC-287 Project creation from the Product overview tab offers the site picker
 *
 * ProductOverviewTab (from @agenthix/ui/products) renders its own inline
 * "New Project" form rather than CreateProjectModal. Nothing exercised its
 * submit handler, which is how it shipped without a siteId and started
 * failing once hq's createProject action began requiring one. This renders
 * the real component (not a mock) to prove the fix.
 */
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ProductOverviewTab lives in @agenthix/ui, which resolves its own copy of
// lucide-react from ui/node_modules (a separate install from hq's — a known,
// pre-existing dependency-duplication defect in this workspace, not something
// introduced here). Mocking the bare specifier 'lucide-react' only intercepts
// the copy resolved from *this* file; ui/src's own import resolves to a
// different absolute path and needs mocking directly by that path, or the two
// react instances collide and crash with "Invalid hook call" during render.
const uiLucideReactPath = vi.hoisted(() => {
  // `require` is a Vitest-provided global inside test files (vite-node's CJS
  // interop) — used here instead of `createRequire(import.meta.url)` because
  // vi.hoisted() runs before this file's own ESM imports are initialized.
  const uiEntry = require.resolve('@agenthix/ui/products')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => ({ ...(await importOriginal<object>()), Plus: () => null }))

import { ProductOverviewTab } from '@agenthix/ui/products'
import type { ProductDetail } from '@agenthix/ui/products'

const product: ProductDetail = {
  id: 'prod-1',
  name: 'Product One',
  slug: 'product-one',
  description: null,
  status: 'active',
  projectCount: 0,
  visionStatement: null,
  projects: [],
}

const sites = [
  { siteId: 's1', name: 'Site One', status: 'ONLINE' },
  { siteId: 's2', name: 'Site Two', status: 'ONLINE' },
]

describe('ProductOverviewTab — site picker on project creation @SC-287', () => {
  it('passes the chosen siteId to actions.createProject', async () => {
    const createProject = vi.fn().mockResolvedValue(undefined)
    render(
      <ProductOverviewTab
        product={product}
        allProjects={[]}
        actions={{ createProject, assignProject: vi.fn() }}
        sites={sites}
      />,
    )

    fireEvent.click(screen.getByText('New'))
    fireEvent.change(screen.getByPlaceholderText('Project name'), { target: { value: 'A New Project' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 's2' } })

    const form = screen.getByText('New Project').closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith(
        expect.objectContaining({ siteId: 's2', productId: 'prod-1', name: 'A New Project' }),
      )
    })
  })

  it('refuses to submit without a site rather than sending a request that will fail', async () => {
    const createProject = vi.fn().mockResolvedValue(undefined)
    render(
      <ProductOverviewTab
        product={product}
        allProjects={[]}
        actions={{ createProject, assignProject: vi.fn() }}
        sites={[]}
      />,
    )

    fireEvent.click(screen.getByText('New'))
    fireEvent.change(screen.getByPlaceholderText('Project name'), { target: { value: 'A New Project' } })

    const form = screen.getByText('New Project').closest('form')!
    fireEvent.submit(form)

    await waitFor(() => {
      expect(screen.getByText('Pick a site to create the project on')).toBeTruthy()
    })
    expect(createProject).not.toHaveBeenCalled()
  })
})

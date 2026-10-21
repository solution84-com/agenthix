// @vitest-environment jsdom
/**
 * @SC-222 ResponsiveRows — responsive card-stack / table pattern
 *
 * Below lg (isMobile = true):  renders stacked cards (no <table> element).
 * At lg+ (isMobile = false):   renders a <table> with thead + tbody rows.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// --- Module mocks (must precede imports of the module under test) ---

// useIsMobile — controlled per test via the factory below
let mockIsMobileValue = false
vi.mock('../../hooks/useIsMobile', () => ({
  useIsMobile: () => mockIsMobileValue,
}))

// Import AFTER all vi.mock declarations
import { ResponsiveRows } from '../ResponsiveRows'
import type { Column } from '../ResponsiveRows'

// --- Test fixtures ---

type TestRow = { id: string; name: string; role: string; joined: string }

const columns: Column<TestRow>[] = [
  { key: 'name',   header: 'Name',   render: row => row.name },
  { key: 'role',   header: 'Role',   render: row => row.role },
  { key: 'joined', header: 'Joined', render: row => row.joined },
]

const rows: TestRow[] = [
  { id: 'r1', name: 'Alice',   role: 'Admin',    joined: '2024-01-01' },
  { id: 'r2', name: 'Bob',     role: 'Operator', joined: '2024-06-15' },
]

// --- Tests ---

describe('ResponsiveRows @SC-222', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders cards (no <table>) when isMobile is true', () => {
    mockIsMobileValue = true
    const { container } = render(
      <ResponsiveRows<TestRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
      />
    )

    // No <table> element should exist
    expect(container.querySelector('table')).toBeNull()

    // Each card repeats column headers — use getAllByText for headers shared across cards.
    // Two cards means two "Name", "Role", "Joined" labels.
    expect(screen.getAllByText('Name').length).toBe(2)
    expect(screen.getAllByText('Role').length).toBe(2)
    expect(screen.getAllByText('Joined').length).toBe(2)

    // Row values are unique across the fixture
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Admin')).toBeTruthy()
    expect(screen.getByText('2024-01-01')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.getByText('Operator')).toBeTruthy()
    expect(screen.getByText('2024-06-15')).toBeTruthy()
  })

  it('renders a <table> with both rows when isMobile is false', () => {
    mockIsMobileValue = false
    const { container } = render(
      <ResponsiveRows<TestRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
      />
    )

    // A <table> must exist
    expect(container.querySelector('table')).toBeTruthy()

    // Headers in thead
    expect(screen.getByText('Name')).toBeTruthy()
    expect(screen.getByText('Role')).toBeTruthy()
    expect(screen.getByText('Joined')).toBeTruthy()

    // Row values in tbody
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.getByText('Admin')).toBeTruthy()
    expect(screen.getByText('Operator')).toBeTruthy()
  })
})

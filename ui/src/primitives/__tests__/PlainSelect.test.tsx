import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PlainSelect } from '../PlainSelect'

afterEach(cleanup)

describe('PlainSelect, a picker with no box @SC-1901', () => {
  it('is a select named by its label, and a choice reaches onChange', () => {
    const onChange = vi.fn()
    render(<PlainSelect aria-label="Maker" value="a" onChange={onChange}><option value="a">A</option><option value="b">B</option></PlainSelect>)
    fireEvent.change(screen.getByRole('combobox', { name: 'Maker' }), { target: { value: 'b' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('draws no box and no field fill', () => {
    render(<PlainSelect aria-label="Maker" defaultValue="a"><option value="a">A</option></PlainSelect>)
    const cls = screen.getByRole('combobox').className
    expect(cls).toContain('bg-transparent')
    expect(cls).not.toMatch(/\bborder\b/)
  })

  it('can be disabled', () => {
    render(<PlainSelect aria-label="Maker" disabled defaultValue="a"><option value="a">A</option></PlainSelect>)
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true)
  })
})

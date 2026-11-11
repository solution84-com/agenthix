// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { useFloatingRoom } from '../useFloatingRoom'

function Block() {
  const { ref } = useFloatingRoom()
  return <div ref={ref} data-testid="block" />
}

afterEach(() => { cleanup() })

describe('useFloatingRoom toast placement', () => {
  it('tells the toast host where the docked column is, and lets go on unmount', () => {
    const root = document.documentElement
    Object.defineProperty(root, 'clientWidth', { configurable: true, value: 1000 })
    const proto = HTMLElement.prototype
    const height = Object.getOwnPropertyDescriptor(proto, 'offsetHeight')
    Object.defineProperty(proto, 'offsetHeight', { configurable: true, value: 80 })
    proto.getBoundingClientRect = () => ({ left: 600, right: 1000, width: 400, height: 80, top: 0, bottom: 80, x: 600, y: 0, toJSON: () => ({}) })
    const { unmount } = render(<Block />)
    expect(root.style.getPropertyValue('--toast-offset')).toBe('80px')
    expect(root.style.getPropertyValue('--toast-left')).toBe('600px')
    expect(root.style.getPropertyValue('--toast-right')).toBe('0px')
    unmount()
    expect(root.style.getPropertyValue('--toast-left')).toBe('')
    expect(root.style.getPropertyValue('--toast-right')).toBe('')
    if (height) Object.defineProperty(proto, 'offsetHeight', height)
  })
})

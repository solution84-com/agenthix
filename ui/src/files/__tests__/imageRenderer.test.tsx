import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { FileFrame } from '../FileFrame'
import { MB, PREVIEW, ready } from './testKit'

afterEach(() => vi.unstubAllGlobals())

const open = (over: { size?: number; name?: string; mode?: 'opened' | 'embedded' } = {}) => {
  const name = over.name ?? 'chart.png'
  return (
    <FileFrame
      answer={ready({ name, kind: 'image', contentType: 'image/png', size: over.size ?? 2048 })}
      name={name} mode={over.mode} onReopen={() => {}}
    />
  )
}
const loaded = (img: HTMLElement, width: number, height: number) => {
  Object.defineProperty(img, 'naturalWidth', { value: width, configurable: true })
  Object.defineProperty(img, 'naturalHeight', { value: height, configurable: true })
  fireEvent.load(img)
}

describe('the image renderer, end to end through the frame @SC-1589', () => {
  it('draws the file as an image from its preview link, with no referrer @SC-1563', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    render(open())
    const img = screen.getByRole('img', { name: 'chart.png' })
    expect(img.getAttribute('src')).toBe(PREVIEW)
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('puts the pixel size in the facts line once loaded', async () => {
    render(open())
    loaded(screen.getByRole('img'), 800, 600)
    expect(await screen.findByText(/^Image · .* · 800 × 600$/)).toBeTruthy()
  })

  it('leaves the pixel size out when the image has none, as an SVG may not', () => {
    render(open({ name: 'logo.svg' }))
    loaded(screen.getByRole('img'), 0, 0)
    expect(screen.queryByText(/ × /)).toBeNull()
  })

  it('is fitted to the area, and Fit / 100% switches to its own size', () => {
    render(open())
    const img = screen.getByRole('img')
    expect(img.className).toContain('max-w-full')
    // An opened image is as tall as it is: only embedded images are capped.
    expect(img.className).not.toContain('max-h')
    expect(screen.getByRole('tab', { name: 'Fit' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: '100%' }))
    expect(screen.getByRole('tab', { name: '100%' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('img').className).not.toContain('max-w-full')
    expect(screen.getByRole('img').className).toContain('shrink-0')
    fireEvent.click(screen.getByRole('tab', { name: 'Fit' }))
    expect(screen.getByRole('img').className).toContain('max-w-full')
  })

  it('draws an image at its real size at 100%, wider than the view if it is', () => {
    render(open())
    loaded(screen.getByRole('img'), 900, 500)
    fireEvent.click(screen.getByRole('tab', { name: '100%' }))
    expect(screen.getByRole('img').style.width).toBe('900px')
    fireEvent.click(screen.getByRole('tab', { name: 'Fit' }))
    expect(screen.getByRole('img').style.width).toBe('')
  })

  it('centres the image at 100% as it does at Fit', () => {
    render(open())
    fireEvent.click(screen.getByRole('tab', { name: '100%' }))
    expect(screen.getByRole('img').parentElement!.className).toContain('safe_center')
  })

  it('stands on a checkered ground made from a token', () => {
    render(open())
    const ground = screen.getByRole('img').parentElement!
    expect(ground.getAttribute('style')).toContain('var(--color-checker)')
  })

  it('says an image that will not load is unreadable', async () => {
    render(open())
    fireEvent.error(screen.getByRole('img'))
    expect(await screen.findByText("This image can't be drawn, so it isn't shown.")).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('does not load a file over 20 MB, and says it is too large @SC-1571', async () => {
    render(open({ size: 21 * MB }))
    expect(await screen.findByText('Too large to preview (21 MB).')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('embeds with no controls, to 480 px tall', () => {
    render(open({ mode: 'embedded' }))
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.getByRole('img').className).toContain('max-h-[480px]')
  })
})

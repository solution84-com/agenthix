import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import { classify, DEFAULT_GUIDE_BASELINE_URL, diffImages, guideBaselineUrl, lastReleaseTag, renderSummary } from '../compare.mjs'

function solid(width, height, [r, g, b], dots = []) {
  const png = new PNG({ width, height })
  for (let i = 0; i < width * height; i++) {
    png.data[i * 4] = r
    png.data[i * 4 + 1] = g
    png.data[i * 4 + 2] = b
    png.data[i * 4 + 3] = 255
  }
  for (const [x, y] of dots) {
    const at = (y * width + x) * 4
    png.data[at] = png.data[at + 1] = png.data[at + 2] = 0
  }
  return PNG.sync.write(png)
}

describe('diffImages @SC-804 @SC-805', () => {
  it('treats identical images as unchanged', () => {
    expect(diffImages(solid(100, 100, [255, 255, 255]), solid(100, 100, [255, 255, 255])).changed).toBe(false)
  })
  it('ignores a difference of a few pixels', () => {
    const result = diffImages(solid(100, 100, [255, 255, 255]), solid(100, 100, [255, 255, 255], [[1, 1], [50, 50], [90, 20]]))
    expect(result.pixels).toBe(3)
    expect(result.changed).toBe(false)
  })
  it('reports a larger difference as changed', () => {
    const dots = []
    for (let x = 0; x < 100; x++) dots.push([x, 10])
    const result = diffImages(solid(100, 100, [255, 255, 255]), solid(100, 100, [255, 255, 255], dots))
    expect(result.changed).toBe(true)
    expect(result.pixels).toBe(100)
  })
  it('reports different sizes as changed', () => {
    expect(diffImages(solid(100, 100, [255, 255, 255]), solid(100, 120, [255, 255, 255])).changed).toBe(true)
  })
})

describe('classify @SC-804 @SC-806', () => {
  const same = { changed: false, pixels: 0 }
  const different = { changed: true, pixels: 500 }

  it('calls a capture with no earlier release new', () => {
    const result = classify({ captureNames: ['a', 'b'], baselineNames: [], compared: new Map() })
    expect(result.new).toEqual(['a', 'b'])
    expect(result.changed).toEqual([])
    expect(result.removed).toEqual([])
  })
  it('sorts each capture into new, changed or unchanged', () => {
    const compared = new Map([['a', null], ['b', different], ['c', same]])
    const result = classify({ captureNames: ['a', 'b', 'c'], baselineNames: ['b', 'c'], compared })
    expect(result.new).toEqual(['a'])
    expect(result.changed).toEqual(['b'])
    expect(result.unchanged).toEqual(['c'])
  })
  it('calls a baseline name with no capture removed', () => {
    const result = classify({ captureNames: ['a'], baselineNames: ['a', 'gone'], compared: new Map([['a', same]]) })
    expect(result.removed).toEqual(['gone'])
  })
})

describe('lastReleaseTag @SC-806', () => {
  it('returns the tag git describes', () => {
    expect(lastReleaseTag(() => 'v1.2.0\n')).toBe('v1.2.0')
  })
  it('returns null when git finds no release tag', () => {
    expect(lastReleaseTag(() => { throw new Error('No names found') })).toBeNull()
    expect(lastReleaseTag(() => '')).toBeNull()
  })
})

describe('renderSummary @SC-806 @SC-807', () => {
  it('says there is no earlier release', () => {
    const text = renderSummary({ tag: null, result: { new: ['a'], changed: [], removed: [], unchanged: [] }, pixels: new Map() })
    expect(text).toContain('No earlier release')
    expect(text).toContain('`a`')
  })
  it('lists changed, new and removed under the tag', () => {
    const text = renderSummary({
      tag: 'v1.0.0',
      result: { new: ['n'], changed: ['c'], removed: ['r'], unchanged: ['u'] },
      pixels: new Map([['c', 500]]),
    })
    expect(text).toContain('v1.0.0')
    expect(text).toMatch(/Changed \(1\)[\s\S]*`c`[\s\S]*500/)
    expect(text).toMatch(/New \(1\)[\s\S]*`n`/)
    expect(text).toMatch(/Removed \(1\)[\s\S]*`r`/)
    expect(text).toMatch(/1 unchanged/)
  })
})

describe("the released screenshots' address @SC-1152", () => {
  it('is GUIDE_BASELINE_URL, or the website\'s address when it is not set', () => {
    expect(guideBaselineUrl({})).toBe(DEFAULT_GUIDE_BASELINE_URL)
    expect(guideBaselineUrl({ GUIDE_BASELINE_URL: ' ' })).toBe(DEFAULT_GUIDE_BASELINE_URL)
    expect(guideBaselineUrl({ GUIDE_BASELINE_URL: 'https://assets.example/guide/' })).toBe('https://assets.example/guide')
  })
})

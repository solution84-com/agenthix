import { describe, it, expect } from 'vitest'
import { parseImgTag } from '../imgTag'

describe('the sized image tag @SC-1552', () => {
  it('keeps src, alt, width and height', () => {
    expect(parseImgTag('<img src="charts/q3.png" alt="Q3" width="600" height="400">'))
      .toEqual({ src: 'charts/q3.png', alt: 'Q3', width: '600', height: '400' })
    expect(parseImgTag("<IMG SRC='a.png' WIDTH=50% />")).toEqual({ src: 'a.png', width: '50%' })
    expect(parseImgTag('<img src="a&amp;b.png">')).toEqual({ src: 'a&b.png' })
  })

  it.each([
    ['onerror', '<img src="a.png" onerror="alert(1)">'],
    ['style', '<img src="a.png" style="position:fixed;inset:0">'],
    ['srcset', '<img src="a.png" srcset="https://example.org/track.png 2x">'],
    ['class and id', '<img src="a.png" class="x" id="y">'],
    ['an unquoted handler', '<img src=a.png onload=alert(1)>'],
    ['a bare attribute', '<img src="a.png" ismap>'],
  ])('drops %s', (_, html) => {
    expect(parseImgTag(html)).toEqual({ src: 'a.png' })
  })

  it('drops a width or height that is not a number', () => {
    expect(parseImgTag('<img src="a.png" width="100px; background:url(x)" height="auto">')).toEqual({ src: 'a.png' })
  })

  it('keeps the first of a repeated attribute', () => {
    expect(parseImgTag('<img src="a.png" src="https://example.org/b.png">')).toEqual({ src: 'a.png' })
  })

  it.each([
    '<img alt="no source">',
    '<script>alert(1)</script>',
    '<iframe src="https://example.org"></iframe>',
    '<img src="a.png"> and some text',
    '<img src="a.png"><img src="b.png">',
    '<img src="a.png" alt="x > y">',
    '<img src="a.png" "junk">',
    '<imgsrc="a.png">',
    '<svg><img src="a.png"></svg>',
    '<a href="javascript:alert(1)">x</a>',
  ])('leaves %s as text', html => {
    expect(parseImgTag(html)).toBeNull()
  })
})

/**
 * The one piece of HTML Markdown accepts (D23): a sized image tag, `<img src="charts/q3.png" alt="Q3" width="600">`.
 *
 * Raw HTML reaches the renderer as `raw` nodes, which react-markdown shows as text. This plugin turns a raw node that
 * is exactly one `<img>` tag into an `img` element carrying only `src`, `alt`, `width` and `height`; every other
 * attribute (`onerror`, `style`, `srcset`, …) is dropped. Anything else — another tag, a tag with text beside it, a
 * tag this strict reading can't parse — is left raw, so it is still shown as text. Nothing here builds HTML: the
 * element goes through the same URL check and the same `img` component as a Markdown image.
 */

type Props = Record<string, string | number>
type RawNode = { type: 'raw'; value: string }
type ElementNode = { type: 'element'; tagName: string; properties: Props; children: TreeNode[] }
type TreeNode = RawNode | ElementNode | { type: string; children?: TreeNode[] }

export type ImgTag = { src: string; alt?: string; width?: string; height?: string }

const TAG = /^<img(\s[^<>]*?)?\s*\/?>$/i
const ATTRIBUTE = /\s+([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y
const SIZE = /^\d{1,4}%?$/
const KEPT = new Set(['src', 'alt', 'width', 'height'])

const ENTITIES: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', '#39': "'" }
const decode = (v: string) => v.replace(/&(amp|quot|apos|lt|gt|#39);/g, (_, e: string) => ENTITIES[e])

/** The tag's four kept attributes, or null when the text is not exactly one image tag with a `src`. */
export function parseImgTag(html: string): ImgTag | null {
  const m = TAG.exec(html.trim())
  if (!m) return null
  const region = (m[1] ?? '').replace(/\s*\/$/, '')
  const found: Record<string, string> = {}
  ATTRIBUTE.lastIndex = 0
  while (ATTRIBUTE.lastIndex < region.length) {
    const start = ATTRIBUTE.lastIndex
    const a = ATTRIBUTE.exec(region)
    if (!a) return region.slice(start).trim() === '' ? finish(found) : null
    const name = a[1].toLowerCase()
    if (KEPT.has(name) && !(name in found)) found[name] = decode(a[2] ?? a[3] ?? a[4] ?? '')
  }
  return finish(found)
}

function finish(found: Record<string, string>): ImgTag | null {
  if (!found.src) return null
  const tag: ImgTag = { src: found.src }
  if (found.alt !== undefined) tag.alt = found.alt
  if (found.width && SIZE.test(found.width)) tag.width = found.width
  if (found.height && SIZE.test(found.height)) tag.height = found.height
  return tag
}

function imgElement(tag: ImgTag): ElementNode {
  const properties: Props = { src: tag.src }
  if (tag.alt !== undefined) properties.alt = tag.alt
  if (tag.width) properties.width = tag.width
  if (tag.height) properties.height = tag.height
  return { type: 'element', tagName: 'img', properties, children: [] }
}

function walk(node: TreeNode) {
  const children = 'children' in node ? node.children : undefined
  if (!children) return
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (child.type === 'raw') {
      const tag = parseImgTag((child as RawNode).value)
      if (tag) children[i] = imgElement(tag)
    } else walk(child)
  }
}

/** A rehype plugin: sized image tags become image elements; every other raw node is left to be shown as text. */
export function rehypeImgTags() {
  return (tree: TreeNode) => walk(tree)
}

import { BrokenImage, WebImage } from './EmbedParts'

/**
 * An image in Markdown drawn with no place to resolve it in: another website's image waits for Load, so text an agent
 * wrote can't make the viewer's browser send anything out on its own. Anything else is shown as its name.
 */
export function PlainImage({ src, alt, width, height }: { src?: string | Blob; alt?: string; width?: string | number; height?: string | number }) {
  try {
    const url = new URL(typeof src === 'string' ? src : '')
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return <WebImage url={url.href} host={url.hostname} alt={alt} width={width} height={height} />
    }
  } catch { /* not an address: shown as a name */ }
  return <BrokenImage name={alt || 'Image'} />
}

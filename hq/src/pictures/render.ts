/**
 * A recipe drawn into its full WebP and small copy on the server. The recipe is validated here whatever the caller
 * did, so nothing is drawn that the registry would refuse.
 */
import { drawRecipe } from '../shared/pictures/pictures'
import type { PictureContext, PictureKind } from '../shared/pictures/recipe'
import type { PictureFill } from '../shared/pictures/styles/types'
import { PICTURE_SIZES, decode, encodePicture, rasteriseSvg, type EncodedPicture } from './encode'

/** Where the server reads a picture set's files from; the robots' loader supplies it. */
export interface PictureAssets {
  /** The robot's picture (a square image on a transparent background), by its manifest name. */
  robot(name: string): Promise<Buffer>
}

/**
 * How much larger than the circle a robot is drawn, and how far below centre, as fractions of the size: the approved
 * board's placement (boards/picker.html), so the glow under it may be cut a little by the circle's edge.
 */
const ROBOT_ZOOM = 1.16
const ROBOT_DROP = 0.06

export async function renderRecipe(
  raw: unknown,
  kind: PictureKind,
  ctx: PictureContext,
  assets: PictureAssets,
): Promise<EncodedPicture> {
  const drawing = await drawRecipe(raw, kind, ctx)
  const { width, height } = PICTURE_SIZES[kind].full
  if (drawing.type === 'svg') return encodePicture(await rasteriseSvg(drawing.svg, width), kind)
  const robot = await assets.robot(drawing.name)
  return encodePicture(await placeOnBackground(robot, drawing.background, drawing.flip, width, height), kind)
}

function backgroundSvg(fill: PictureFill, width: number, height: number): string {
  const [a, b] = fill.colours
  const paint = b === undefined ? `#${a}` : 'url(#g)'
  const gradient =
    b === undefined
      ? ''
      : `<defs><linearGradient id="g" gradientUnits="objectBoundingBox" gradientTransform="rotate(45 .5 .5)">` +
        `<stop offset="0" stop-color="#${a}"/><stop offset="1" stop-color="#${b}"/></linearGradient></defs>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${gradient}<rect width="100%" height="100%" fill="${paint}"/></svg>`
}

async function placeOnBackground(
  picture: Buffer,
  fill: PictureFill,
  flip: boolean,
  width: number,
  height: number,
): Promise<Buffer> {
  const size = Math.round(width * ROBOT_ZOOM)
  let robot = decode(picture).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  if (flip) robot = robot.flop()
  const left = Math.round((size - width) / 2)
  const top = Math.round((size - height) / 2 - height * ROBOT_DROP)
  const placed = await decode(await robot.png().toBuffer()).extract({ left, top, width, height }).png().toBuffer()
  return decode(Buffer.from(backgroundSvg(fill, width, height)))
    .composite([{ input: placed }])
    .png()
    .toBuffer()
}

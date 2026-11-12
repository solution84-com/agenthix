// The robots bundle's contents, shared by pack.mjs and fetch.mjs: `<name>.webp` for each robot, `manifest.json` and
// `LICENSE`. A robot's name is permanent: it is its file name and its name in every saved recipe (spec, The robots).
import crypto from 'node:crypto'

/** The same rule hq's robots style and loader hold a name to (hq/src/shared/pictures/styles/robots.ts). */
export const ROBOT_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const MANIFEST = 'manifest.json'
export const LICENSE = 'LICENSE'

export const LICENSE_TEXT = `The Agenthix robots

The pictures in this bundle are Agenthix's robot identities, made for Agenthix.
They may be used only as part of Agenthix: shown by an Agenthix installation as
the pictures of its agents, and copied only as part of Agenthix itself.

They are not under the licence of the Agenthix source code, and no other
permission to use, copy, change or share them is given.
`

export const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex')

export const isWebp = (data) =>
  data.length >= 12 && data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP'

/**
 * Checks an unpacked bundle (a Map of file name → bytes) against its pin and its own manifest, and returns the
 * manifest. Throws on anything missing, extra, renamed or changed.
 */
export function checkBundle(files, pin) {
  const raw = files.get(MANIFEST)
  if (!raw) throw new Error(`The bundle has no ${MANIFEST}`)
  if (!files.has(LICENSE)) throw new Error(`The bundle has no ${LICENSE}`)
  const manifest = JSON.parse(raw.toString('utf8'))
  if (manifest.bundle !== pin.bundle || manifest.version !== pin.version) {
    throw new Error(`The bundle is ${manifest.bundle} version ${manifest.version}, not the pinned ${pin.bundle} version ${pin.version}`)
  }
  if (!Array.isArray(manifest.robots) || manifest.robots.length === 0) throw new Error('The manifest lists no robots')
  const expected = new Set([MANIFEST, LICENSE])
  for (const robot of manifest.robots) {
    const { name, file, sha256: digest, bytes } = robot ?? {}
    if (typeof name !== 'string' || !ROBOT_NAME.test(name)) throw new Error(`Not a robot name: ${JSON.stringify(name)}`)
    if (file !== `${name}.webp`) throw new Error(`${name}'s file is not ${name}.webp`)
    if (expected.has(file)) throw new Error(`${name} is listed twice`)
    expected.add(file)
    const data = files.get(file)
    if (!data) throw new Error(`The bundle has no ${file}`)
    if (data.length !== bytes || sha256(data) !== digest) throw new Error(`${file} does not match the manifest`)
    if (!isWebp(data)) throw new Error(`${file} is not a WebP picture`)
  }
  for (const name of files.keys()) if (!expected.has(name)) throw new Error(`The bundle holds ${name}, which the manifest does not list`)
  return manifest
}

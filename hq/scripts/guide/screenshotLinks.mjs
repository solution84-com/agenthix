// The guide's screenshot links. A page, and the root README, show a screenshot by the address of its picture in the
// GitHub Release that holds it: https://github.com/solution84-com/agenthix/releases/download/<tag>/<name>.png. A
// release carries only the screenshots that were new or changed in it, so each link names its own tag
// (docs/guide/README.md, Images). Plain Node, no dependency: Publish release reads the links without an install.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

export const REPOSITORY = 'solution84-com/agenthix'
const DOWNLOADS = `https://github.com/${REPOSITORY}/releases/download`
const LINK = /https:\/\/github\.com\/solution84-com\/agenthix\/releases\/download\/([^/\s)"'<>]+)\/([^/\s)"'<>]+)\.png/g
const VERSION_TAG = /^v\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/

export function screenshotUrl(tag, name) {
  return `${DOWNLOADS}/${tag}/${name}.png`
}

export function isVersionTag(tag) {
  return VERSION_TAG.test(tag)
}

/** Every screenshot link in a page, in order, as { name, tag }: in a Markdown image or an HTML attribute alike. */
export function parseScreenshotLinks(markdown) {
  return [...markdown.matchAll(LINK)].map((match) => ({ name: match[2], tag: match[1] }))
}

/** The names a page still refers to in the form before release addresses, `screenshot:<name>`. */
export function oldFormNames(markdown) {
  return [...markdown.matchAll(/\]\(screenshot:([^\s)"'\]]*)/g)].map((match) => match[1])
}

/** `tagFor` maps a name to the tag its links should name; a name it does not hold keeps its links. */
export function rewriteScreenshotLinks(markdown, tagFor) {
  return markdown.replace(LINK, (link, tag, name) => (tagFor.has(name) ? screenshotUrl(tagFor.get(name), name) : link))
}

/** The pages whose links are read and rewritten, by their path from the repository's root. */
export function isScreenshotPage(path) {
  if (path === 'README.md') return true
  return path.startsWith('docs/guide/') && path.endsWith('.md') && !path.endsWith('/README.md')
}

/** `pageLinks` maps a page to its links. The tag each name is linked to; the first wins (linkProblems reports any other). */
export function tagsByName(pageLinks) {
  const tags = new Map()
  for (const links of pageLinks.values()) for (const { name, tag } of links) if (!tags.has(name)) tags.set(name, tag)
  return tags
}

export function namesLinkedTo(pageLinks, tag) {
  return [...tagsByName(pageLinks)].filter(([, linked]) => linked === tag).map(([name]) => name).sort()
}

export function linkProblems(pageLinks) {
  const problems = []
  const pagesByName = new Map()
  for (const [page, links] of pageLinks) {
    for (const { name, tag } of links) {
      if (!isVersionTag(tag)) {
        problems.push(`"${name}" in ${page} is linked to "${tag}", which is not a release tag (v<major>.<minor>.<patch>, or a pre-release of one)`)
        continue
      }
      const byTag = pagesByName.get(name) ?? new Map()
      byTag.set(tag, [...new Set([...(byTag.get(tag) ?? []), page])])
      pagesByName.set(name, byTag)
    }
  }
  for (const [name, byTag] of pagesByName) {
    if (byTag.size < 2) continue
    const where = [...byTag].map(([tag, pages]) => `${tag} in ${pages.join(', ')}`).join('; ')
    problems.push(`"${name}" is linked to more than one release (${where}): one screenshot, one release`)
  }
  return problems
}

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? markdownFiles(path) : [path]
  })
}

/** The pages on disk under `repoRoot`, each with its text. */
export function readPages(repoRoot) {
  const files = [join(repoRoot, 'README.md'), ...(existsSync(join(repoRoot, 'docs/guide')) ? markdownFiles(join(repoRoot, 'docs/guide')) : [])]
  return new Map(
    files
      .filter((file) => existsSync(file))
      .map((file) => relative(repoRoot, file).split('\\').join('/'))
      .filter(isScreenshotPage)
      .sort()
      .map((path) => [path, readFileSync(join(repoRoot, path), 'utf8')]),
  )
}

export function linksOf(pages) {
  return new Map([...pages].map(([path, text]) => [path, parseScreenshotLinks(text)]))
}

/** The links of the pages at a commit or tag; `runGit(args)` runs git at the repository's root. */
export function linksAt(runGit, ref) {
  const paths = runGit(['ls-tree', '-r', '--full-tree', '--name-only', ref, '--', 'README.md', 'docs/guide'])
    .split('\n')
    .filter(isScreenshotPage)
  return new Map(paths.map((path) => [path, parseScreenshotLinks(runGit(['show', `${ref}:${path}`]))]))
}

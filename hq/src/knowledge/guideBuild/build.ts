/**
 * Builds the platform guide an organisation's hq holds in its image (agent knowledge spec, part 1): the user guide's
 * pages, a glossary, and the tools reference, in one folder that nothing else may land in. It takes only those
 * sources, and fails when a page has no description, the glossary does not parse, or the folder holds anything else
 * once it is written.
 */
import fs from 'node:fs'
import path from 'node:path'
import { splitFrontMatter } from './frontMatter'
import { parseGlossary, type GlossaryTerm } from './glossary'

export type PlatformGuideIndex = {
  pages: { name: string; title: string; description: string }[]
  terms: GlossaryTerm[]
}

export type BuildInputs = {
  /** `docs/guide` */
  guideDir: string
  /** `hq/assets/platform-guide`: emptied, then written. */
  outDir: string
  toolsMarkdown: string
}

const GLOSSARY = 'glossary.md'

/** Every page of the guide, as a path relative to it, but not its own README or the glossary (which is built apart). */
function pageFiles(dir: string, rel = ''): string[] {
  const found: string[] = []
  for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const here = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) found.push(...pageFiles(dir, here))
    else if (entry.isFile() && entry.name.endsWith('.md') && here !== 'README.md' && here !== GLOSSARY) found.push(here)
  }
  return found
}

/** A picture is its alt text: an agent reads words. */
export function withoutImages(markdown: string): string {
  return markdown.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_all, alt: string) => alt.trim())
}

function listFiles(dir: string, rel = ''): string[] {
  return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap(entry => {
    const here = rel ? `${rel}/${entry.name}` : entry.name
    return entry.isDirectory() ? listFiles(dir, here) : [here]
  })
}

/** The folder holds exactly the guide's files: nothing else may have landed in it. */
export function assertOnlyGuide(outDir: string, expected: ReadonlySet<string>): void {
  const extra = listFiles(outDir).filter(f => !expected.has(f))
  if (extra.length > 0) throw new Error(`The platform guide's folder holds files that are not the guide: ${extra.join(', ')}.`)
}

export function buildPlatformGuide({ guideDir, outDir, toolsMarkdown }: BuildInputs): PlatformGuideIndex {
  const pages: PlatformGuideIndex['pages'] = []
  const expected = new Set<string>(['index.json', 'tools.md'])
  const written: [string, string][] = []

  for (const file of pageFiles(guideDir)) {
    const source = fs.readFileSync(path.join(guideDir, file), 'utf8')
    const { data } = splitFrontMatter(source, file)
    const title = typeof data.title === 'string' ? data.title.trim() : ''
    const description = typeof data.description === 'string' ? data.description.trim() : ''
    if (!description) throw new Error(`The guide page ${file} has no description. Add one to its front matter.`)
    pages.push({ name: file.replace(/\.md$/, ''), title: title || file.replace(/\.md$/, ''), description })
    written.push([`pages/${file}`, withoutImages(source)])
    expected.add(`pages/${file}`)
  }

  let terms: GlossaryTerm[] = []
  const glossaryPath = path.join(guideDir, GLOSSARY)
  if (fs.existsSync(glossaryPath)) {
    const source = fs.readFileSync(glossaryPath, 'utf8')
    terms = parseGlossary(source)
    written.push([GLOSSARY, withoutImages(source)])
    expected.add(GLOSSARY)
  }

  const index: PlatformGuideIndex = { pages, terms }
  written.push(['index.json', JSON.stringify(index, null, 2) + '\n'], ['tools.md', toolsMarkdown])

  fs.rmSync(outDir, { recursive: true, force: true })
  for (const [rel, text] of written) {
    const target = path.join(outDir, rel)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, text)
  }

  assertOnlyGuide(outDir, expected)
  return index
}

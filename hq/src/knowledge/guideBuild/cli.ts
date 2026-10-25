/** The platform guide's build, run by scripts/guide/build-platform-guide.mjs (bundled first, because it reads hq's TypeScript). */
import path from 'node:path'
import { buildPlatformGuide } from './build'
import { toolsReference } from './toolsReference'

export function run(hqRoot: string): void {
  const index = buildPlatformGuide({
    guideDir: path.resolve(hqRoot, '..', 'docs', 'guide'),
    outDir: path.resolve(hqRoot, 'assets', 'platform-guide'),
    toolsMarkdown: toolsReference(),
  })
  console.log(`Platform guide built: ${index.pages.length} pages, ${index.terms.length} glossary terms.`)
}

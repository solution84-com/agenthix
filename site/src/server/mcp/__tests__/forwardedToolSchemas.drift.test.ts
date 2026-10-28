/**
 * Mirror-drift enforcement (spec review, accepted item) — same precedent as
 * site/src/agents/__tests__/agentDiskPaths.drift.test.ts: the two apps never
 * import from each other (this repo's own convention, AGENTS.md), so this
 * reads hq's `toolSchemas.ts` SOURCE FILE by relative path across the repo
 * boundary rather than importing it as a module.
 *
 * Unlike the agentDiskPaths precedent (byte-identical function bodies), this
 * compares PER-TOOL FIELD-NAME SETS — deliberate, not a shortcut:
 * `forwardedToolSchemas.ts`'s header already documents the metadata
 * asymmetry (site's copy exists purely to drive the MCP SDK's `tools/list`
 * argument hints, and dataApi.ts on hq re-validates every call against ITS
 * OWN canonical schema regardless of what site declared). What actually
 * matters for the FIELD check — and what a silent drift here would break —
 * is that every FIELD NAME an agent can supply on either side matches, so
 * the model never sees an argument hint for a field hq's real schema
 * doesn't accept (or vice versa, silently dropping a field hq expects).
 *
 * DESCRIPTIONS are also compared, but not universally: only site's copy is
 * ever registered on an agent's tool list (hq's own MCP server is a
 * separate, non-agent-facing consumer of the same table), so a description a
 * model actually reads has exactly one source of truth per tool, and the
 * other side's copy exists only for hq's own listing to stay meaningful —
 * there is no reason for the two to say something different about the same
 * tool. `start_preview` is the one declared exception (see
 * DESCRIPTION_DRIFT_ALLOWED below): site's description is deliberately
 * container-specific (the dev-server/bind-address instructions in this
 * file's `start_preview` entry), and hq's own copy carries none at all.
 *
 * Real TS-AST parsing (the `typescript` package, already a site devDependency)
 * rather than brace-counting: these two files' formatting genuinely differs
 * (site's compact single-line entries vs hq's multi-line `description` blocks),
 * so a textual/brace-based comparator would either need to be format-blind in
 * a way that risks false negatives, or fail on the very asymmetry this test
 * exists to tolerate. The AST walk finds every object literal with `name` and
 * `schema` properties, anywhere in the file (both of hq's arrays included, so
 * `start_preview` — declared in hq's DATA_PATH_ONLY_TOOLS, not
 * CONTROL_PLANE_TOOLS — is found without special-casing).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { FORWARDED_TOOLS } from '../forwardedToolSchemas'
import { WORKFLOW_TOOL_NAME_SET } from '../forwardedWorkflowSchemas'
import { FORWARDED_SKILL_TOOLS } from '../forwardedSkillSchemas'

interface ToolInfo { fields: string[]; description: string | undefined }

/** Flattens a string literal, or a `+`-concatenation of string literals (both
 *  files wrap a long description across several lines this way), into the
 *  text it evaluates to. Anything else (a template literal, a variable) is
 *  not a shape either file's descriptions actually take, so it is left
 *  unresolved rather than guessed at. */
function stringValueOf(expr: ts.Expression): string | null {
  if (ts.isStringLiteralLike(expr)) return expr.text
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = stringValueOf(expr.left)
    const right = stringValueOf(expr.right)
    if (left !== null && right !== null) return left + right
  }
  return null
}

/** A description built with constants (a template literal naming the product, a limit) cannot be evaluated here, so
 *  its source is compared instead, with whitespace collapsed: both sides must write it alike, names included. */
function descriptionOf(expr: ts.Expression): string {
  return stringValueOf(expr) ?? expr.getText().replace(/\s+/g, ' ')
}

function extractToolInfo(source: string, fileName: string): Map<string, ToolInfo> {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true)
  const result = new Map<string, ToolInfo>()

  function propName(name: ts.PropertyName): string | null {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text
    return null
  }

  function visit(node: ts.Node): void {
    if (ts.isObjectLiteralExpression(node)) {
      const nameProp = node.properties.find(
        (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && propName(p.name) === 'name',
      )
      const schemaProp = node.properties.find(
        (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && propName(p.name) === 'schema',
      )
      if (
        nameProp && ts.isStringLiteralLike(nameProp.initializer) &&
        schemaProp && ts.isObjectLiteralExpression(schemaProp.initializer)
      ) {
        const toolName = nameProp.initializer.text
        // Throw, not last-wins (spec review): a duplicate tool name in
        // either source file is itself a bug worth surfacing loudly — a
        // silent overwrite here would mean this drift test compares the
        // WRONG entry for that name without any signal that happened.
        if (result.has(toolName)) {
          throw new Error(`duplicate tool name '${toolName}' found in ${fileName} — extractToolInfo refuses to silently pick one`)
        }
        const fieldNames = schemaProp.initializer.properties
          .map(p => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p) ? propName(p.name) : null))
          .filter((n): n is string => n !== null)
          .sort()
        const descProp = node.properties.find(
          (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && propName(p.name) === 'description',
        )
        const description = descProp ? descriptionOf(descProp.initializer) : undefined
        result.set(toolName, { fields: fieldNames, description })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return result
}

/** Each side's table is split over two files (the planning tools apart, on the file-size rule); a name in both is still refused. */
function extractFromFiles(files: Array<[path: string, label: string]>): Map<string, ToolInfo> {
  const merged = new Map<string, ToolInfo>()
  for (const [path, label] of files) {
    for (const [name, info] of extractToolInfo(readFileSync(join(__dirname, path), 'utf8'), label)) {
      if (merged.has(name)) throw new Error(`duplicate tool name '${name}' found in ${label}`)
      merged.set(name, info)
    }
  }
  return merged
}

const HQ_CONTROLPLANE = '../../../../../hq/src/server/controlplane'
const siteInfo = extractFromFiles([
  ['../forwardedToolSchemas.ts', 'site-forwardedToolSchemas.ts'],
  ['../forwardedPlanningSchemas.ts', 'site-forwardedPlanningSchemas.ts'],
  ['../forwardedKnowledgeSchemas.ts', 'site-forwardedKnowledgeSchemas.ts'],
])
const hqInfo = extractFromFiles([
  [`${HQ_CONTROLPLANE}/toolSchemas.ts`, 'hq-toolSchemas.ts'],
  [`${HQ_CONTROLPLANE}/planningToolSchemas.ts`, 'hq-planningToolSchemas.ts'],
  [`${HQ_CONTROLPLANE}/knowledgeToolSchemas.ts`, 'hq-knowledgeToolSchemas.ts'],
])
const siteFields = new Map([...siteInfo].map(([name, info]) => [name, info.fields]))
const hqFields = new Map([...hqInfo].map(([name, info]) => [name, info.fields]))

/**
 * hq's toolSchemas.ts may declare DATA_PATH_ONLY_TOOLS entries that are not MCP tools at all, called by the site
 * directly rather than through an agent-facing tool name. The AST walk above finds every {name, schema} object in the
 * file regardless of which array it's in, so such an entry must be named here rather than silently failing the
 * bidirectional check below. `suggest_place` is the lead's own, in hq, and no run is given it.
 */
const HQ_TOOLS_NOT_FORWARDED = new Set<string>(['suggest_place'])

describe('site forwardedToolSchemas.ts ↔ hq toolSchemas.ts field-set drift @SC-348 @SC-1394', () => {
  it('the extractor actually found tool entries on both sides (sanity check against a silently-empty parse)', () => {
    expect(siteFields.size).toBeGreaterThan(30)
    expect(hqFields.size).toBeGreaterThan(30)
  })

  // The workflow tools and propose_skill are built on both sides from core's one declaration, so they can't drift;
  // forwardedWorkflowSchemas.test.ts and forwardedSkillSchemas.test.ts.
  const declaredInCore = new Set([...WORKFLOW_TOOL_NAME_SET, ...FORWARDED_SKILL_TOOLS.map(t => t.name)])
  it.each(FORWARDED_TOOLS.map(t => t.name).filter(n => !declaredInCore.has(n)))('%s has the same field-name set on both sides', (name) => {
    const site = siteFields.get(name)
    const hq = hqFields.get(name)
    expect(site, `site's forwardedToolSchemas.ts is missing a schema for ${name}`).toBeDefined()
    expect(hq, `hq's toolSchemas.ts has no schema for forwarded tool ${name}`).toBeDefined()
    expect(site).toEqual(hq)
  })

  // The reverse direction (spec review): the check above only walks site's
  // OWN tool list, so a tool hq adds and forgets to add to site's forward
  // list would pass silently — agents on site would simply never see it.
  // This makes that omission a loud failure instead.
  it.each([...hqFields.keys()].filter(name => !HQ_TOOLS_NOT_FORWARDED.has(name)))(
    'hq tool %s is forwarded by site — a new hq MCP tool must not silently vanish from agents on site',
    (name) => {
      expect(siteFields.has(name), `site's forwardedToolSchemas.ts has no entry for hq tool ${name}`).toBe(true)
    },
  )
})

/**
 * Tools whose description is allowed to differ (or exist on only one side).
 * `start_preview` is site-only-with-a-description by design — see the file
 * header above — and is exactly the situation this allowlist exists for. A
 * new entry here should carry the same kind of justification, not just a
 * name.
 */
const DESCRIPTION_DRIFT_ALLOWED = new Set(['start_preview'])

describe('site forwardedToolSchemas.ts ↔ hq toolSchemas.ts description drift @SC-348 @SC-1394', () => {
  const toolNamesWithADescription = [...new Set([...siteInfo.keys(), ...hqInfo.keys()])]
    .filter(name => !DESCRIPTION_DRIFT_ALLOWED.has(name) && !HQ_TOOLS_NOT_FORWARDED.has(name))
    .filter(name => siteInfo.get(name)?.description !== undefined || hqInfo.get(name)?.description !== undefined)

  it('found at least the memory tools among the descriptions compared (sanity check against a silently-empty parse)', () => {
    expect(toolNamesWithADescription).toEqual(expect.arrayContaining(['remember', 'forget']))
  })

  it.each(toolNamesWithADescription)('%s has the same description on both sides', (name) => {
    expect(siteInfo.get(name)?.description).toEqual(hqInfo.get(name)?.description)
  })
})

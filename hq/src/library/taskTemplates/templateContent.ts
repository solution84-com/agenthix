/**
 * A task template's package (spec D16, adr-0174): `package.json` and `task-template.json`, as the built-in templates in
 * hq's image hold them. Made here from a project's own types and fields, and read back for the Library's page and for
 * installing. What is read comes through core's `readTaskTemplate`, so a package from anywhere is checked the same way.
 * Pure: no database.
 */
import {
  ASSET_MANIFEST_FILE, ASSET_MANIFEST_FORMAT, DESCRIPTION_MAX_LENGTH, TASK_TEMPLATE_FILE, TaskTemplateError, isAssetName, readTaskTemplate,
  type TaskTemplateContent,
} from '@agenthix/core'
import type { PackageFile } from '../packages/packageZip'
import { slugOf } from '../../assets/publisherNames'
import { readTaskTemplateFile } from '../../assets/install/templateFiles'

export const FIRST_VERSION = '1.0.0'
const NOTHING = 'Nothing was changed.'

export class TaskTemplateRefused extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409 = 400) {
    super(message)
    this.name = 'TaskTemplateRefused'
  }
}

/** The name a template is published under: a slug of what the person typed (`Launch work` is `launch-work`). */
export function templateNameOf(raw: unknown): string {
  const name = typeof raw === 'string' ? slugOf(raw.trim()) : ''
  if (!isAssetName(name)) throw new TaskTemplateRefused(`Give the template a name of letters or digits, up to 64 characters. ${NOTHING}`)
  return name
}

export function templateDescriptionOf(raw: unknown, fallback: string): string {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (text.length > DESCRIPTION_MAX_LENGTH) throw new TaskTemplateRefused(`A description is at most ${DESCRIPTION_MAX_LENGTH} characters. ${NOTHING}`)
  return text || fallback
}

/** The package's files for `content`, checked as an installed one is. */
export function taskTemplateFiles(input: { publisher: string; name: string; version: string; description: string; content: TaskTemplateContent }): PackageFile[] {
  const manifest = {
    format: ASSET_MANIFEST_FORMAT, kind: 'task-template', publisher: input.publisher, name: input.name, version: input.version,
    description: input.description,
  }
  const body = {
    types: input.content.types.map(t => ({
      name: t.name, icon: t.icon,
      columns: t.columns.map(c => ({ name: c.name, state: c.state, colour: c.colour, ...(c.defaultForState ? { default: true } : {}) })),
    })),
    fields: input.content.fields.map(f => ({ name: f.name, type: f.type, options: f.options.map(o => ({ name: o.name, colour: o.colour })) })),
  }
  try {
    readTaskTemplate(body)
  } catch (err) {
    if (err instanceof TaskTemplateError) throw new TaskTemplateRefused(`${err.message} ${NOTHING}`)
    throw err
  }
  const json = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf-8')
  return [{ path: ASSET_MANIFEST_FILE, content: json(manifest) }, { path: TASK_TEMPLATE_FILE, content: json(body) }]
}

/** What a stored template holds, and its description; a package that fails its checks is refused, not half-read. */
export function readTemplatePackage(files: PackageFile[]): { description: string; content: TaskTemplateContent } {
  let content: TaskTemplateContent
  try {
    content = readTaskTemplateFile(files)
  } catch (err) {
    throw new TaskTemplateRefused(`This task template can't be read: ${(err as Error).message} ${NOTHING}`, 409)
  }
  return { description: templateDescription(files), content }
}

/** The description its `package.json` gives, or nothing. */
export function templateDescription(files: PackageFile[]): string {
  const file = files.find(f => f.path === ASSET_MANIFEST_FILE)
  if (!file) return ''
  try {
    const raw = JSON.parse(file.content.toString('utf-8')) as { description?: unknown }
    return typeof raw.description === 'string' ? raw.description.trim().slice(0, DESCRIPTION_MAX_LENGTH) : ''
  } catch {
    return ''
  }
}

/** "2 types and 1 field", "1 type", "1 field": what a template holds or an install adds, in words. */
export function typesAndFieldsWords(types: number, fields: number): string {
  const t = types ? `${types} ${types === 1 ? 'type' : 'types'}` : ''
  const f = fields ? `${fields} ${fields === 1 ? 'field' : 'fields'}` : ''
  return [t, f].filter(Boolean).join(' and ')
}

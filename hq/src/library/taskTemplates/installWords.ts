/**
 * The words of adding a task template to a project (spec D16, TM1): what the one button says, and why each type or
 * field of the same name is left alone, said before the person confirms. Pure and client-safe.
 */
import type { TaskTemplateContent } from '@agenthix/core'
import type { InstallPlanView, KeptField, KeptType } from './templateInstall'

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function list(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** "Add 1 type", "Add 1 type and 1 field"; null when there is nothing to add. */
export function addButtonWords(plan: Pick<InstallPlanView, 'adds'>): string | null {
  const parts = [plan.adds.types.length ? count(plan.adds.types.length, 'type', 'types') : '', plan.adds.fields.length ? count(plan.adds.fields.length, 'field', 'fields') : ''].filter(Boolean)
  return parts.length ? `Add ${parts.join(' and ')}` : null
}

/** The greyed button's why: "Website relaunch already has Content piece and Channel". */
export function nothingToAddWhy(plan: Pick<InstallPlanView, 'keeps' | 'project'>): string {
  return `${plan.project.name} already has ${list([...plan.keeps.types, ...plan.keeps.fields].map(k => k.name))}`
}

export function keptTypeNote(kept: KeptType, projectName: string): string {
  return kept.madeFromThis ? `Type · already in ${projectName}, made from this template's ${kept.madeFromThis}` : `Type · already in ${projectName}`
}

export function keptFieldNote(kept: KeptField, projectName: string): string {
  return `Field · already in ${projectName}${kept.madeFromThis ? `, made from this template's ${kept.madeFromThis}` : ', with its own options'}`
}

/** Why a field is left alone, with the options it keeps and those it does not get. */
export function keptFieldWhy(kept: KeptField, projectName: string, template: TaskTemplateContent): string {
  const theirs = template.fields.find(f => f.name.toLowerCase() === kept.name.toLowerCase())?.options.map(o => o.name) ?? []
  const own = kept.options.map(o => o.toLowerCase())
  const missing = theirs.filter(o => !own.includes(o.toLowerCase()))
  const options = kept.options.length ? `, with its own options: ${kept.options.join(' · ')}` : ''
  const notAdded = missing.length ? `; ${list(missing)} ${missing.length === 1 ? 'is' : 'are'} not added to it` : ''
  return `${projectName} already has a field named ${kept.name}${options}. It stays as it is${notAdded}.`
}

/** "What it adds is Website relaunch's own: later versions of Content pipeline don't change it. No tasks move." */
export function ownCopyWords(projectName: string, templateTitle: string): string {
  return `What it adds is ${projectName}'s own: later versions of ${templateTitle} don't change it. No tasks move.`
}

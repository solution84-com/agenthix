/**
 * What can be wrong with a knowledge page, each as a code, the part of the page it is about, and a fixed sentence
 * in plain words. The gate refuses a change with these, the itemiser lists a page with them, and hq's editor shows
 * each on its field; the words are the same everywhere because they are made here and nowhere else.
 *
 * A reader that meets a code it does not know (a newer site's) shows its `message`, which is always present.
 */
import { KNOWLEDGE_LIMITS as L } from './limits.js'

export const KNOWLEDGE_PROBLEM_CODES = [
  /** T1: a name that is not a page's: wrong characters, hidden, not `.md`, too deep, too long. */
  'name_invalid',
  'front_matter_missing',
  /** The front matter is not in the form pages use: the message says where and what. */
  'front_matter_invalid',
  'title_missing',
  'title_too_long',
  'description_missing',
  'description_too_long',
  'tags_invalid',
  'tags_too_many',
  'tag_invalid',
  'property_invalid',
  'properties_too_many',
  /** T4 */
  'too_large',
  'too_many_pages',
  /** T5: listed, never a reason to refuse a change. */
  'link_broken',
  'link_outside',
] as const

export type KnowledgePageProblemCode = (typeof KNOWLEDGE_PROBLEM_CODES)[number]

/** The part of a page a problem is about: what hq's editor shows it beside. */
export type KnowledgePageField =
  | 'name' | 'frontMatter' | 'title' | 'description' | 'tags' | 'properties' | 'content' | 'links'

export interface KnowledgePageProblem {
  code: KnowledgePageProblemCode
  field: KnowledgePageField
  message: string
  /** The 1-based line of the page it is on, where it is on one. */
  line?: number
  /** The property it is about, for a property's knowledgeProblem. */
  property?: string
}

const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const quote = (s: string) => `'${s.length > 60 ? `${s.slice(0, 57)}...` : s}'`

/** The fixed messages. Every problem the rules raise is made by one of these. */
export const knowledgeProblem = {
  nameInvalid: (why: string): KnowledgePageProblem => ({ code: 'name_invalid', field: 'name', message: why }),
  frontMatterMissing: (): KnowledgePageProblem => ({
    code: 'front_matter_missing', field: 'frontMatter', line: 1,
    message: "front matter is missing: a page starts with a line '---', its title and description, and another '---'",
  }),
  frontMatterInvalid: (line: number, why: string): KnowledgePageProblem => ({
    code: 'front_matter_invalid', field: 'frontMatter', line, message: `front matter, line ${line}: ${why}`,
  }),
  titleMissing: (): KnowledgePageProblem => ({ code: 'title_missing', field: 'title', message: 'title is missing' }),
  titleNotText: (): KnowledgePageProblem => ({ code: 'title_missing', field: 'title', message: 'title must be one line of text, not a list' }),
  titleTooLong: (chars: number): KnowledgePageProblem => ({
    code: 'title_too_long', field: 'title', message: `title is ${chars} characters; it may be up to ${L.maxTitleChars}`,
  }),
  descriptionMissing: (): KnowledgePageProblem => ({ code: 'description_missing', field: 'description', message: 'description is missing' }),
  descriptionNotText: (): KnowledgePageProblem => ({
    code: 'description_missing', field: 'description', message: 'description must be one sentence on one line, not a list',
  }),
  descriptionTooLong: (chars: number): KnowledgePageProblem => ({
    code: 'description_too_long', field: 'description',
    message: `description is ${chars} characters; it may be up to ${L.maxDescriptionChars}`,
  }),
  tagsNotList: (): KnowledgePageProblem => ({ code: 'tags_invalid', field: 'tags', message: 'tags must be a list, like [releases, deploys]' }),
  tagsTooMany: (count: number): KnowledgePageProblem => ({
    code: 'tags_too_many', field: 'tags', message: `there are ${count} tags; a page may have up to ${L.maxTags}`,
  }),
  tagNotLowerCase: (tag: string): KnowledgePageProblem => ({
    code: 'tag_invalid', field: 'tags', message: `tag ${quote(tag)} must be lower-case`,
  }),
  tagInvalid: (tag: string): KnowledgePageProblem => ({
    code: 'tag_invalid', field: 'tags', message: `tag ${quote(tag)} must be lower-case words joined by hyphens`,
  }),
  tagEmpty: (): KnowledgePageProblem => ({ code: 'tag_invalid', field: 'tags', message: 'a tag is empty' }),
  tagRepeated: (tag: string): KnowledgePageProblem => ({
    code: 'tag_invalid', field: 'tags', message: `tag ${quote(tag)} is listed more than once`,
  }),
  propertyInvalid: (name: string, why: string): KnowledgePageProblem => ({
    code: 'property_invalid', field: 'properties', property: name, message: `property ${quote(name)} ${why}`,
  }),
  propertiesTooMany: (count: number): KnowledgePageProblem => ({
    code: 'properties_too_many', field: 'properties',
    message: `there are ${count} properties; a page may have up to ${L.maxProperties}`,
  }),
  tooLarge: (bytes: number): KnowledgePageProblem => ({
    code: 'too_large', field: 'content',
    message: `the page is over ${L.maxPageBytes / 1024} KB (it is ${Math.ceil(bytes / 1024)} KB): split it into pages`,
  }),
  tooManyPages: (): KnowledgePageProblem => ({
    code: 'too_many_pages', field: 'name',
    message: `this place already has ${thousands(L.maxPages)} pages, the most it may hold: delete or combine some first`,
  }),
  linkBroken: (target: string, line: number): KnowledgePageProblem => ({
    code: 'link_broken', field: 'links', line, message: `the link to ${quote(target)} leads to no page`,
  }),
  linkOutside: (target: string, line: number): KnowledgePageProblem => ({
    code: 'link_outside', field: 'links', line, message: `the link to ${quote(target)} leads outside this place's knowledge`,
  }),
}

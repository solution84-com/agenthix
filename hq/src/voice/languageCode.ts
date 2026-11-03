/** A language code such as `en`, `fr` or `pt-BR`: the only form a voice preview accepts. */
export const isLanguageCode = (lang: unknown): lang is string =>
  typeof lang === 'string' && /^[a-z]{2,3}(-[A-Za-z]{2})?$/.test(lang)

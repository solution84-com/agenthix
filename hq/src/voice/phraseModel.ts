/**
 * A one-line sample phrase for a voice, as an ordinary model call.
 *
 * This used to run a container with a login mounted off an Execution Site's
 * disk — hq starting a container to ask a model a question, on a machine it
 * only has while it happens to share a filesystem with its site. hq holds a
 * model credential of its own now, so there is nothing here that needs a
 * container or anyone else's credentials.
 *
 * It is hq asking on its own behalf, for a sample rendered in a settings screen,
 * on the organisation's default model, as the resolver gives it
 * (models from one place, part 4). It acts for no boundary, and never reaches a
 * person's subscription.
 */
import { generateText as defaultGenerateText, type LanguageModel } from 'ai'
import { resolve } from '../routing/resolver'
import { hqCallAccess } from '../routing/reaching'
import { languageModelFor } from '../conversations/model/providers'
import { turnUsageOf } from '../conversations/model/usage'
import type { ResolvedAccess } from '../conversations/contract'
import { recordHqCall } from '../billing/sources/hqCalls'
import { costingOf } from '../billing/costing'

export interface PhraseModelDeps {
  generateText?: typeof defaultGenerateText
  model?: () => Promise<LanguageModel | null>
}

async function samplePhraseAccess(): Promise<ResolvedAccess | null> {
  const req = { purpose: 'voice_sample' as const, place: { kind: 'organisation' as const } }
  const answer = await resolve(req)
  const access = answer.ok ? await hqCallAccess(answer.resolution) : null
  return access && answer.ok ? { ...access, costing: costingOf(answer.resolution, req) } : null
}

export async function generateSamplePhrase(
  description: string,
  lang: string,
  deps: PhraseModelDeps = {},
): Promise<string> {
  const access = deps.model ? null : await samplePhraseAccess()
  const model = deps.model ? await deps.model() : access ? languageModelFor(access) : null
  if (!model) {
    throw new Error('Cannot generate a voice sample phrase: no model is working')
  }
  const generate = deps.generateText ?? defaultGenerateText
  const { text, usage } = await generate({
    model,
    prompt:
      `Write one short sample phrase (1–2 sentences) in language code "${lang}" for a ` +
      `text-to-speech voice with this description: "${description}". The phrase should ` +
      `naturally showcase this voice's character. Return ONLY the phrase text, nothing else.`,
  })
  if (access) recordHqCall(access, turnUsageOf(usage))
  return text.trim()
}

const FALLBACK_PHRASES: Record<string, string> = {
  ar: 'مرحبًا، يسعدني أن أساعدك اليوم. أخبرني بما تحتاجه.',
  de: 'Hallo, schön, dass du da bist. Sag mir, womit ich dir heute helfen kann.',
  en: "Hello, it's good to hear from you. Tell me what you'd like to work on today.",
  es: 'Hola, me alegra saber de ti. Dime en qué quieres trabajar hoy.',
  fr: "Bonjour, ravi de vous entendre. Dites-moi sur quoi vous voulez travailler aujourd'hui.",
  he: 'שלום, טוב לשמוע ממך. ספר לי על מה תרצה לעבוד היום.',
  hi: 'नमस्ते, आपसे बात करके अच्छा लगा। बताइए, आज किस पर काम करना है?',
  it: 'Ciao, che piacere sentirti. Dimmi su cosa vuoi lavorare oggi.',
  ja: 'こんにちは、お話しできてうれしいです。今日は何に取り組みましょうか。',
  ko: '안녕하세요, 반가워요. 오늘은 어떤 일을 함께할까요?',
  nl: 'Hallo, fijn je te horen. Vertel me waar je vandaag aan wilt werken.',
  pl: 'Cześć, miło cię słyszeć. Powiedz mi, nad czym chcesz dziś pracować.',
  pt: 'Olá, que bom falar com você. Diga-me em que quer trabalhar hoje.',
  ru: 'Здравствуйте, рад вас слышать. Скажите, над чем хотите поработать сегодня.',
  zh: '你好，很高兴听到你的声音。告诉我今天想做些什么吧。',
}

/** A fixed phrase in the language, for a preview when no model can write one: a voice is heard either way. */
export function fallbackPhrase(lang: string): string {
  return FALLBACK_PHRASES[lang] ?? FALLBACK_PHRASES.en
}

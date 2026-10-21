/**
 * A one-line sample phrase for a voice, as an ordinary model call.
 *
 * This used to run a container with a login mounted off an Execution Site's
 * disk — hq starting a container to ask a model a question, on a machine it
 * only has while it happens to share a filesystem with its site. hq holds a
 * model credential of its own now, so there is nothing here that needs a
 * container or anyone else's credentials.
 *
 * The org's provider key is hq's own, deliberately: this call is hq asking on
 * its own behalf, for a sample rendered in a settings screen. It is not a run,
 * it acts for no boundary, and it must never reach a person's subscription.
 */
import { generateText as defaultGenerateText } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { getLlmApiKey } from '../server/providerService'
import { DEFAULT_MODEL } from '../agents/models'

export interface PhraseModelDeps {
  generateText?: typeof defaultGenerateText
  apiKey?: () => Promise<string | null>
}

export async function generateSamplePhrase(
  description: string,
  lang: string,
  deps: PhraseModelDeps = {},
): Promise<string> {
  const apiKey = await (deps.apiKey ?? (() => getLlmApiKey('anthropic')))()
  if (!apiKey) {
    throw new Error('Cannot generate a voice sample phrase: hq has no model key configured')
  }
  const generate = deps.generateText ?? defaultGenerateText
  const anthropic = createAnthropic({ apiKey })
  const { text } = await generate({
    model: anthropic(DEFAULT_MODEL),
    prompt:
      `Write one short sample phrase (1–2 sentences) in language code "${lang}" for a ` +
      `text-to-speech voice with this description: "${description}". The phrase should ` +
      `naturally showcase this voice's character. Return ONLY the phrase text, nothing else.`,
  })
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

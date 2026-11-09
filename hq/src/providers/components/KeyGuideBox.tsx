import { AI_PROVIDER_VENDOR_INFO, type AiProviderVendor } from '@agenthix/core'
import { COMMON_CREDIT_STEP, COMMON_KEY_STEP, KEY_GUIDES } from '../keyGuides'

const article = (label: string) => (/^[AEIOU]/.test(label) ? 'an' : 'a')

/** The short guide at the top of a key form: three steps and a button to the vendor's key page. Nothing for a vendor with no guide. */
export function KeyGuideBox({ vendor }: { vendor: AiProviderVendor }) {
  const guide = KEY_GUIDES[vendor]
  if (!guide) return null
  const label = AI_PROVIDER_VENDOR_INFO[vendor].label
  return (
    <section aria-label="Where to get the key" className="rounded-xl border border-border-subtle bg-accent-subtle p-3">
      <h4 className="text-body font-semibold text-text-primary">Where do I get {article(label)} {label} key?</h4>
      <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-small text-text-secondary">
        <li>Sign in, or create an account, at {guide.signInAt}.</li>
        <li>{guide.creditStep ?? COMMON_CREDIT_STEP}</li>
        <li>{guide.keyStep ?? COMMON_KEY_STEP}</li>
      </ol>
      <a href={guide.pageUrl} target="_blank" rel="noopener noreferrer"
        className="mt-2 inline-flex items-center rounded-lg max-sm:min-h-11 border border-accent bg-card px-3 py-1.5 text-small font-medium text-accent hover:bg-accent-subtle">
        Open {label}&rsquo;s key page ↗
      </a>
      {guide.note && <p className="mt-2 text-small text-text-secondary">{guide.note}</p>}
    </section>
  )
}

import { AI_PROVIDER_VENDOR_INFO, providerTypesOf, type AiProviderVendor, type FlagCheck } from '@agenthix/core'
import { useQuery, getHqCloudConnection } from 'wasp/client/operations'
import { CLOUD_NOT_AVAILABLE_WORDS } from './CloudConnectPanel'
import { TypeChips } from './TypeChips'
import { INWORLD_WITH_MODELS_LINE, VENDOR_LINES, VENDOR_ORDER } from './providerWords'
import { CARD_CLICKABLE } from '@agenthix/ui/primitives'

/** The vendors an admin can still add, in the pop-up's order: Agenthix Cloud is connected, not keyed, and a vendor is added once. */
export function addableVendors(existing: readonly AiProviderVendor[]): AiProviderVendor[] {
  return VENDOR_ORDER.filter(v => !existing.includes(v))
}

const ROW = `block w-full rounded-xl border bg-card p-3 text-left ${CARD_CLICKABLE}`

export interface VendorChoicesProps {
  existingVendors: readonly AiProviderVendor[]
  /** Whether a flag is on, so Inworld's chips and line say whether it also offers models. */
  isOn: FlagCheck
  onPick: (vendor: AiProviderVendor) => void
  onPickCloud: () => void
}

/** Every vendor not yet added with what it covers, then Agenthix Cloud: no question about what a provider does comes first. */
export function VendorChoices({ existingVendors, isOn, onPick, onPickCloud }: VendorChoicesProps) {
  const { data: cloud } = useQuery(getHqCloudConnection)
  const showCloud = !cloud?.connection
  const cloudAvailable = cloud?.aiAvailable ?? false
  return (
    <ul className="space-y-2" aria-label="Providers to add">
      {addableVendors(existingVendors).map(v => (
        <li key={v}>
          <button type="button" onClick={() => onPick(v)} className={ROW}>
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-body font-medium text-text-primary">{AI_PROVIDER_VENDOR_INFO[v].label}</span>
              <TypeChips types={providerTypesOf(v, isOn)} />
            </span>
            <span className="block text-small text-text-secondary">{v === 'inworld' && isOn('inworldLanguageModels') ? INWORLD_WITH_MODELS_LINE : VENDOR_LINES[v]}</span>
          </button>
        </li>
      ))}
      {showCloud && (
        <li>
          <button type="button" onClick={onPickCloud} disabled={!cloudAvailable} className={`${ROW}`}>
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-body font-medium text-text-primary">Agenthix Cloud</span>
              {!cloudAvailable && <span className="text-small text-text-muted">Not available yet</span>}
            </span>
            <span className="block text-small text-text-secondary">{cloudAvailable ? VENDOR_LINES.cloud : CLOUD_NOT_AVAILABLE_WORDS}</span>
          </button>
        </li>
      )}
    </ul>
  )
}

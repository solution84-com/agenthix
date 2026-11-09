/**
 * Which types a provider serves for this organisation: core's `providerTypesOf` with the organisation's flags asked
 * (adr-0172), so Inworld counts as a model provider only while `inworldLanguageModels` is on.
 */
import { isFeatureOn, providerTypesOf, type AiProviderType, type AiProviderVendor, type FlagCheck } from '@agenthix/core'
import { featureFacts } from '../features/switches'

export async function providerFlagCheck(): Promise<FlagCheck> {
  const facts = await featureFacts()
  return flag => isFeatureOn(flag, facts)
}

export async function typesOfVendor(vendor: AiProviderVendor): Promise<readonly AiProviderType[]> {
  return providerTypesOf(vendor, await providerFlagCheck())
}

/**
 * Where Inworld's language-model service is reached and how it is addressed (adr-0183): the one place for the
 * address, the model list's address and the `Authorization` header, so a change to any of them is made once.
 */
export const INWORLD_LLM_BASE_URL = 'https://api.inworld.ai/v1'
/** Early version of Inworld's API: the plain `/v1/models` does not exist. */
export const INWORLD_MODELS_URL = 'https://api.inworld.ai/llm/v1alpha/models'

/**
 * Measured: `Bearer` and `Basic` are both accepted (the unit's findings), so the SDK's default `Bearer` is used. Flip this one
 * constant to change every call and check.
 */
const INWORLD_LLM_AUTH_SCHEME: 'Basic' | 'Bearer' = 'Bearer'

export function inworldLlmAuthorization(key: string): string {
  return `${INWORLD_LLM_AUTH_SCHEME} ${key}`
}

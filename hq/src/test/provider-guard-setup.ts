import { afterEach, expect } from 'vitest'
import { installProviderGuard } from './noProviderCalls'

// Fails any test that reaches a model, voice or search provider, even one that swallows the error the call raised.
const guard = installProviderGuard(() => expect.getState().currentTestName ?? 'a test')

afterEach(() => {
  const reached = guard.reached.splice(0)
  if (reached.length) throw new Error(reached[0])
})

import { describe, expect, it } from 'vitest'
import { isSignInRequest } from '../signInLimit'

describe('isSignInRequest letter case and slashes @SC-713', () => {
  it.each(['/AUTH/username/login', '/auth/username/Login', '/Auth/Username/LOGIN/', '/auth/username/login//?x=1'])(
    'counts %s as a sign-in attempt',
    (originalUrl) => {
      expect(isSignInRequest({ method: 'POST', originalUrl })).toBe(true)
    },
  )
})

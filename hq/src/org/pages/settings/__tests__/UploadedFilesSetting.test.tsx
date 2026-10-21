// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const env = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('wasp/client/operations', () => ({ getEnvStatus: 'getEnvStatus', useQuery: () => ({ data: env.current }) }))

import { UploadedFilesSetting, uploadedFilesWords } from '../UploadedFilesSetting'

beforeEach(() => cleanup())

describe('Settings › Uploaded files on a bare network address @SC-637', () => {
  it('says uploads are downloads only, why, and that HQ\'s machine admin sets the fix on HQ\'s machine', () => {
    env.current = { address: 'http://192.168.1.20:4100', files: { mode: 'downloadsOnly', origin: 'http://192.168.1.20:4100', bareAddress: true }, sections: [] }
    render(<UploadedFilesSetting />)
    expect(screen.getByText('Downloads only')).toBeTruthy()
    expect(screen.getByText("http://192.168.1.20:4100 · set on HQ's machine")).toBeTruthy()
    expect(screen.getByText(/bare network address, which cannot give uploaded files an address of their own/)).toBeTruthy()
    expect(screen.getByText("To show them: give HQ a domain with a separate host for files. HQ's machine admin sets it on HQ's machine.")).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows the files address, and no explanation, when they have one', () => {
    env.current = { address: 'https://hq.acme.example', files: { mode: 'origin', origin: 'https://files.acme.example', bareAddress: false }, sections: [] }
    render(<UploadedFilesSetting />)
    expect(screen.getByText('https://files.acme.example')).toBeTruthy()
    expect(screen.queryByText(/never shown inside HQ/)).toBeNull()
  })

  it('names a missing files host when the address is not bare', () => {
    expect(uploadedFilesWords(false).why).toContain('HQ has no separate address for uploaded files.')
  })
})

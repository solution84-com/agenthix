import { describe, it, expect } from 'vitest'
import { BRANDING, DEFAULT_INSTALL_NAMESPACE, SITE_CLI_COMMAND, imageName } from '../branding.js'

describe('branding', () => {
  it('holds the display name, the command and the image prefix', () => {
    expect(BRANDING.displayName).toBe('Agenthix')
    expect(BRANDING.cliCommand).toBe('agenthix')
    expect(BRANDING.imagePrefix).toBe('agenthix')
  })

  it('derives the site command, the image names and the default namespace from it', () => {
    expect(SITE_CLI_COMMAND).toBe(`${BRANDING.cliCommand}-site`)
    expect(imageName('hq-server')).toBe('agenthix-hq-server')
    expect(DEFAULT_INSTALL_NAMESPACE).toBe(BRANDING.cliCommand)
  })
})

/** The guard knows the site's own execs in a live preview's container by what they run, and nothing else. */
import { describe, expect, it } from 'vitest'
import { withFeature } from '@agenthix/core/testing'
import { meaningOf, siteMadeExec } from '../guard/events'
import { appForwarderArgv } from '../apps/appForwarderScript'
import { APP_RELAY_SCRIPT } from '../apps/appConnect'

const exec = (command: string) => ({ action: `exec_create: ${command}` })

withFeature('livePreview', () => {
  describe("the guard's reading of a container's execs @SC-1738", () => {
    it("takes the app forwarder, the site's own, as the site's", () => {
      const command = appForwarderArgv().join(' ')
      expect(siteMadeExec(command)).toBe(true)
      expect(meaningOf(exec(command) as Parameters<typeof meaningOf>[0])).toEqual({ kind: 'none' })
    })

    it("takes the per-stream relay as the site's", () => {
      expect(siteMadeExec(`node -e ${APP_RELAY_SCRIPT}`)).toBe(true)
    })

    it('flags any other command', () => {
      expect(meaningOf(exec("node -e require('net')") as Parameters<typeof meaningOf>[0]).kind).toBe('signal')
      expect(siteMadeExec('sh')).toBe(false)
    })
  })
})

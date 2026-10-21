import { describe, expect, it } from 'vitest'
import { figuresVolumeWarning, isMountPoint } from '../mount'

const MOUNTINFO = [
  '612 590 0:52 / / rw,relatime master:1 - overlay overlay rw',
  '640 612 254:1 /docker/volumes/agenthix-host-figures/_data /run/host-figures rw,relatime - ext4 /dev/vda1 rw',
  '641 612 0:60 /home/sam/.agenthix /state rw,relatime - virtiofs mount0 rw',
].join('\n')

describe('the figures volume', () => {
  it('is found among the container’s mount points', () => {
    expect(isMountPoint(MOUNTINFO, '/run/host-figures')).toBe(true)
    expect(isMountPoint(MOUNTINFO, '/run/host')).toBe(false)
  })

  it('needs no warning when mounted', () => {
    expect(figuresVolumeWarning(MOUNTINFO, '/run/host-figures', 'agenthix-host-figures')).toBeNull()
  })

  it('names the volume and the line to add when it is not', () => {
    const warning = figuresVolumeWarning('', '/run/host-figures', 'agenthix-host-figures')
    expect(warning).toContain('-v agenthix-host-figures:/run/host-figures')
  })
})

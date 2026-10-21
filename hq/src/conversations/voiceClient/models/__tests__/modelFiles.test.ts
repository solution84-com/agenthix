import { describe, expect, it } from 'vitest'
import { checkedModel, SILERO_VAD_FILE, SMART_TURN_FILE } from '../modelFiles'
import { servedFile, servedText } from './onDisk'

describe("the models' files", () => {
  it.each([SILERO_VAD_FILE, SMART_TURN_FILE])('serves $name as recorded, and records it in the README', async (file) => {
    await expect(checkedModel(file, servedFile(file))).resolves.toBeInstanceOf(Uint8Array)
    const readme = servedText('models/README.md')
    expect(readme).toContain(file.sha256)
    expect(readme).toContain(file.path.replace(/^models\//, ''))
  })

  it('refuses a file whose bytes are not the ones recorded', async () => {
    const altered = servedFile(SILERO_VAD_FILE)
    altered[100] ^= 1
    await expect(checkedModel(SILERO_VAD_FILE, altered)).rejects.toThrow(/not the one recorded/)
  })
})

import { describe, expect, it } from 'vitest'
import { namesTask } from '../taskKey.js'

describe('namesTask: a task named by its id or its key, as hq reads them', () => {
  const task = { id: 'cuid-1', key: 'WEB-3' }

  it('takes the id, and the key in any case or with its number padded', () => {
    for (const words of ['cuid-1', ' cuid-1 ', 'WEB-3', 'web-3', 'Web-03']) expect(namesTask(words, task)).toBe(true)
  })

  it('takes nothing else', () => {
    for (const words of ['WEB-4', 'APP-3', 'WEB3', '', 'cuid-2', 3, null, undefined]) expect(namesTask(words, task)).toBe(false)
    expect(namesTask('WEB-3', { id: 'cuid-1', key: null })).toBe(false)
  })
})

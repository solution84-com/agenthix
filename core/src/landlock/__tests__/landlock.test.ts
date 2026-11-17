import { describe, expect, it } from 'vitest'
import {
  COMMAND_LAUNCHER_PATH, LANDLOCK_ABI_COMMAND, LANDLOCK_REQUIRED_ABI, landlockAbiSufficient, parseLandlockAbi,
} from '../landlock.js'

describe('the kernel Landlock check @SC-2188', () => {
  it('asks the launcher itself for the ABI', () => {
    expect(LANDLOCK_ABI_COMMAND).toEqual([COMMAND_LAUNCHER_PATH, '--abi'])
    expect(LANDLOCK_REQUIRED_ABI).toBe(6)
  })

  it('reads the number the launcher prints, 0 when Landlock is missing, and nothing else', () => {
    expect(parseLandlockAbi('8\n')).toBe(8)
    expect(parseLandlockAbi('  6 ')).toBe(6)
    expect(parseLandlockAbi('0')).toBe(0)
    expect(parseLandlockAbi('')).toBeNull()
    expect(parseLandlockAbi('agenthix-contain: usage')).toBeNull()
    expect(parseLandlockAbi('-1')).toBeNull()
    expect(parseLandlockAbi('6.1')).toBeNull()
    expect(parseLandlockAbi('6\n7')).toBeNull()
    expect(parseLandlockAbi('12345')).toBeNull()
  })

  it('is enough from ABI 6 on, never when missing or unread', () => {
    expect(landlockAbiSufficient(6)).toBe(true)
    expect(landlockAbiSufficient(8)).toBe(true)
    expect(landlockAbiSufficient(5)).toBe(false)
    expect(landlockAbiSufficient(4)).toBe(false)
    expect(landlockAbiSufficient(0)).toBe(false)
    expect(landlockAbiSufficient(null)).toBe(false)
  })
})

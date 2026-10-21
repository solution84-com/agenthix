import { describe, it, expect } from 'vitest'
import {
  KERNEL_HANDLE,
  isKernelAgent,
  assertNotReservedHandle,
  assertNotKernel,
  assertKernelUpdateAllowed,
} from '../kernelGuards'

/**
 * Kernel Guard Tests
 * ===================
 * Verifies the pure guard functions that protect the kernel agent
 * from creation, modification, and deletion.
 */
describe('Kernel Agent Guards @SC-138', () => {
  describe('KERNEL_HANDLE', () => {
    it('is set to "kernel"', () => {
      expect(KERNEL_HANDLE).toBe('kernel')
    })
  })

  describe('isKernelAgent', () => {
    it('returns true for kernel handle', () => {
      expect(isKernelAgent({ handle: KERNEL_HANDLE })).toBe(true)
    })

    it('returns false for other handles', () => {
      expect(isKernelAgent({ handle: 'researcher' })).toBe(false)
      expect(isKernelAgent({ handle: '' })).toBe(false)
    })
  })

  describe('assertNotReservedHandle', () => {
    it('throws for the built-in agent\'s handle', () => {
      expect(() => assertNotReservedHandle(KERNEL_HANDLE)).toThrow('reserved')
    })

    it('does not throw for other handles', () => {
      expect(() => assertNotReservedHandle('researcher')).not.toThrow()
      expect(() => assertNotReservedHandle('assistant')).not.toThrow()
    })
  })

  describe('assertNotKernel', () => {
    it('throws for kernel agent on update', () => {
      expect(() => assertNotKernel({ handle: KERNEL_HANDLE }, 'modified'))
        .toThrow('The built-in agent cannot be modified')
    })

    it('throws for kernel agent on delete', () => {
      expect(() => assertNotKernel({ handle: KERNEL_HANDLE }, 'deleted'))
        .toThrow('The built-in agent cannot be deleted')
    })

    it('does not throw for non-kernel agents', () => {
      expect(() => assertNotKernel({ handle: 'researcher' }, 'modified')).not.toThrow()
      expect(() => assertNotKernel({ handle: 'researcher' }, 'deleted')).not.toThrow()
    })
  })

  describe('assertKernelUpdateAllowed', () => {
    it('allows updating defaultModel for kernel agent', () => {
      expect(() => assertKernelUpdateAllowed({ handle: KERNEL_HANDLE }, { defaultModel: 'claude-opus-4-6' }))
        .not.toThrow()
    })

    it('throws when updating the handle of the kernel agent', () => {
      expect(() => assertKernelUpdateAllowed({ handle: KERNEL_HANDLE }, { handle: 'new-handle' }))
        .toThrow('cannot modify protected fields [handle]')
    })

    it('allows providing unchanged protected fields for the kernel agent', () => {
      expect(() => assertKernelUpdateAllowed(
        { handle: KERNEL_HANDLE, name: 'Original' },
        { name: 'Original', defaultModel: 'claude-opus-4-6' }
      )).not.toThrow()
    })

    it('treats null and empty string as equivalent for protected fields', () => {
      expect(() => assertKernelUpdateAllowed(
        { handle: KERNEL_HANDLE, role: null },
        { role: '', defaultModel: 'claude-opus-4-6' }
      )).not.toThrow()
    })

    it('allows any update for non-kernel agents', () => {
      expect(() => assertKernelUpdateAllowed({ handle: 'researcher' }, { name: 'New Name', handle: 'new-handle' }))
        .not.toThrow()
    })
  })
})

/**
 * Kernel Constants & Guards
 * ==========================
 *
 * Pure utility module for kernel agent protection logic.
 * Kept separate from actions.ts so it can be imported in tests
 * without pulling in Wasp server dependencies.
 */

/**
 * The built-in agent's reserved handle and name. Neutral on purpose: they are stored in every organisation's
 * database, so a product name here could not change without converting stored data.
 */
export const KERNEL_HANDLE = 'kernel'
export const KERNEL_NAME = 'Kernel'
export const KERNEL_ROLE = 'Helps you use the product'

/**
 * Checks if an agent is the kernel agent (by handle).
 */
export function isKernelAgent(agent: { handle: string }): boolean {
  return agent.handle === KERNEL_HANDLE
}

/**
 * Throws if the given handle is reserved for the kernel.
 */
export function assertNotReservedHandle(handle: string): void {
  if (handle === KERNEL_HANDLE) {
    throw new Error(`Handle @${KERNEL_HANDLE} is reserved for the built-in agent`)
  }
}

/**
 * Throws if the agent is the kernel agent (for deletion guard).
 */
export function assertNotKernel(agent: { handle: string }, operation: string): void {
  if (isKernelAgent(agent)) {
    throw new Error(`The built-in agent cannot be ${operation}`)
  }
}

/** Fields that can never be changed on the kernel agent. Everything else is editable. */
const KERNEL_PROTECTED_FIELDS = new Set([
  'handle',
])

/**
 * Validates updates to the kernel agent.
 * Only `handle` is protected here — everything else (approval, model, tools, etc.) can be
 * changed through this guard. A protected field may be passed if the value is unchanged.
 */
export function assertKernelUpdateAllowed(
  agent: Record<string, any>,
  update: Record<string, any>
): void {
  if (!isKernelAgent(agent as any)) return

  const protectedChanges: string[] = []
  for (const [key, value] of Object.entries(update)) {
    if (!KERNEL_PROTECTED_FIELDS.has(key)) continue
    if (agent[key] === value) continue
    protectedChanges.push(key)
  }

  if (protectedChanges.length > 0) {
    throw new Error(`The built-in agent cannot modify protected fields [${protectedChanges.join(', ')}]`)
  }
}

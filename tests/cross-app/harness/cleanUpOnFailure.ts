/** Runs a setup step; if it throws, the run's cleanup runs first (and its own failure never hides the step's), then the step's error is thrown. */
export async function cleanUpOnFailure<T>(step: () => Promise<T>, cleanup: () => Promise<void>): Promise<T> {
  try {
    return await step()
  } catch (err) {
    await cleanup().catch(() => {})
    throw err
  }
}

/** `work`, or `'timeout'` once `ms` has passed: a level that does not answer in time is left out, not waited for. */
export function withDeadline<T>(work: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<'timeout'>(resolve => {
    timer = setTimeout(() => resolve('timeout'), ms)
    timer.unref?.()
  })
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer))
}

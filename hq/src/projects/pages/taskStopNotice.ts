export type StopNotice = { kind: 'stopped' | 'error'; text: string }

type StopTaskAction = (args: { taskId: string }) => Promise<{ cancelled: number }>

function stoppedText(cancelled: number): string {
  if (cancelled === 0) return 'Nothing was running on this task. It is now Idle.'
  if (cancelled === 1) return 'Stopped the run. The task is now Idle.'
  return `Stopped ${cancelled} runs. The task is now Idle.`
}

/** Runs Stop and turns either outcome into the sentence the person sees; never throws. */
export async function stopTaskWithNotice(stopTask: StopTaskAction, taskId: string): Promise<StopNotice> {
  try {
    const { cancelled } = await stopTask({ taskId })
    return { kind: 'stopped', text: stoppedText(cancelled) }
  } catch (err) {
    const reason = err instanceof Error && err.message ? err.message : 'Something went wrong.'
    return { kind: 'error', text: `Could not stop the task. ${reason}` }
  }
}

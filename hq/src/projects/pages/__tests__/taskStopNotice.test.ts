import { describe, it, expect, vi } from 'vitest'
import { stopTaskWithNotice } from '../taskStopNotice'

describe('what the task page tells the person after Stop @SC-408', () => {
  it('asks the server to stop this task and says the run was stopped and the task is Idle', async () => {
    const stop = vi.fn().mockResolvedValue({ cancelled: 1 })

    await expect(stopTaskWithNotice(stop, 'task-1')).resolves.toEqual({
      kind: 'stopped',
      text: 'Stopped the run. The task is now Idle.',
    })
    expect(stop).toHaveBeenCalledWith({ taskId: 'task-1' })
  })

  it('counts the runs when more than one was stopped', async () => {
    const stop = vi.fn().mockResolvedValue({ cancelled: 3 })
    await expect(stopTaskWithNotice(stop, 'task-1')).resolves.toMatchObject({ kind: 'stopped', text: 'Stopped 3 runs. The task is now Idle.' })
  })

  it('says so when nothing was running', async () => {
    const stop = vi.fn().mockResolvedValue({ cancelled: 0 })
    await expect(stopTaskWithNotice(stop, 'task-1')).resolves.toEqual({
      kind: 'stopped',
      text: 'Nothing was running on this task. It is now Idle.',
    })
  })

  it('shows a refusal in its own words instead of failing silently', async () => {
    const stop = vi.fn().mockRejectedValue(new Error("Stopping this task needs the Member or Admin role in this project. A Viewer reads this project and changes nothing; ask one of its admins."))

    const notice = await stopTaskWithNotice(stop, 'task-1')

    expect(notice.kind).toBe('error')
    expect(notice.text).toContain('Stopping this task needs the Member or Admin role')
    expect(notice.text).toContain('Viewer')
  })

  it('shows an unreachable site\'s message', async () => {
    const stop = vi.fn().mockRejectedValue(new Error("Execution Site 'Office' is unreachable"))
    await expect(stopTaskWithNotice(stop, 'task-1')).resolves.toMatchObject({
      kind: 'error',
      text: expect.stringContaining("Execution Site 'Office' is unreachable"),
    })
  })

  it('still gives an error notice when the failure carries no message', async () => {
    const stop = vi.fn().mockRejectedValue('boom')
    const notice = await stopTaskWithNotice(stop, 'task-1')
    expect(notice.kind).toBe('error')
    expect(notice.text).toContain('Could not stop the task')
  })
})

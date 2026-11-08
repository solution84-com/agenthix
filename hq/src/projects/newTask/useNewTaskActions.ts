import { useMemo } from 'react'
import {
  useAction, createTask, updateTaskPlan, setTaskSchedule, uploadTaskAttachment, addTasksToSprint, setTaskFieldValue,
} from 'wasp/client/operations'
import type { NewTaskActions } from './createNewTask'

const dataUrlOf = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result as string)
  reader.onerror = () => reject(new Error(`${file.name} could not be read.`))
  reader.readAsDataURL(file)
})

/** The operations making a task takes, as the server has them. */
export function useNewTaskActions(): NewTaskActions {
  const create = useAction(createTask)
  const plan = useAction(updateTaskPlan)
  const schedule = useAction(setTaskSchedule)
  const upload = useAction(uploadTaskAttachment)
  const planSprint = useAction(addTasksToSprint)
  const setField = useAction(setTaskFieldValue)
  return useMemo(() => ({
    createTask: args => create(args as Parameters<typeof create>[0]),
    updateTaskPlan: args => plan(args),
    setTaskSchedule: args => schedule(args),
    addTasksToSprint: args => planSprint(args),
    setTaskFieldValue: args => setField(args),
    uploadFile: async (taskId, file) => upload({ taskId, filename: file.name, dataUrl: await dataUrlOf(file) }),
  }), [create, plan, schedule, upload, planSprint, setField])
}

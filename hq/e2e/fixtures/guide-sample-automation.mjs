// The sample organisation's automation: Website relaunch has it on, with a Launch plan column that starts work
// and a task waiting for its start time; Quarterly report has a routine; the organisation lets agents set
// schedules. Rows only, and nothing may actually start: the scheduler runs whatever is due by the real clock,
// so every time here is a week or more ahead of both the fixed capture date and the real date.

const WEEK = 7 * 24 * 60 * 60_000

// The Monday a week after the fixed capture date (a Monday, in summer time), 08:00 UTC (09:00 in the sample timezone).
// It depends on the fixed date alone, so two seeds draw the same dates. If the real clock has caught up with it,
// it is moved on by whole weeks until it is well ahead, so the scheduler starts nothing (and the dates then change).
function nextMonday(sampleNow, weeks = 0) {
  const day = new Date(sampleNow)
  const fixed = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 7, 8, 0, 0)
  let at = fixed
  while (at <= Date.now() + 2 * 24 * 60 * 60_000) at += WEEK
  return { at: new Date(at + weeks * WEEK), moved: at !== fixed }
}

export async function seedAutomation({ hq, ago, ahead, NOW, DAY, sample, people, agents, projects, tasks, boards }) {
  const { at: first, moved } = nextMonday(NOW)
  if (moved) {
    console.warn('[seed-guide-data] the fixed capture date is behind the real clock: automation times were moved forward so the scheduler starts nothing. Advance the date in e2e/guide/sample.json.')
  }

  await hq.org.updateMany({ data: { automationAgentSchedules: true } })
  await hq.projectAutomation.create({
    data: { projectId: projects.WEB.id, enabled: true, agentSchedules: true, lastRoundFinishedAt: ago(20), updatedById: people.sam.id },
  })

  // Waiting in the writer's line for a start time a week away: the pulse never starts a task before its time.
  await hq.task.update({
    where: { id: tasks['WEB-4'].id },
    data: { runState: 'RUN_QUEUED', scheduleAt: first, scheduleNextDueAt: first },
  })

  const routineData = (projectId, title, description, agent, board, column, person, at) => ({
    projectId, title, description, priority: 'MEDIUM', assignedAgentId: agent.id, boardId: board.id, column,
    scheduleAt: ago(30 * DAY), scheduleRule: { kind: 'weekly', time: '09:00', weekdays: [1] },
    scheduleTimezone: sample.clock.timezone, enabled: true, nextRoundAt: at,
    onBehalfOfUserId: person.id, createdByUserId: person.id,
  })
  const routine = await hq.routine.create({
    data: routineData(projects.QTR.id, 'Weekly status summary',
      'Summarise what moved on this project in the last week and what is waiting.',
      agents.writer, boards.qtr, 'todo', people.jordan, first),
  })
  await hq.routine.create({
    data: routineData(projects.WEB.id, 'Weekly link check',
      'Follow every link on the new pages and list anything that no longer works.',
      agents.reviewer, boards.launch, 'todo', people.priya, first),
  })
  tasks['QTR-5'] = await hq.task.create({
    data: {
      projectId: projects.QTR.id, number: 5, title: 'Weekly status summary', boardId: boards.qtr.id, column: 'done', status: 'DONE',
      assignedAgentId: agents.writer.id, onBehalfOfUserId: people.jordan.id, routineId: routine.id, roundAt: ago(7 * DAY - 90),
      doneAt: ago(7 * DAY - 120), runStartedBy: 'schedule', createdAt: ago(7 * DAY - 90),
    },
  })
}

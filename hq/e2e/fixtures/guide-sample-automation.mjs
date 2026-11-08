// The sample organisation's automation: Website relaunch lets its agents set start times and has a task waiting for
// its start time; Quarterly report has a routine; the organisation lets agents set start times. Nothing starts work
// but an explicit act (adr-0175). Rows only, and nothing may actually start: the scheduler runs whatever is due by the real clock,
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

export async function seedAutomation({ hq, ago, ahead, NOW, DAY, sample, people, agents, projects, tasks, types, nextRank }) {
  const { at: first, moved } = nextMonday(NOW)
  if (moved) {
    console.warn('[seed-guide-data] the fixed capture date is behind the real clock: automation times were moved forward so the scheduler starts nothing. Advance the date in e2e/guide/sample.json.')
  }

  await hq.org.updateMany({ data: { automationAgentSchedules: true } })
  await hq.project.update({ where: { id: projects.WEB.id }, data: { agentSchedules: true } })

  // Waiting for a start time a week away (Run at…): nothing starts a task before its time.
  await hq.task.update({
    where: { id: tasks['WEB-4'].id },
    data: { runState: 'RUN_NONE', scheduleAt: first, scheduleNextDueAt: first },
  })

  // A routine is a repeatable run (adr-0177): a cron rule, an agent and instructions; it makes no task.
  const routineData = (projectId, title, instructions, agent, person, at) => ({
    projectId, title, instructions, agentId: agent.id, cron: '0 9 * * 1', timezone: sample.clock.timezone,
    enabled: true, nextDueAt: at, onBehalfOfUserId: person.id, createdByUserId: person.id,
  })
  const routine = await hq.routine.create({
    data: routineData(projects.QTR.id, 'Weekly status summary',
      'Summarise what moved on this project in the last week and what is waiting.', agents.writer, people.jordan, first),
  })
  await hq.routine.create({
    data: routineData(projects.WEB.id, 'Weekly link check',
      'Follow every link on the new pages and list anything that no longer works.', agents.reviewer, people.priya, first),
  })
  // A task done last week (its run is in guide-sample-runs.mjs); a routine no longer makes one.
  tasks['QTR-5'] = await hq.task.create({
    data: {
      projectId: projects.QTR.id, number: 5, title: 'Weekly status summary',
      typeId: types.qtr.id, columnId: types.qtr.columns.Done.id, state: 'DONE', rank: nextRank(),
      assignedAgentId: agents.writer.id, onBehalfOfUserId: people.jordan.id,
      doneAt: ago(7 * DAY - 120), runStartedBy: 'schedule', createdAt: ago(7 * DAY - 90),
    },
  })
  // The routine's run last week, as hq records it; the run itself is the site's.
  await hq.routineRun.create({
    data: {
      routineId: routine.id, number: 1, dueAt: ago(7 * DAY - 90), onBehalfOfUserId: people.jordan.id, agentId: agents.writer.id,
      state: 'FINISHED', startedAt: ago(7 * DAY - 90), endedAt: ago(7 * DAY - 120),
    },
  })
}

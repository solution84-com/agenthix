import type { DemoScripts } from '@agenthix/core'

/** A small set of demo scripts for the lead's tests: one agent, three intents, two of them making a task (one in the visitor's own space). */
export const demoScripts: DemoScripts = {
  agents: {
    writer: {
      lead: {
        format: 1,
        agent: 'writer',
        intents: [
          {
            id: 'home-page',
            phrasings: ['How is the home page copy coming along?'],
            reply: 'The home page copy is in progress.',
            toolCalls: [],
            voiceClip: null,
          },
          {
            id: 'case-study',
            phrasings: ['Make a task for the case study'],
            reply: "I've made a task for the case study.",
            toolCalls: [{ toolName: 'create_task', input: { projectId: 'WEB', title: 'Draft the case study', when: 'later' } }],
            voiceClip: null,
          },
          {
            id: 'own-case-study',
            phrasings: ['Draft a case study for me'],
            reply: "I've started a case study in your space.",
            toolCalls: [{ toolName: 'create_task', input: { projectId: 'personal', title: 'Draft a case study', when: 'now', assignedAgentId: 'self' } }],
            voiceClip: null,
          },
        ],
        fallback: { text: 'This is a demo. Try asking about the home page.', voiceClip: null },
        spoken: {
          workCameBack: { text: "Writer's work has come back.", voiceClip: 'writer-work-came-back.mp3' },
          done: { text: 'Writer has that under way.', voiceClip: 'writer-done.mp3' },
          refused: { text: "Writer couldn't do that.", voiceClip: 'writer-refused.mp3' },
          waiting: { text: 'Writer waits for your okay.', voiceClip: 'writer-waiting.mp3' },
        },
        suggestedPrompts: ['How is the home page copy coming along?'],
        voiceLines: [],
        firstVoiceLine: { text: 'Hello, this is a demo voice.', voiceClip: null },
      },
      runs: [],
    },
  },
}

/**
 * `@agenthix/core/client`: the client protocol, the contract between hq and the apps people use it from — its
 * version (./protocol.ts), what crosses it (a conversation, voice, the rooms and their events, runs, the
 * workplace) and the list of what the mobile app relies on (./mobileApp.ts). Kept to what an app needs, so its
 * bundle carries nothing else of core.
 */
export * from './protocol.js'
export * from './conversation.js'
export * from './conversationSocket.js'
export * from './conversationWork.js'
export * from './voice.js'
export * from './runEvents.js'
export * from './rooms.js'
export * from './json.js'
export * from './runs.js'
export * from './agents.js'
export * from './people.js'
export * from './workplace.js'
export * from './projects.js'
export * from './boards.js'
export * from './tasks.js'
export * from './taskSession.js'
export * from './mobileApp.js'

/** What the agent and the person read about an app in a live preview; each says what to do instead. */
export const appWords = {
  portOfApp: (port: number, other: string) =>
    `Port ${port} is the app ${other}'s in this live preview. Choose another port, or stop ${other} first with stop_app.`,
  portOfService: (port: number) => `Port ${port} is one a service of this live preview uses. Choose another port for the app.`,
  portInUse: (port: number) =>
    `Port ${port} is in use in this live preview by something that is not one of its apps. Choose another port.`,
  tooMany: 'This live preview runs as many apps as it takes at once. Stop one with stop_app first.',
  unknownApp: 'This live preview has no such app. list_apps shows the apps, and start_app starts one.',
  replaced: 'Stopped to start it again.',
  didNotStart: 'Its command did not start in the live preview. Check the folder and the command, then start it again.',
  noAnswer: (port: number) =>
    `It did not listen on port ${port} within a minute, so it was stopped. Check the command and that the app listens on port ${port}, then start it again.`,
  exitedEarly: (port: number, code: number) =>
    `It exited (code ${code}) before listening on port ${port}. Its last lines say why; fix that and start it again.`,
  exited: (code: number) => `It exited (code ${code}). Its last lines say why; start it again with start_app.`,
  paused: 'Paused with its live preview. It runs again when the live preview is resumed.',
  previewStopped: 'Stopped: its live preview stopped. start_app runs it again once a live preview is open on the branch.',
  guard: 'The live-preview guard stopped it: the relay refused too many requests to it.',
} as const

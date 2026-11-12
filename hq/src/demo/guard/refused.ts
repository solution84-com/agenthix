/**
 * What the demo guard refuses (live demo spec, *Getting in*). A visitor is an organisation member and a viewer of the
 * sample's projects, so the product's own roles keep the sample and the organisation's settings as seeded; this list
 * is only what a member may still do that a public demo must not: reach a service outside the machine, change who can
 * get in, start a container or a workflow, or make something every visitor would see. Every name is an operation Wasp
 * generated (`demoGuard.test.ts`), so one renamed later fails the test rather than leaving the list.
 */
export const REFUSED_OPERATIONS = {
  /** Model and voice vendors, keys, GitHub, Cloud and connections: the demo reaches nothing outside its machine. */
  outside: [
    'addAiProvider', 'removeAiProvider', 'renameAiProvider', 'replaceAiProviderKey', 'revokeAiProvider', 'checkAiProviderNow',
    // A person's own Claude subscription, which every member may sign in to.
    'startClaudeLogin', 'completeClaudeLogin', 'cancelClaudeLogin', 'removeMyClaudeSubscription',
    'setWebSearchKey', 'deleteWebSearchKey',
    'startGithubAppRegistration', 'disconnectGithubApp', 'refreshGithubInstallations', 'checkForGitHubAccounts',
    'allowGitHubAccount', 'ignoreGitHubAccount', 'changeGitHubAccountRule', 'setProjectGitHubDefault', 'connectRepo',
    'disconnectRepo', 'turnGitOn',
    'connectHqToCloud', 'disconnectHqFromCloud',
    'createConnection', 'revokeConnection', 'renewConnection', 'checkConnect',
    'addTrustedPublisher', 'trustPublisher', 'removeTrustedPublisher', 'renameTrustedPublisher', 'setTrustedPackageScopes',
    // Speech goes to a voice vendor; the demo voice plays recorded lines instead.
    'getSpeechToken', 'speakAnswer', 'previewVoice',
    // A conversation's summary is written by a model, which the demo never calls.
    'summariseConversation', 'summariseConversationNow',
    // A secret's value is typed in, and may be sent on to GitHub.
    'addPlaceSecret', 'replacePlaceSecret',
    // Queries that ask a vendor or GitHub when read.
    'listInworldVoices', 'getSetupDefaults', 'getWorkflows', 'getRuns', 'getRepoSecrets', 'getGitHubInstallLink',
  ],
  /** Who can get in: invitations, reset links, roles, people, Cloud sign-in, a phone, Library maintainers. */
  gettingIn: [
    'createInvite', 'revokeInvite', 'createPasswordResetLink', 'updateUserRole', 'removePerson', 'erasePerson',
    'reactivatePerson', 'askForCloudSignIn', 'setSignInShows', 'generateMobileAuthToken', 'exchangeMobileAuthToken',
    'signOutPhone', 'nameLibraryMaintainer', 'removeLibraryMaintainer',
  ],
  /** A workflow's steps and a live preview run in containers, and the demo starts none. */
  containers: [
    'startWorkflowRun', 'approveWorkflowVersion', 'switchWorkflow', 'runLivePreviewWorkflow',
    'startLivePreview', 'startLiveApp', 'openLiveApp', 'restartLiveApp', 'reloadLivePreview', 'resumeLivePreview',
    'setLivePreviewAuto', 'markLivePreviewInUse', 'answerLivePreviewQuestion',
  ],
  /**
   * What every visitor would see: a project a member makes is the organisation's, listed for every visitor. A visitor
   * works in their own space instead.
   */
  sharedWithVisitors: ['createProject', 'proposeTaskTemplate'],
} as const satisfies Record<string, readonly string[]>

/** Operations that fetch a package from a link when asked to (`from: 'url'`); from anywhere else they are allowed. */
export const FROM_LINK_OPERATIONS: readonly string[] = ['installAsset', 'previewAssetInstall', 'getPackageFiles']

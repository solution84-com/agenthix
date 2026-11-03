/**
 * The live preview's own workflows are the person's (*Start with secrets*, *Reload with secrets*): an agent that ran one
 * to "start the live preview" handed secrets to an app nobody asked to start. Its way is the app tools. Words only, so
 * the model checks give the agent the same sentence.
 */
export function livePreviewWorkflowRefusal(name: string): string {
  return `${name.trim()} is the person's: only they start it, from Start with secrets or Reload with secrets on the ` +
    'live preview\'s strip. To start, restart or reload the app, use start_app, list_apps and reload_view. Nothing was changed.'
}

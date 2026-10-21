/**
 * What failed, and what to do about it, in plain words (logs and diagnostics
 * spec, Recent errors). Pure: the recorders call it with what they were told,
 * and the group key it returns is what makes three runs failing the same way
 * one problem with a count.
 *
 * Replaces the debug page's fixed guide and its list of API keys: each error
 * now says what fixes it, where that is known, and where to look when not.
 */
import { RUN_LIMIT_REASON_PREFIX, plainFailureReason } from '@agenthix/core'
import type { SiteProblem } from '../sites/siteStanding'

export type Advice = { kind: string; title: string; advice: string }

type RunRule = { kind: string; test: (raw: string, plain: string) => boolean; title: string; advice: string }

const LOGINS = 'Settings › Your model logins'
const MODEL_ACCESS = 'Organisation › Model access'
const RUN_SETTINGS = 'Organisation › Settings › Runs'

const RUN_RULES: RunRule[] = [
  {
    kind: 'login-expired',
    test: raw => /expired|refresh/i.test(raw) && /login|subscription|oauth|token/i.test(raw),
    title: 'A run could not sign in to its model',
    advice: `The login of the person the run was for has expired. They renew it in ${LOGINS}.`,
  },
  {
    kind: 'no-credential',
    test: raw => /^No (model )?credential/i.test(raw.trim()) || /no (model )?credential/i.test(raw),
    title: 'A run had no model to use',
    advice: `Give the agent model access in ${MODEL_ACCESS}, or the person adds their own login in ${LOGINS}.`,
  },
  {
    kind: 'credential-refused',
    test: (_raw, plain) => plain === 'The model provider refused the credential.',
    title: 'The model provider refused a run\'s key or login',
    advice: `Check the key in ${MODEL_ACCESS}; a person's own login is renewed in ${LOGINS}.`,
  },
  {
    kind: 'run-limit',
    test: raw => raw.startsWith(RUN_LIMIT_REASON_PREFIX) || /turn limit|max(imum)? turns/i.test(raw),
    title: 'A run reached its limit',
    advice: `If the work needs more, raise the limit in ${RUN_SETTINGS}.`,
  },
  {
    kind: 'rate-limit',
    test: (_raw, plain) => plain === "The model provider's rate limit was reached.",
    title: "The model provider's rate limit was reached",
    advice: `Runs work again once the limit resets. Fewer runs at once (${RUN_SETTINGS}) makes it rarer.`,
  },
  {
    kind: 'provider-error',
    test: (_raw, plain) => plain === 'The model provider was overloaded.' || plain === 'The model provider had an error.' ||
      plain === 'The model provider kept failing, so the site stopped trying.',
    title: 'The model provider had an error',
    advice: 'This usually passes by itself. Run it again later.',
  },
  {
    kind: 'network',
    test: (_raw, plain) => plain === 'The site lost its connection to the model.',
    title: 'A site lost its connection to the model',
    advice: "Check that the site's machine can reach the model provider; its logs say more.",
  },
  {
    kind: 'context-full',
    test: (_raw, plain) => plain === "The agent's memory of this conversation was full.",
    title: "An agent's memory of a conversation was full",
    advice: 'Start a new conversation, or summarise this one, and go on from there.',
  },
  {
    kind: 'process-stopped',
    test: (_raw, plain) => plain === "The agent's process stopped unexpectedly.",
    title: "An agent's process stopped unexpectedly",
    advice: "Check that the site's machine has memory to spare; the site's logs say why it stopped.",
  },
  {
    kind: 'runtime-refused',
    test: (_raw, plain) => plain === "The agent's runtime could not take the message.",
    title: "An agent's runtime could not take a message",
    advice: "Check the agent's model in its settings: the runtime may not run it.",
  },
  {
    kind: 'capability',
    test: (_raw, plain) => plain === 'The run could not prove what it was allowed to do.',
    title: 'A run could not prove what it was allowed to do',
    advice: "Check that HQ's and the site's clocks agree and that both are up to date; the site's logs say which check failed.",
  },
  {
    kind: 'package',
    test: (_raw, plain) => plain === "The agent's setup could not be loaded on the site.",
    title: "An agent's setup could not be loaded on its site",
    advice: 'Check that the site is connected and up to date, then run it again.',
  },
  {
    kind: 'conversation-closed',
    test: raw => /^This conversation was closed because/.test(raw) || /^The agent no longer has this conversation's context/.test(raw),
    title: 'A run was for a conversation that was closed',
    advice: 'Nothing to fix: the person starts a new conversation.',
  },
]

const UNKNOWN_RUN: Advice = {
  kind: 'other',
  title: 'A run ended with an error',
  advice: "Open the logs of the site it ran on to see why.",
}

/** A failed run's error, as the site reported it. */
export function runFailureAdvice(error: string | null | undefined): Advice {
  const raw = (error ?? '').trim()
  const plain = plainFailureReason(raw)
  const rule = RUN_RULES.find(r => r.test(raw, plain))
  return rule ? { kind: rule.kind, title: rule.title, advice: rule.advice } : UNKNOWN_RUN
}

/** A site's problem, as Execution Sites already works it out (`siteStanding`), `label` as shown. Null for one that is not an error. */
export function siteProblemAdvice(label: string, p: SiteProblem): Advice | null {
  switch (p.kind) {
    case 'dockerDown':
      return { kind: 'docker-down', title: `Docker is not running on ${label}`, advice: 'Every run there fails until Docker is started on that machine.' }
    case 'diskNearlyFull':
      return {
        kind: 'disk-full',
        title: `${label}'s disk is nearly full`,
        advice: 'Runs there may fail once it is full. Your fleet admins have been told; they free space on that machine.',
      }
    case 'memoryNearlyFull':
      return {
        kind: 'memory-low',
        title: `${label} is nearly out of memory`,
        advice: 'Runs there may be stopped when it runs out. Give each run less memory, run fewer at once, or give the machine more.',
      }
    case 'hqSiteDown':
      return { kind: 'hq-site-down', title: `${label} is not running`, advice: "Whoever runs HQ's machine restarts it; it reconnects by itself." }
    case 'notConnectedWithWork':
      return { kind: 'not-connected', title: `${label} is not connected`, advice: 'Work is waiting for it. Start the site on its machine; it reconnects by itself.' }
    case 'upgrade':
      return p.side === 'hq'
        ? { kind: 'upgrade', title: `${label} needs a newer HQ`, advice: "Its projects stop until whoever runs HQ's machine upgrades HQ." }
        : { kind: 'upgrade', title: `${label} needs upgrading`, advice: 'Its projects stop until a fleet admin upgrades it in the Fleet Console.' }
    case 'removedWithProjects':
      return null
  }
}

/** A GitHub API call HQ made that GitHub refused. */
export function githubAdvice(status: number): Advice {
  if (status === 401) {
    return { kind: 'github-401', title: "GitHub refused HQ's GitHub App", advice: 'Check the GitHub App in Organisation › Infrastructure › GitHub; it may need registering again.' }
  }
  if (status === 403 || status === 404) {
    return { kind: `github-${status}`, title: 'GitHub refused a request', advice: 'Give the GitHub App access to that repository on GitHub.' }
  }
  if (status === 429) {
    return { kind: 'github-429', title: "GitHub's rate limit was reached", advice: 'This passes by itself once the limit resets.' }
  }
  return { kind: `github-${status}`, title: 'GitHub answered with an error', advice: 'This usually passes by itself. If it goes on, check githubstatus.com.' }
}

export const PUSH_REFUSED: Advice = {
  kind: 'github-push-refused',
  title: 'GitHub refused a push',
  advice: 'The repository already has work that would be lost. Pull it first, or connect a new repository.',
}

export const SCHEDULER_FAILED: Advice = {
  kind: 'scheduler',
  title: "HQ's scheduler could not run",
  advice: "Scheduled starts, routines and pulses wait until it runs again. HQ's logs say why.",
}

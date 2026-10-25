/**
 * The names a workflow uses: its own, its parameters', and the secrets' and variables' it names. Secrets and
 * variables are named the same way, in capitals, digits and `_` (spec part 3, *The two kinds*); a variable may not
 * take a name that changes how programs run, since every step of a workflow that names it gets it as an environment
 * variable and the executor sets those itself.
 */
import type { ValidationResult } from '../shared/validate.js'

export const WORKFLOW_NAME_MAX = 64
export const VALUE_NAME_MAX = 100
export const PARAMETER_NAME_MAX = 64

const WORKFLOW_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
/** Capitals, digits and `_`, not starting with a digit, so every name is also a valid environment variable name. */
const VALUE_NAME_RE = /^[A-Z_][A-Z0-9_]*$/
/** A parameter's value is the file `/run/params/<name>`, so its name is a plain lower-case file name. */
const PARAMETER_NAME_RE = /^[a-z][a-z0-9_]*$/

/**
 * Secrets an integration mints for each run rather than a person stores (spec part 3, *A third kind of secret*). A
 * step may name one; no place may store a secret under one.
 */
export const INTEGRATION_SECRET_NAMES = ['GITHUB_TOKEN'] as const
export type IntegrationSecretName = (typeof INTEGRATION_SECRET_NAMES)[number]

/**
 * Variable names refused outright, because the program that reads them runs differently: the spec's list, and the
 * same kind beside it (shells, loaders, interpreters, proxies and certificate stores).
 */
export const REFUSED_VARIABLE_NAMES: readonly string[] = [
  'PATH', 'HOME', 'BASH_ENV', 'ENV', 'NODE_OPTIONS', 'LD_PRELOAD',
  'SHELL', 'SHELLOPTS', 'IFS', 'PS4', 'PROMPT_COMMAND', 'CDPATH', 'TMPDIR', 'USER', 'LOGNAME',
  'NODE_PATH', 'NODE_EXTRA_CA_CERTS', 'PYTHONPATH', 'PYTHONSTARTUP', 'PYTHONHOME', 'PERL5OPT', 'PERL5LIB',
  'RUBYOPT', 'RUBYLIB', 'GCONV_PATH', 'HOSTALIASES', 'LOCALDOMAIN', 'RES_OPTIONS',
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'FTP_PROXY',
  'SSL_CERT_FILE', 'SSL_CERT_DIR', 'CURL_CA_BUNDLE', 'REQUESTS_CA_BUNDLE', 'CURL_HOME', 'WGETRC',
  'GNUPGHOME', 'EDITOR', 'VISUAL', 'PAGER', 'DOCKER_HOST',
]

/**
 * Prefixes refused outright: the spec's (`GIT_`, `SSH_`, `GH_`, and `npm_config_`, which npm also reads in capitals),
 * and the loader's, bash's, XDG's and the executor's own.
 */
export const REFUSED_VARIABLE_PREFIXES: readonly string[] = [
  'GIT_', 'SSH_', 'GH_', 'NPM_CONFIG_', 'LD_', 'DYLD_', 'BASH_', 'XDG_', 'GITHUB_', 'RUNNER_',
]

export function validateWorkflowName(name: string): ValidationResult {
  if (name.length === 0) return { ok: false, reason: 'A workflow needs a name.' }
  if (name.length > WORKFLOW_NAME_MAX) return { ok: false, reason: `A workflow's name is at most ${WORKFLOW_NAME_MAX} characters.` }
  if (!WORKFLOW_NAME_RE.test(name)) {
    return { ok: false, reason: `"${name}" is not a workflow name: use lower-case letters and digits, joined by single hyphens, such as deploy-staging.` }
  }
  return { ok: true }
}

function validateValueName(name: string, what: 'secret' | 'variable'): ValidationResult {
  if (name.length === 0) return { ok: false, reason: `A ${what} needs a name.` }
  if (name.length > VALUE_NAME_MAX) return { ok: false, reason: `A ${what}'s name is at most ${VALUE_NAME_MAX} characters.` }
  if (!VALUE_NAME_RE.test(name)) {
    return { ok: false, reason: `"${name}" is not a ${what} name: use capitals, digits and _, not starting with a digit, such as STAGING_DEPLOY_KEY.` }
  }
  return { ok: true }
}

/** A name a workflow step may give in `secrets: [...]`: a stored secret's, or an integration's. */
export function validateSecretName(name: string): ValidationResult {
  return validateValueName(name, 'secret')
}

/** A name a person may store a secret under: as above, and not one an integration mints. */
export function validateStoredSecretName(name: string): ValidationResult {
  const named = validateValueName(name, 'secret')
  if (!named.ok) return named
  if ((INTEGRATION_SECRET_NAMES as readonly string[]).includes(name)) {
    return { ok: false, reason: `${name} is minted for each run by its integration, so it can't be stored.` }
  }
  return { ok: true }
}

export function isRefusedVariableName(name: string): boolean {
  return REFUSED_VARIABLE_NAMES.includes(name) || REFUSED_VARIABLE_PREFIXES.some(p => name.startsWith(p))
}

export function validateVariableName(name: string): ValidationResult {
  const named = validateValueName(name, 'variable')
  if (!named.ok) return named
  if (isRefusedVariableName(name)) {
    return { ok: false, reason: `${name} changes how programs run, so it can't be a variable: the executor sets it itself.` }
  }
  return { ok: true }
}

export function validateParameterName(name: string): ValidationResult {
  if (name.length === 0) return { ok: false, reason: 'A parameter needs a name.' }
  if (name.length > PARAMETER_NAME_MAX) return { ok: false, reason: `A parameter's name is at most ${PARAMETER_NAME_MAX} characters.` }
  if (!PARAMETER_NAME_RE.test(name)) {
    return { ok: false, reason: `"${name}" is not a parameter name: use lower-case letters, digits and _, starting with a letter, such as branch.` }
  }
  return { ok: true }
}

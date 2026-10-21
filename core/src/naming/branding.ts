/**
 * The product's names, in one place. Everything a person reads that names the product, and every command
 * printed for them to run, comes from here. Package names, environment variables and stored values do not:
 * npm reads package names literally, and stored names come from an install's own recorded namespace.
 */
export const BRANDING = {
  /** The product's name as a person reads it on a screen or in a message. */
  displayName: 'Agenthix',
  /** The command a person types on the machine (`agenthix install`, `agenthix status`). */
  cliCommand: 'agenthix',
  /** The prefix of the product's container image names in the registry (`<prefix>-hq-server`). */
  imagePrefix: 'agenthix',
} as const

/** The command that manages one Execution Site on its own machine (`agenthix-site status`). */
export const SITE_CLI_COMMAND = `${BRANDING.cliCommand}-site`

/**
 * The namespace an install records when it is set up. Every name the host service creates on a machine
 * derives from this record, never from the current branding, so a rename cannot break an install.
 */
export type InstallNamespace = string

/** The namespace a new install records today. */
export const DEFAULT_INSTALL_NAMESPACE: InstallNamespace = BRANDING.cliCommand

/** An image name in the registry, from the shared prefix: `imageName('hq-server')` is `agenthix-hq-server`. */
export function imageName(part: string): string {
  return `${BRANDING.imagePrefix}-${part}`
}

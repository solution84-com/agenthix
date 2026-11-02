/**
 * The folder a live preview's app container holds handed secrets in, and the fixed script that fills it
 * (`handedSecrets.ts`). Pure, so the container's template and the guard read them without the hand-off's imports.
 */
import { LIVE_PREVIEW_SECRETS_DIR } from '@agenthix/core'

/** The folder's size: room for every secret a run may name at its largest, in whole pages. */
export const SECRETS_TMPFS_BYTES = 8 * 1024 * 1024
export const SECRETS_TMPFS = `rw,noexec,nosuid,nodev,size=${SECRETS_TMPFS_BYTES},uid=1001,gid=1001,mode=0500`
/** What a hand-off may carry, leaving the folder room for each file's last page. */
export const HANDED_BYTES_MAX = SECRETS_TMPFS_BYTES - 1024 * 1024

export const SECRETS_SCRIPT_NAME = 'live-preview-secrets'
// The archive holds `secrets/<NAME>` entries only, 0400 and no folder entry, so unpacking writes nowhere else.
export const SECRETS_SCRIPT = [
  'set -eu',
  'umask 077',
  `d=${LIVE_PREVIEW_SECRETS_DIR}`,
  'chmod 0700 "$d"',
  'rm -rf -- "$d"/* "$d"/.[!.]* "$d"/..?*',
  'tar -x -o -f - -C "${d%/*}"',
  'chmod 0500 "$d"',
  'echo handed',
].join('\n')

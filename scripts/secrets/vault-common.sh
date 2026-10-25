# What export-to-vault.sh and import-from-vault.sh share: this repository's files and where they go in the team's
# KeePassXC vault, the vault's location from `.env.vault` (gitignored; see `.env.vault.example`), the files asked for
# on the command line, and the master password, asked once and handed to keepassxc-cli on stdin, never written or shown.
# Sourced, not run.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GROUP="Agenthix Platform"

# file (from the repository's root) | its entry in the group, titled with the file's own name so it is plain which file
# goes where (a folder is left out: a title cannot hold a "/")
FILES=(
  ".env.release|.env.release"
  ".env.testing|.env.testing"
)

SETTINGS="$ROOT/.env.vault"
[ -f "$SETTINGS" ] || { echo "Missing $SETTINGS — copy .env.vault.example and fill it in." >&2; exit 1; }
VAULT="$(grep -E '^VAULT_PATH=' "$SETTINGS" | head -1 | cut -d= -f2-)"
KEY_FILE="$(grep -E '^VAULT_KEY_FILE=' "$SETTINGS" | head -1 | cut -d= -f2- || true)"
VAULT="${VAULT/#\~/$HOME}"; KEY_FILE="${KEY_FILE/#\~/$HOME}"
[ -n "$VAULT" ] || { echo "VAULT_PATH in $SETTINGS isn't filled in." >&2; exit 1; }
[ -f "$VAULT" ] || { echo "No vault at $VAULT (VAULT_PATH in $SETTINGS)." >&2; exit 1; }

K="$(command -v keepassxc-cli || true)"
[ -z "$K" ] && [ -x /Applications/KeePassXC.app/Contents/MacOS/keepassxc-cli ] && K=/Applications/KeePassXC.app/Contents/MacOS/keepassxc-cli
[ -n "$K" ] || { echo "keepassxc-cli not found: install KeePassXC (https://keepassxc.org)." >&2; exit 1; }

FORCE=0 ONLY=()
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    *) ONLY+=("$arg") ;;
  esac
done

# The files asked for: all, or those named.
selected=()
for line in "${FILES[@]}"; do
  file="${line%%|*}"
  if [ ${#ONLY[@]} -eq 0 ]; then selected+=("$line"); continue; fi
  for want in ${ONLY[@]+"${ONLY[@]}"}; do [ "$want" = "$file" ] && selected+=("$line"); done
done
for want in ${ONLY[@]+"${ONLY[@]}"}; do
  printf '%s\n' "${FILES[@]}" | cut -d'|' -f1 | grep -qxF "$want" || { echo "Not a file this script keeps: $want" >&2; exit 2; }
done

read -r -s -p "Master password for $VAULT: " PW; echo
kp() { printf '%s\n' "$PW" | "$K" "$1" -q ${KEY_FILE:+-k "$KEY_FILE"} "$VAULT" "${@:2}"; }
kp ls >/dev/null 2>&1 || { echo "Could not open the vault: wrong password or key file?" >&2; exit 1; }

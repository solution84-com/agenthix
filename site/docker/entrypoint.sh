#!/bin/sh
# Gives appuser the machine's Docker socket, then runs the site as appuser.
# On Linux the socket belongs to a docker group whose id varies by machine:
# appuser joins a group with that id. On Docker Desktop the socket shows as
# root-owned inside the container, and a group of id 0 is not honoured, so it
# is opened to the container instead — that socket is Docker Desktop's own
# proxy in its VM, not a file on the host. A root-owned socket anywhere else
# is the host's own file, bind-mounted: opening it would hand every local user
# the machine's Docker, so the site refuses to start instead.
set -eu
SOCK=/var/run/docker.sock
if [ -S "$SOCK" ]; then
  gid=$(stat -c %g "$SOCK")
  if [ "$gid" = "0" ]; then
    os=$(docker info --format '{{.OperatingSystem}}' 2>/dev/null || true)
    case "$os" in
      *"Docker Desktop"*)
        chmod 666 "$SOCK"
        ;;
      *)
        echo "agenthix-site: the host's Docker socket belongs to root with no docker group." >&2
        echo "  Create a 'docker' group to own it, as the standard Docker install does:" >&2
        echo "  sudo groupadd docker && sudo systemctl restart docker — then start the site again." >&2
        exit 1
        ;;
    esac
  else
    group=$(awk -F: -v g="$gid" '$3==g{print $1; exit}' /etc/group)
    if [ -z "$group" ]; then
      addgroup -g "$gid" dockerhost
      group=dockerhost
    fi
    addgroup appuser "$group"
  fi
fi

: "${SITE_ROOT:?SITE_ROOT must be set to the data folder, mounted at the same path}"
# The data folder is a host folder mounted at the same path, so taking it over
# changes its ownership on the host too: only a folder that is plainly the
# site's own is ever chowned.
root=$(printf '%s' "$SITE_ROOT" | sed -e 's#/*$##')
[ -n "$root" ] || root=/
case "$root" in
  /*) ;;
  *) echo "agenthix-site: SITE_ROOT must be an absolute path (got $SITE_ROOT)." >&2; exit 1 ;;
esac
case "$root" in
  /home/*/*|/Users/*/*) ;;
  /|/root|/home|/home/*|/Users|/Users/*)
    echo "agenthix-site: refusing SITE_ROOT=$SITE_ROOT — it is a whole home or system folder, and the site would take its ownership." >&2
    echo "  Give the site a folder of its own, e.g. ~/agenthix-site-data on the host." >&2
    exit 1
    ;;
esac
# True when the folder's file system accepts chown but keeps no ownership,
# tried on a file of its own that is removed again.
ownership_ignored() {
  probe="$1/.ownership-probe.$$" kept=
  : > "$probe" 2>/dev/null || return 1
  chown 1001 "$probe" 2>/dev/null && kept=$(stat -c %u "$probe")
  rm -f "$probe"
  [ "${kept:-1001}" != "1001" ]
}
# The folder is mounted at its host path, so the folders above it exist only in this container's own file system
# (the image's /root is mode 0700): without them enterable, appuser cannot reach the data folder at all. Only the
# right to enter them is added, for others; nothing on the host changes.
open_ancestors() {
  dir=$(dirname "$1")
  while [ "$dir" != "/" ] && [ "$dir" != "." ]; do
    su-exec appuser test -x "$dir" || chmod o+x "$dir"
    dir=$(dirname "$dir")
  done
}
if [ ! -e "$root" ]; then
  mkdir -p "$root"
  chown appuser:appuser "$root"
elif [ "$(stat -c %u "$root")" = "1001" ]; then
  :
elif [ -z "$(ls -A "$root")" ]; then
  chown appuser:appuser "$root"
elif ownership_ignored "$root" && su-exec appuser test -w "$root"; then
  # A folder shared from a Mac by Docker Desktop shows as root's whatever chown
  # does, so no ownership can be taken from anyone: the site uses it as it is.
  :
else
  echo "agenthix-site: SITE_ROOT=$SITE_ROOT already holds files and is not owned by the site's user (uid 1001)." >&2
  echo "  Point SITE_ROOT at an empty folder, or give this one to uid 1001: sudo chown 1001 $SITE_ROOT" >&2
  exit 1
fi
open_ancestors "$root"
exec su-exec appuser "$@"

#!/bin/sh
set -eu

# Managed-host volumes are commonly mounted as root. Fix only the mount point,
# then run the application itself without root privileges.
install -d -o node -g node "${LOG_DIR:-/data}"
exec gosu node "$@"

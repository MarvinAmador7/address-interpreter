#!/usr/bin/env bash
set -euo pipefail

npm run build >/dev/null
npm pack --dry-run

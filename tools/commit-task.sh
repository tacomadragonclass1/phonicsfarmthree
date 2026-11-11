#!/bin/bash
# tools/commit-task.sh "<subject>" <model-name> <paths...>
# Commit one reviewed task. Local only; never pushes.
set -eu
cd "$(dirname "$0")/.."
SUBJECT="$1"; MODEL="$2"; shift 2
git add -- "$@"
git commit -q -m "$SUBJECT

Implemented by a local model ($MODEL) from its brief in docs/briefs;
reviewed and unit-tested by the architect.

Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>"
git log --oneline -1

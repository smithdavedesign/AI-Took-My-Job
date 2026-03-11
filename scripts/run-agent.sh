#!/usr/bin/env sh
set -eu

cd /opt/render/project/src
exec node dist/scripts/agents/render-coding-agent.js "$@"
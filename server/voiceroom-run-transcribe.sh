#!/bin/bash
# voiceroom-20261029: run the after-the-fact transcription with the server's existing AssemblyAI key (never printed).
# Usage: run-transcribe.sh BR-XXXX-YYYY [--dry-run] [--force]   or   run-transcribe.sh --ended
set -euo pipefail
set -a; [ -r /etc/hubface/assemblyai.env ] && . /etc/hubface/assemblyai.env; set +a
cd /opt/hubface/server && exec /usr/bin/node voiceroom-transcribe.mjs "$@"

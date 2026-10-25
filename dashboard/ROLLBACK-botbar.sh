#!/bin/sh
# botbar-20261021a rollback
cd /opt/hubface/dashboard && cp -p index.html.bak-20261021-144353-pre-botbar index.html && cp -p tv/voice-layer.js.bak-20261021-144353-pre-botbar tv/voice-layer.js && echo rolled back

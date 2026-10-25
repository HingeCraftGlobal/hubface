#!/bin/sh
# roomfix-20261021a rollback: remove only the include line (keeps other workers' edits), files stay
cd /opt/hubface/dashboard && cp -p index.html index.html.bak-$(date +%Y%m%d-%H%M%S)-pre-roomfix-rollback && sed -i '/roomfix-20261021a.js/d' index.html && echo rolled back

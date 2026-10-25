#!/bin/bash
cd /opt/hubface/dashboard && cp -p index.html index.html.bak-$(date +%Y%m%d-%H%M%S)-pre-tff-rollback
sed -i '/testerfix-20261021f.js?v=testerfix-20261021f/d' index.html && echo rolled back f (full pre-change copy: /opt/hubface/backups/testerfix-f-20261021-184635/index.html)

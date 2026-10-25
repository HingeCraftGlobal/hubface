#!/bin/bash
cd /opt/hubface/dashboard && cp -p index.html index.html.bak-$(date +%Y%m%d-%H%M%S)-pre-tfd-rollback
sed -i '/testerfix-20261021d.js?v=testerfix-20261021d/d' index.html && echo rolled back d (full pre-change copy: /opt/hubface/backups/testerfix-d-20261021-181345/index.html)

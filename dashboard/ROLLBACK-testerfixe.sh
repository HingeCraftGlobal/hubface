#!/bin/bash
cd /opt/hubface/dashboard && cp -p index.html index.html.bak-$(date +%Y%m%d-%H%M%S)-pre-tfe-rollback
sed -i '/testerfix-20261021e.js?v=testerfix-20261021e/d' index.html && echo rolled back e (full pre-change copy: /opt/hubface/backups/testerfix-e-20261021-183244/index.html)

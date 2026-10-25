#!/bin/bash
cd /opt/hubface/dashboard && cp -p index.html index.html.bak-$(date +%Y%m%d-%H%M%S)-pre-tfg-rollback
sed -i 's#<script src="testerfix-20261021g-head.js[^>]*></script>##' index.html
sed -i '/testerfix-20261021g2\?.js?v=testerfix-20261021g2\?/d' index.html && echo rolled back g (full pre-change copy: /opt/hubface/backups/testerfix-g-20261021-185252/index.html)

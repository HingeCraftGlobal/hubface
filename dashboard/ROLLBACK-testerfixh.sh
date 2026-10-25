#!/bin/bash
cd /opt/hubface/dashboard && cp -p index.html index.html.bak-$(date +%Y%m%d-%H%M%S)-pre-tfh-rollback
sed -i 's#<script src="testerfix-20261021h-head.js[^>]*></script>##' index.html
sed -i '/testerfix-20261021h.js?v=testerfix-20261021h/d' index.html && echo rolled back h (full pre-change copy: /opt/hubface/backups/testerfix-h-20261021-190357/index.html)

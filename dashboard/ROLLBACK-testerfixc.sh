#!/bin/bash
# testerfix-20261021c rollback: removes only the two c tags
cd /opt/hubface/dashboard && cp -p index.html index.html.bak-$(date +%Y%m%d-%H%M%S)-pre-tfc-rollback
sed -i 's#<script src="testerfix-20261021c-head.js[^>]*></script>##' index.html
sed -i '/testerfix-20261021c.js?v=testerfix-20261021c/d' index.html && echo rolled back c (full pre-change copy: /opt/hubface/backups/testerfix-c-20261021-180828/index.html)

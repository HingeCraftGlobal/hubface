#!/bin/bash
# testerfix-20261021b rollback: removes both b include lines only
cd /opt/hubface/dashboard && cp -p index.html index.html.bak-$(date +%Y%m%d-%H%M%S)-pre-tfb-rollback
sed -i 's#<script src="testerfix-20261021b-head.js[^>]*></script>##;s#<!-- testerfix-20261021b-head -->##' index.html
sed -i '/testerfix-20261021b2\?.js?v=testerfix-20261021b2\?/d' index.html && echo rolled back b (full pre-change copy: /opt/hubface/backups/testerfix-b-20261021-175628/index.html)

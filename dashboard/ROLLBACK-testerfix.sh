#!/bin/bash
# testerfix-20261021a rollback: removes only the two a include tags (head tag shares line 3 with other tags, so substring removal)
cd /opt/hubface/dashboard && cp -p index.html index.html.bak-$(date +%Y%m%d-%H%M%S)-pre-tf-rollback
sed -i 's#<script src="testerfix-20261021a-head.js[^>]*></script>##;s#<!-- testerfix-20261021a-head -->##' index.html
sed -i '/testerfix-20261021a.js?v=testerfix-20261021a/d' index.html && echo rolled back a (full pre-change copy: /opt/hubface/backups/testerfix-a-20261021-172105/index.html)

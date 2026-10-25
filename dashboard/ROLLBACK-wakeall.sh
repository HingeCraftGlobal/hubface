#!/bin/bash
# wakeall-20261021a rollback: remove only the wakeall tag (keeps other workers' later edits) and the include file
set -e
cp -p /opt/hubface/dashboard/index.html /opt/hubface/dashboard/index.html.bak-$(date +%Y%m%d-%H%M%S)-pre-wakeall-rollback
sed -i 's#<script src="wakeall-20261021a.js?v=wakeall-20261021a"></script><!-- wakeall-20261021a[^>]*-->##' /opt/hubface/dashboard/index.html
rm -f /opt/hubface/dashboard/wakeall-20261021a.js
echo rolled back wakeall-20261021a. Full pre-edit copy: /opt/hubface/backups/wakeall-20261021a-20261021-165013/index.html

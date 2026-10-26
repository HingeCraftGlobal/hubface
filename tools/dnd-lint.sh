#!/bin/bash
# widgetdnd-20261025 regression lint (no browser needed). Cron: daily. Log: /var/log/hubface-dnd-lint.log
D=/opt/hubface/dashboard; L=/var/log/hubface-dnd-lint.log; bad=""
grep -q 'src="widgetdnd-20261025.js' $D/index.html || bad="$bad owner-script-tag-missing;"
grep -q 'window.__widgetDnd||e.button' $D/dash-row.js || bad="$bad dash-row-guard-removed;"
# any OTHER script that adds pointer/mouse-down handling for Builder .witem rows competes with the owner script
LOADED=$(grep -o -E "src=\"?[A-Za-z0-9_./-]+\.js" $D/index.html | sed -E "s/src=\"?//;s|^/interface/||" | sort -u | sed "s|^|$D/|")
hits=$(grep -l -E "(pointerdown|mousedown)" $LOADED 2>/dev/null | xargs grep -l -E "closest\(['\"][^'\"]*\.witem" 2>/dev/null | grep -v -E "/(widgetdnd-20261025|dash-row|hf-track|widgetfix-20261021i)\.js$")
[ -n "$hits" ] && bad="$bad competing-handlers:$(echo $hits|tr ' ' ',');"
echo "$(date '+%F %T %Z') $([ -z "$bad" ] && echo PASS || echo "FAIL$bad")" >> $L

#!/bin/bash
# undo agentpanel-20261021f: restore agent-panel.js, swap only the one tag back (keeps other workers' index.html edits)
set -e; D=/opt/hubface/dashboard
cp -p $D/agent-panel.js.bak-20261021-150733-pre-apf $D/agent-panel.js
sed -i 's#agent-panel.js?v=agentpanel-20261021f"#agent-panel.js?v=agentpanel-20261021e"#' $D/index.html
echo "rolled back to agentpanel-20261021e; hard-refresh"

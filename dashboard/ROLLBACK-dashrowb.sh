#!/bin/sh
# dashrow-20261021b rollback
cd /opt/hubface/dashboard && cp -p index.html.bak-20261021-151109-pre-dashrowb index.html && cp -p dash-row.js.bak-20261021-151109-pre-dashrowb dash-row.js && echo rolled back

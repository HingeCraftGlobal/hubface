#!/bin/sh
# floorplan-20261021c rollback: restore home-status.js; undo only our two index.html tokens
cd /opt/hubface/dashboard
cp home-status.js.bak-20261021-162828-pre-floorplanc home-status.js
sed -i "s/home-status.js?v=floorplan-20261021c/home-status.js?v=homestatus-20261021b/; s/'home-plan':1,weather:1,/weather:1,/" index.html
echo rolled back floorplan-20261021c

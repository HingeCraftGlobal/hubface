#!/bin/sh
# moderatortile-20261021b rollback: restore previous moderator.js + cache-buster (full removal: ROLLBACK-moderator.sh)
cd /opt/hubface/dashboard && cp moderator.js.bak-20261021-133001-pre-modtile moderator.js && sed -i 's#moderator.js?v=moderator-20261021b#moderator.js?v=moderator-20261021a#' index.html && echo rolled back

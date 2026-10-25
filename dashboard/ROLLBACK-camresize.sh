#!/bin/sh
# camresize-20261021a rollback: remove only the include line and the 2 home-status hooks (keeps other workers' edits)
cd /opt/hubface/dashboard && cp -p index.html index.html.bak-$(date +%Y%m%d-%H%M%S)-pre-camresize-rollback && sed -i '/camresize-2026102/d' index.html && sed -i 's/_S:function(){return S;},_save:function(){save();},//' home-status.js && echo rolled back

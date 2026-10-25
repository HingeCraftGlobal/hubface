#!/bin/bash
# botlang-20261021a rollback: removes only the botlang include line from index.html (backup: index.html.bak-20261021-171053-pre-botlang)
cd /opt/hubface/dashboard && cp -p index.html index.html.bak-$(date +%Y%m%d-%H%M%S)-pre-botlang-rollback && sed -i '/botlang-20261021a\.js/d' index.html && echo rolled back

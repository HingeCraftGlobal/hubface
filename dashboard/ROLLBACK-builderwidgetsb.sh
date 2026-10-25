#!/bin/bash
# Removes only the builderwidgets-20261021b tag (keeps other workers' later edits)
cd /opt/hubface/dashboard && cp -p index.html index.html.bak-$(date +%Y%m%d-%H%M%S)-pre-rollback-bwb && sed -i 's#<link rel="stylesheet" href="builderwidgets-20261021b.css?v=builderwidgets-20261021b"><script src="builderwidgets-20261021b.js?v=builderwidgets-20261021b"></script><!-- builderwidgets-20261021b -->##' index.html && echo rolled back

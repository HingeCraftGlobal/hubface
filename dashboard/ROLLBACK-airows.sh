#!/bin/sh
cd /opt/hubface/dashboard && perl -0pi -e 's#<script src="ai-rows\.js\?v=[^"]*" defer></script><!-- airows-20261021a[^>]*-->##' index.html && rm -f ai-rows.js && echo rolled back

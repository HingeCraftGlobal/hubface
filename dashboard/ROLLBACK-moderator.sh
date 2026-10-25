#!/bin/sh
# moderator-20261021a rollback: remove the script tag (keeps other workers' later edits)
cd /opt/hubface/dashboard && perl -0pi -e 's#<script src="moderator\.js\?v=[^"]*" defer></script><!-- moderator-20261021a[^>]*-->##' index.html && rm -f moderator.js && echo rolled back

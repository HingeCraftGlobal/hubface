#!/bin/bash
# Removes the i18n-all-20261022a files (and the script tag if it was applied). No restart needed.
D=/opt/hubface/dashboard
if grep -q 'i18n-all-20261022a.js' $D/index.html; then cp -p $D/index.html /opt/hubface/backups/index.html.pre-i18n-rollback-$(date +%Y%m%d-%H%M%S); sed -i 's#<script src="i18n-all-20261022a.js[^>]*></script><!-- i18n-all-20261022a:[^>]*-->##' $D/index.html; fi
rm -rf $D/i18n-all-20261022a.js $D/i18n-20261022a; echo "rolled back i18n-all-20261022a"

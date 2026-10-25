#!/bin/sh
# modvoice-20261021a rollback: remove only the include line, keep everyone else's edits
cd /opt/hubface/dashboard
sed -i '/modvoice-20261021a\.js/d' index.html
rm -f modvoice-20261021a.js
echo rolled back modvoice-20261021a

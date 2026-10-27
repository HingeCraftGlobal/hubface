#!/bin/sh
cd /opt/hubface/dashboard
sed -i 's#<script src="avalong-20261026a.js?v=avalong1"></script>##' index.html
echo rolled back avalong-20261026a

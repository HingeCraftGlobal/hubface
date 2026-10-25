#!/bin/sh
cp -p /opt/hubface/dashboard/roomfix-20261021a.js.bak-20261021-162859-pre-avamute /opt/hubface/dashboard/roomfix-20261021a.js
sed -i "s/roomfix-20261021a.js?v=avamute-20261021a/roomfix-20261021a.js?v=roomfix-20261021a/" /opt/hubface/dashboard/index.html
echo rolled back avamute-20261021a

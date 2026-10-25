#!/bin/bash
# unify-20261024: build.json = valid JSON whose id is a hash of every top-level dashboard file (not build.json). Any edit changes it, so open windows reload.
cd /opt/hubface/dashboard || exit 1
H=$(find . -maxdepth 1 -type f ! -name build.json ! -name "*.bak*" -printf "%f %s %T@\n" | sort | sha1sum | cut -c1-12)
N="{\"build\":\"hf-$H\"}"
[ "$(cat build.json 2>/dev/null)" = "$N" ] || echo "$N" > build.json

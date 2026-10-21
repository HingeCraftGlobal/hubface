# usage: bash rs-say.sh <ROOM> <text> [speak] [chat]   (reads /etc/hubface/yoda-say.key into a 600 temp header file; never prints it)
set -eu
H=$(mktemp); chmod 600 $H; printf 'X-Yoda-Key: %s\n' "$(cat /etc/hubface/yoda-say.key)" > $H
BODY=$(python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1], "speak": sys.argv[2] != "0", "chat": sys.argv[3] != "0"}))' "$2" "${3:-1}" "${4:-1}")
curl -sk -w ' HTTP %{http_code}\n' -X POST -H 'Host: hubface.org' -H "@$H" -H 'Content-Type: application/json' -d "$BODY" "https://127.0.0.1/api/rooms/$1/say"
rm -f $H

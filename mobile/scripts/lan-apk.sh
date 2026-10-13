#!/usr/bin/env bash
# Builds a test APK pointed at this machine on the local network.
#
# For trying the app on a real handset before anything is deployed: the phone
# and this machine have to be on the same wifi, and `pnpm dev -p 3210` has to be
# running in the server's directory. The address is baked into the APK, so a new
# one is needed whenever this machine's address changes — which it does, every
# time the router hands out a new lease.
set -euo pipefail

PORT="${PORT:-3210}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
IP="${LAN_IP:-$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)}"

if [[ -z "$IP" ]]; then
  echo "Could not work out this machine's address on the network." >&2
  echo "Pass it: LAN_IP=192.168.1.42 $0" >&2
  exit 1
fi

echo "Building against http://$IP:$PORT"

# Android refuses plain HTTP unless the host is named, so name it.
CONFIG="$HERE/android/app/src/main/res/xml/network_security_config.xml"
python3 - "$CONFIG" "$IP" <<'PY'
import re, sys
path, ip = sys.argv[1], sys.argv[2]
s = open(path).read()
s = re.sub(
    r"(<!-- LAN:BEGIN[^>]*-->)(.*?)(\s*<!-- LAN:END -->)",
    lambda m: f'{m.group(1)}\n        <domain includeSubdomains="false">{ip}</domain>{m.group(3)}',
    s, flags=re.S,
)
open(path, "w").write(s)
print(f"  permitted cleartext to {ip}")
PY

if ! curl -fsS -o /dev/null --max-time 5 "http://$IP:$PORT/login"; then
  echo
  echo "  WARNING: nothing answered at http://$IP:$PORT/login."
  echo "  Start the server first:  pnpm dev -p $PORT"
  echo "  Building anyway — the APK will work once it is up."
  echo
fi

cd "$HERE"
flutter build apk --release --split-per-abi --dart-define="NN_BASE_URL=http://$IP:$PORT"

echo
echo "Install on a phone over USB:"
echo "  adb install -r build/app/outputs/flutter-apk/app-arm64-v8a-release.apk"
echo
echo "If the app cannot reach the server, check in this order:"
echo "  1. the phone is on the same wifi as this machine"
echo "  2. pnpm dev -p $PORT is running and says Network: http://$IP:$PORT"
echo "  3. this machine's address is still $IP"

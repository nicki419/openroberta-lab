#!/bin/bash
# starts a headless Chrome for phase 5 with remote debugging on port ${1:-9333} (its own profile in ../.chrome, git-ignored), without the throttling of timers and the
# freezing of pages that Chrome applies to pages nobody looks at: the simulator's runs yield with setTimeout between pieces
PORT=${1:-9333}
curl -s "http://127.0.0.1:$PORT/json/version" > /dev/null && exit 0  # already running
PROFILE="$(cd "$(dirname "$0")/.." && pwd)/.chrome/chrome-$PORT"
mkdir -p "$PROFILE"
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --remote-debugging-port=$PORT --user-data-dir="$PROFILE" \
    --window-size=1700,1000 --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows \
    --disable-features=IntensiveWakeUpThrottling,CalculateNativeWinOcclusion about:blank > "$PROFILE.log" 2>&1 &
for i in $(seq 1 30); do
    curl -s "http://127.0.0.1:$PORT/json/version" > /dev/null && exit 0
    sleep 1
done
echo "Chrome did not start on port $PORT" >&2
exit 1

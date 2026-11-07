#!/bin/bash
# opens the Lab in the headless Chrome, chooses the Edison V2, collects page errors in window.__errs
cd "$(dirname "$0")"
node cdp.mjs eval 'window.onbeforeunload = null; $(window).off("beforeunload"); return 1' > /dev/null 2>&1
node cdp.mjs nav http://localhost:1999/ 9000
xy=$(node cdp.mjs eval edison.js | tr -d '"')
node cdp.mjs click $xy
sleep 4
node cdp.mjs eval 'window.__errs = []; window.addEventListener("error", (e) => window.__errs.push(String(e.message))); window.addEventListener("unhandledrejection", (e) => window.__errs.push("rejection: " + String(e.reason && (e.reason.stack || e.reason)))); return GUISTATE_C_ok = !!document.getElementById("tabTests")'

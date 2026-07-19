# Studio drag — real-Chromium acceptance tests (v197)

Real mouse gestures via Playwright. No jsdom, no dispatchEvent("dragstart") anywhere.

## One-time setup (from repo root)
    npm i -D playwright-core esbuild react react-dom tailwindcss@3 @types/react @types/react-dom
    npx playwright install chromium

## Build the harness (bundles the REAL src/DesignStage with fixture data)
    npx esbuild browser-tests/app.tsx --bundle --outfile=browser-tests/app.js --jsx=automatic --define:process.env.NODE_ENV='"development"' --alias:@=./src
    npx tailwindcss -c browser-tests/tailwind.harness.config.js -i browser-tests/tw.css -o browser-tests/app.css --minify
    # ^ the -c is LOAD-BEARING (v217): the production tailwind config lives at
    #   repo root outside the zips, so a configless CLI emits ZERO utilities
    #   and every geometry assertion measures plain block flow.

## Run
    node browser-tests/accept.mjs              # 12 acceptance tests, real mouse — must be 12/12
    RECORD=1 node browser-tests/accept.mjs     # same, filmed to /tmp/video/*.webm
    node browser-tests/accept-regression.mjs   # proves the suite CATCHES the original bug (expects FAILs)
    node browser-tests/dwell-instrumented.mjs  # 700ms dwell autopsy: timer + enter/leave stream
    node browser-tests/control.mjs             # driver sanity: bare <span draggable> must drag

accept-regression serves a bundle with ONLY the drag.start deferral reverted; it must
FAIL tests 2–5 and 7–9 with "CHROMIUM CANCELED THE DRAG" — if it passes, the tests
have lost their teeth.

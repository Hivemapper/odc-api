#!/bin/bash

echo "Testing odc-api"

cd compiled
# mkdir -p lib/binding/napi-v6-darwin-unknown-arm64/
# cp build/Release/node_sqlite3.node lib/binding/napi-v6-darwin-unknown-arm64/
node odc-api-github-linux-environment.js 2>&1 | tee dashcam-logs.log &
odc_api_pid=$!
sleep 10

echo "done"
kill $odc_api_pid

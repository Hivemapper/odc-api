#!/bin/bash

echo "Testing odc-api"

cd ../compiled
node odc-api-github-linux-environment.js 2>&1 | tee dashcam-logs.log &
#node dashcam-api.js 2>&1 | tee dashcam-logs.log &
odc_api_pid=$!
sleep 40

echo "done"
kill $odc_api_pid
sleep 5

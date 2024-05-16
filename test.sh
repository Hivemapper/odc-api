#!/bin/bash

echo "Testing odc-api"

cd compiled
node dashcam-api.js 2>&1 | tee dashcam-logs.log &
odc_api_pid=$!
sleep 10

echo "done"
kill $odc_api_pid

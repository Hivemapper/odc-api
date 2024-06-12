#!/bin/bash

setup_configs() {
    local testname=$1

    # Default values:

    # How long in seconds odc-api should run before the test terminates.
    TEST_TIMEOUT=30

    source ../end-to-end-test/tests/${testname}/config.sh
}

setup_dirs() {
    local testname=$1

    cd ../compiled
    rm -rf ./dashcam-logs
    rm -rf ../end-to-end-test/mnt
    rm -rf ../end-to-end-test/tmp

    mkdir -p ./dashcam-logs
    mkdir -p ../end-to-end-test/mnt/data/metadata
    mkdir -p ../end-to-end-test/mnt/data/unprocessed_framekm
    mkdir -p ../end-to-end-test/mnt/data/framekm
    mkdir -p ../end-to-end-test/mnt/data/gps
    mkdir -p ../end-to-end-test/tmp/recording/pic

    cp ../end-to-end-test/tests/${testname}/reference/transformed/db/data-logger.v1.4.5.db* ../end-to-end-test/mnt/data/
    cp ../end-to-end-test/tests/${testname}/reference/transformed/image/* ../end-to-end-test/tmp/recording/pic/
    cp ../end-to-end-test/tests/${testname}/reference/transformed/gps/latest.log ../end-to-end-test/mnt/data/gps/
}

run_test () {
    local testname=$1

    if [ `uname` == "Darwin" ]; then
        node dashcam-api.js 2>&1 & 
    else
        node odc-api-github-linux-environment.js 2>&1 | tee dashcam-logs.log &
    fi
    local odc_api_pid=$!
    sleep $TEST_TIMEOUT

    echo "done"
    kill $odc_api_pid
    sleep 5
}

move_contents_to_results() {
    local testname=$1

    echo "Moving contents to results"

    rm -rf ../end-to-end-test/tests/${testname}/results
    mkdir -p ../end-to-end-test/tests/${testname}/results
    cp -r ../end-to-end-test/mnt/data* ../end-to-end-test/tests/${testname}/results/
    cp ./dashcam-logs.log ../end-to-end-test/tests/${testname}/results/
}

echo "Testing odc-api"

for testname in $(ls tests); do
    setup_configs ${testname}
    setup_dirs ${testname}
    run_test ${testname}
    move_contents_to_results ${testname}
done

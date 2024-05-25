#!/bin/bash

# TODO: Use an IAM role to download these files via AWS CLI
#       The main reason to do this is that it would allow us to
#       download the tests/ directory directly, whereas HTTP doesn't support this.
download_test_data () {
    testname=$1
    echo testname: ${testname}
    rm -rf ./tests/${testname}/reference
    mkdir -p ./tests/${testname}/reference/metadata
    mkdir -p ./tests/${testname}/reference/image
    mkdir -p ./tests/${testname}/reference/db

    echo "Downloading database"
    wget -O ./tests/${testname}/reference/db/data-logger.v1.4.5.db https://hdc-firmware.s3.us-west-2.amazonaws.com/cicd-test/tests/test1/db/data-logger.v1.4.5.db
    wget -O ./tests/${testname}/reference/db/data-logger.v1.4.5.db-shm https://hdc-firmware.s3.us-west-2.amazonaws.com/cicd-test/tests/test1/db/data-logger.v1.4.5.db-shm
    wget -O ./tests/${testname}/reference/db/data-logger.v1.4.5.db-wal https://hdc-firmware.s3.us-west-2.amazonaws.com/cicd-test/tests/test1/db/data-logger.v1.4.5.db-wal

    echo "Downloading metadata"
    wget -O ./tests/${testname}/reference/metadata/km_20240510_021044_3_0.json https://hdc-firmware.s3.us-west-2.amazonaws.com/cicd-test/tests/test1/metadata/km_20240510_021044_3_0.json

    echo "Downloading image"
    wget -O ./tests/${testname}/reference/image/72.jpg https://hdc-firmware.s3.us-west-2.amazonaws.com/cicd-test/reference/image/72.jpg
}


download_test_data test1

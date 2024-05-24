#!/bin/bash

download_test_data () {
    testname=$1
    echo testname: ${testname}
    mkdir -p ./tests/${testname}/reference/metadata
    mkdir -p ./tests/${testname}/reference/image

    echo "Downloading database"
    wget -O ./tests/${testname}/data-logger.v1.4.5.db https://hdc-firmware.s3.us-west-2.amazonaws.com/cicd-test/dbs/data-logger.v1.4.5.db
    wget -O ./tests/${testname}/data-logger.v1.4.5.db-shm https://hdc-firmware.s3.us-west-2.amazonaws.com/cicd-test/dbs/data-logger.v1.4.5.db-shm
    wget -O ./tests/${testname}/data-logger.v1.4.5.db-wal https://hdc-firmware.s3.us-west-2.amazonaws.com/cicd-test/dbs/data-logger.v1.4.5.db-wal

    echo "Downloading metadata"
    wget -O ./tests/${testname}/reference/metadata/km_20240521_202027_3_0.json https://hdc-firmware.s3.us-west-2.amazonaws.com/cicd-test/reference/metadata/km_20240521_202027_3_0.json

    echo "Downloading image"
    wget -O ./tests/${testname}/reference/image/72.jpg https://hdc-firmware.s3.us-west-2.amazonaws.com/cicd-test/reference/image/72.jpg
}

while IFS=' ' read -r -a testname; do
    download_test_data ${testname}
done < tests.txt
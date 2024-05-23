#!/bin/bash

mkdir -p ./reference/metadata
mkdir -p ./reference/image

echo "Downloading database"
wget -O ./data-logger.v1.4.5.db https://hdc-firmware.s3.us-west-2.amazonaws.com/cicd-test/dbs/data-logger.v1.4.5.db
wget -O ./data-logger.v1.4.5.db-shm https://hdc-firmware.s3.us-west-2.amazonaws.com/cicd-test/dbs/data-logger.v1.4.5.db-shm
wget -O ./data-logger.v1.4.5.db-wal https://hdc-firmware.s3.us-west-2.amazonaws.com/cicd-test/dbs/data-logger.v1.4.5.db-wal

echo "Downloading metadata"
wget -O ./reference/metadata/km_20240521_202027_3_0.json https://hdc-firmware.s3.us-west-2.amazonaws.com/cicd-test/reference/metadata/km_20240521_202027_3_0.json

echo "Downloading image"
wget -O ./reference/image/72.jpg https://hdc-firmware.s3.us-west-2.amazonaws.com/cicd-test/reference/image/72.jpg

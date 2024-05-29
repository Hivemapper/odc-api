#!/bin/bash

# not used in automated testing. Just a convenience so you don't have to remember the command.
aws s3 cp s3://hdc-firmware/cicd-test/tests/ ./tests --recursive

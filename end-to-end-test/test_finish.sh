
any_failed=0

check_results () {
  testname=$1
  failure=0

  echo "Testing odc-api"
  echo "Checking for files in framekm folder"

  result_path="./tests/${testname}/results/data"
  reference_path="./tests/${testname}/reference"

  if [[ `ls $result_path/framekm | wc -l` -eq 0 ]]
  then
      echo "No files found in framekm folder"
      exit 1
  fi

  echo "Checking contents of metadata folder"

  for reference_metadata_file in $reference_path/metadata/*; do
    result_metadata_file=$result_path/metadata/$(basename $reference_metadata_file)

    # sorts the keys in the json files and pretty prints them
    jq --sort-keys . $result_metadata_file > result.json
    if [[ $? -ne 0 ]]
    then
      failure=1
      continue
    fi

    jq --sort-keys . $reference_metadata_file > reference.json
    if [[ $? -ne 0 ]]
    then
      failure=1
      continue
    fi

    diff result.json reference.json
    result=$?
    if [[ $result -eq 0 ]]
    then
      echo "Metadata file $(basename $result_metadata_file) matches reference"
    else
      # TODO: Make the diff visible and clear
      echo "Metadata file $(basename $result_metadata_file) does not match reference"
      failure=1
    fi
  done

  # report any unexpected files in the results folder
  result_files=$(find $result_path/metadata -type f -exec basename {} \; | sort)
  for result_file in $result_files; do
    if [[ ! -f $reference_path/metadata/$result_file ]]
    then
      echo "Warning: unexpected file $result_file in results folder"
    fi
  done

  if [[ $failure -ne 0 ]]
  then
      echo "Test $testname failed"
      any_failed=1
  fi
}

for testname in $(ls tests); do
  echo "Checking results for $testname"
  check_results $testname
done

if [[ $any_failed -ne 0 ]]; then
  echo "Test suite ended with failures"
  exit 1
fi
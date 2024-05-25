
any_failed=0

check_results () {
  testname=$1
  failure=0

  echo "Testing odc-api"
  echo "Checking for files in framekm folder"

  framekm_path="./tests/${testname}/results/data/framekm"
  metadata_path="./tests/${testname}/results/data/metadata"
  reference_path="./tests/${testname}/reference"

  if [[ `ls $framekm_path | wc -l` -eq 0 ]]
  then
      echo "No files found in framekm folder"
      exit 1
  fi

  echo "Checking contents of metadata folder"

  reference_files=$reference_path/metadata/*
  result_files=$metadata_path/*

  # TODO: More robust way to match up metadata files. We're assuming that the files are in the same order
  for ((i=0; i<${#result_files[@]}; i++)); do
    result_file=${result_files[$i]}
    reference_file=${reference_files[$i]}

    # sorts the keys in the json files and removes the time based fields
    jq --sort-keys . $result_file > result.json
    jq --sort-keys . $reference_file > reference.json

    echo $result_contents

    diff result.json reference.json
    result=$?
    if [[ $result -eq 0 ]]
    then
      echo "Metadata file $(basename $result_file) matches reference $(basename $reference_file)"
    elif [[ $result -eq 1 ]]
    then
      # TODO: Make the diff visible and clear
      echo "Metadata file $(basename $result_file) does not match reference $(basename $reference_file)"
      failure=1
    elif [[ $result -eq 2 ]]
    then
      echo "Metadata file $(basename $result_file) does not exist"
      failure=1
    fi
  done

  find "$metadata_path" -type f -exec basename {} \; | sort > files_in_metadata.txt
  find "$reference_path/metadata" -type f -exec basename {} \; | sort > files_in_reference.txt

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
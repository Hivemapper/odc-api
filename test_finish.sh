METADATA_PATH=./compiled/mnt/data/metadata
FRAMEKM_PATH=./compiled/mnt/data/framekm
REFERENCE_PATH=./reference

FAILURE=0

echo "Testing odc-api"
echo "Checking for files in framekm folder"

if [[ `ls $FRAMEKM_PATH | wc -l` -eq 0 ]]
then
    echo "No files found in framekm folder"
    exit 1
fi

echo "Checking contents of metadata folder"

reference_files=$REFERENCE_PATH/metadata/*

for file in $reference_files
do
  diff -q $file $REFERENCE_PATH/metadata/$(basename $file) 2> /dev/null
  result=$?
  if [[ $result -eq 1 ]]
  then
    echo "Metadata file $(basename $file) does not match reference"
  elif [[ $result -eq 2 ]]
  then
    echo "Metadata file $(basename $file) does not exist"
    FAILURE=1
  elif [[ $result -eq 0 ]]
  then
    echo "Metadata file $(basename $file) matches reference"
    FAILURE=1
  fi
done

find "$METADATA_PATH" -type f -exec basename {} \; | sort > files_in_metadata.txt
find "$REFERENCE_PATH/metadata" -type f -exec basename {} \; | sort > files_in_reference.txt

# Files only in dir1
echo "Files only in $METADATA_PATH:"
comm -23 files_in_metadata.txt files_in_reference.txt
echo

exit $FAILURE
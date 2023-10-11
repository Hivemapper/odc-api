#!/bin/bash

if [ "$#" -ne 3 ]; then
    echo "Usage: $0 framekm_folder metadata_folder log_file_path"
    exit 1
fi

folder1="$1"
folder2="$2"
file_path="$3"

# Check if folder1 and folder2 exist
if [[ ! -d "$folder1" ]]; then
    echo "Error: $folder1 does not exist"
    exit 1
fi

if [[ ! -d "$folder2" ]]; then
    echo "Error: $folder2 does not exist"
    exit 1
fi

max_file_size=$((2 * 1024 * 1024))
min_file_size=$((100 * 1024))

# Remove all empty files from folder2
find "$folder2" -type f -size 0 -exec rm -f {} +

# Remove framekm files less than 100 KB and corresponding metadata files
find "$folder1" -type f -size -${min_file_size}c | while read -r file; do
    base_name=$(basename "$file")
    json_file="${folder2}/${base_name}.json"
    
    echo "Removing: $file and $json_file"
    rm -f "$file" "$json_file"
done

# Process files in folder1
find "$folder1" -type f | while read -r file; do
    base_name=$(basename "$file")
    json_file="${folder2}/${base_name}.json"
    
    if [[ ! -s "$json_file" ]]; then
        echo "Removing: $file"
        rm -f "$file"
    fi
done

# Process JSON files in folder2
# If json exists in folder2 but corresponding file doesn't exist in folder1, remove json in folder2
find "$folder2" -type f -name "*.json" | while read -r json; do
    base_name=$(basename "$json" .json)
    file="${folder1}/${base_name}"
    
    if [[ ! -e "$file" ]]; then
        echo "Removing: $json"
        rm -f "$json"
    fi
done

# Check and truncate the file if it's larger than 2 MB
if [ -e "$file_path" ]; then
    file_size=$(stat -c%s "$file_path")
    if [ $file_size -gt $max_file_size ]; then
        tail -c $max_file_size "$file_path" > "${file_path}.tmp" && mv "${file_path}.tmp" "$file_path"
        echo "Truncated $file_path to the last 2 MB"
    fi
fi
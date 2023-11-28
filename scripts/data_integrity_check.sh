#!/bin/bash

if [ "$#" -ne 4 ]; then
    echo "Usage: $0 framekm_folder metadata_folder log_file_path events_file_path"
    exit 1
fi

folder1="$1"
folder2="$2"
log_file_path="$3"
events_file_path="$4"
max_file_size=$((2 * 1024 * 1024)) # 2MB
min_file_size=$((100 * 1024)) # 100KB

# Remove all empty files from folder2
find "$folder2" -type f -empty -exec rm -f {} +

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

# Check and truncate the file if it's larger than 2 MB
if [ -e "$log_file_path" ]; then
    file_size=$(stat -c%s "$log_file_path")
    if [ $file_size -gt $max_file_size ]; then
        tail -c $max_file_size "$log_file_path" > "${log_file_path}.tmp" && mv "${log_file_path}.tmp" "$log_file_path"
        echo "Truncated $log_file_path to the last 2 MB"
    fi
fi

if [ -e "$events_file_path" ]; then
    file_size=$(stat -c%s "$events_file_path")
    if [ $file_size -gt $max_file_size ]; then
        tail -c $max_file_size "$events_file_path" > "${events_file_path}.tmp" && mv "${events_file_path}.tmp" "$events_file_path"
        echo "Truncated $events_file_path to the last 2 MB"
    fi
fi
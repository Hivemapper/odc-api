#!/bin/bash

if [ "$#" -ne 3 ]; then
    echo "Usage: $0 framekm_folder metadata_folder highwater_mark_GB"
    exit 1
fi

folder1="$1"
folder2="$2"
highwater_mark=$(($3 * 1024 * 1024 * 1024))

current_size=$(du -s "$folder1" | awk '{print $1}')

if [ $current_size -gt $highwater_mark ]; then
    required_size_to_remove=$((current_size - highwater_mark))
    
    files_to_remove=$(find "$folder1" -type f -printf "%T@ %s %p\n" | sort -n | awk -v size_to_remove="$required_size_to_remove" 'BEGIN { removed=0; } { if (removed < size_to_remove) { print $3; removed+=$2; } else { exit; } }')
    echo "$files_to_remove" | while read -r file_to_remove; do
        json_file_to_remove=$(basename "$file_to_remove")
        rm -f "$file_to_remove" "${folder2}/${json_file_to_remove}.json"
        echo "Removed: $file_to_remove and ${json_file_to_remove}.json"
    done
fi
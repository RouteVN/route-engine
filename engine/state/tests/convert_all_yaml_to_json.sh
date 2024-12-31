#!/bin/bash

# Ensure `yq` is installed
if ! command -v yq &> /dev/null; then
    echo "yq is not installed. Please install yq and try again."
    exit 1
fi

# Find all YAML files in the current directory and subdirectories
find . -type f -name "*.yaml" | while read -r yaml_file; do
    # Determine the corresponding JSON file name
    json_file="${yaml_file%.yaml}.json"
    
    # Convert YAML to JSON using yq
    echo "Converting $yaml_file to $json_file"
    yq eval "$yaml_file" -o=json -P > "$json_file"
    
    # Check if conversion was successful
    if [[ $? -ne 0 ]]; then
        echo "Error converting $yaml_file"
    fi
done

echo "All YAML files have been converted to JSON."
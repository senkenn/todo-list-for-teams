#!/bin/bash

# get workspace root path
if [ -z "$1" ]; then
  echo "Usage: $0 <rootPath>"
  exit 1
fi

cd "$1" || exit

# IFS is used to split by newline
IFS=$'\n'
files=$(git ls-files --others --exclude-standard) # exclude directory
for file in $files
do
  grep --with-filename -n -E "TODO:|FIXME:|HACK:|NOTE:" "$file" \
    || [ $? -eq 1 ] # ignore if grep returns 1
done

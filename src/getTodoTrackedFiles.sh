#!/bin/bash

# get workspace root path
if [ -z "$1" ]; then
  echo "Usage: $0 <rootPath>"
  exit 1
fi

cd "$1" || exit

git grep -n -E "TODO:|FIXME:|HACK:|NOTE:" \
| while IFS=: read -r i j _; do \
    /bin/echo "filePath $i"
    git blame -L "$j","$j" "$i" --porcelain
    /bin/echo ""
  done

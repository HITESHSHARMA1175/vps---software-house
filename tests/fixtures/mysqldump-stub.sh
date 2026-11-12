#!/usr/bin/env bash
# Stub mysqldump for tests/backup.test.js.
# Records argv and the --defaults-extra-file content next to itself, then emits fake SQL.
# STUB_EXIT (default 0) controls the exit status; non-zero emits partial output first.
dir="$(cd "$(dirname "$0")" && pwd)"
printf '%s\n' "$@" > "$dir/argv.log"
for a in "$@"; do
  case "$a" in
    --defaults-extra-file=*) cp -- "${a#--defaults-extra-file=}" "$dir/cnf.log" 2>/dev/null ;;
  esac
done
echo "-- stub dump start"
if [ "${STUB_EXIT:-0}" != "0" ]; then
  exit "${STUB_EXIT}"
fi
echo "CREATE TABLE t (id INT);"
exit 0

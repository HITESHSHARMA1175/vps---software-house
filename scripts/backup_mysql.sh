#!/usr/bin/env bash
# backup_mysql.sh - gzip-compressed mysqldump with retention pruning.
#
# Output: ${BACKUP_DIR}/${DB_NAME}_YYYYMMDD_HHMMSS.sql.gz
#
# Settings (environment first, then the project .env file, read without sourcing it):
#   DB_HOST (or MYSQL_HOST), DB_PORT (or MYSQL_PORT, default 3306),
#   DB_USER (or MYSQL_USER), DB_PASSWORD (or MYSQL_PASSWORD), DB_NAME (or MYSQL_DATABASE)
#   BACKUP_DIR              default: <project>/backups
#   BACKUP_RETENTION_DAYS   default: 14, whole number 1..3650
#   ENV_FILE                default: <project>/.env
#
# IMPORTANT: BACKUP_DIR must NOT be the directory that holds the encryption key
# backup (see docs/AGENT_KEY_ROLLOUT.md). Keep database dumps and keys apart.
#
# Cron example - daily at 02:30, output appended to a log file:
#   30 2 * * * /opt/innovation-vps/scripts/backup_mysql.sh >> /var/log/vps-backup.log 2>&1
#
# Exit status: 0 on success, non-zero on any error.

set -u
set -o pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${ENV_FILE:-${PROJECT_DIR}/.env}"

log() { printf '%s [backup_mysql] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
err() { log "ERROR: $*" >&2; }

TMP_CNF=""
OUT_FILE=""
FINISHED=0
cleanup() {
  [ -n "$TMP_CNF" ] && rm -f -- "$TMP_CNF"
  if [ "$FINISHED" -ne 1 ] && [ -n "$OUT_FILE" ]; then rm -f -- "$OUT_FILE"; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# Read KEY from .env without executing it. Last assignment wins; strips CR and quotes.
env_file_get() {
  local key="$1" line val=""
  [ -f "$ENV_FILE" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in
      "$key="*) val="${line#"$key="}" ;;
      "export $key="*) val="${line#"export $key="}" ;;
    esac
  done < "$ENV_FILE"
  if [[ "$val" == \"*\" && ${#val} -ge 2 ]]; then val="${val:1:${#val}-2}"
  elif [[ "$val" == \'*\' && ${#val} -ge 2 ]]; then val="${val:1:${#val}-2}"
  else val="${val%%[[:space:]]#*}"; val="${val%"${val##*[![:space:]]}"}"; fi
  printf '%s' "$val"
}

# resolve VAR_NAME ALT_NAME : environment (primary, alt), then .env (primary, alt)
resolve() {
  local v
  v="${!1:-}"; [ -n "$v" ] && { printf '%s' "$v"; return; }
  v="${!2:-}"; [ -n "$v" ] && { printf '%s' "$v"; return; }
  v="$(env_file_get "$1")"; [ -n "$v" ] && { printf '%s' "$v"; return; }
  env_file_get "$2"
}

DB_HOST="$(resolve DB_HOST MYSQL_HOST)"
DB_PORT="$(resolve DB_PORT MYSQL_PORT)"
DB_USER="$(resolve DB_USER MYSQL_USER)"
DB_PASSWORD="$(resolve DB_PASSWORD MYSQL_PASSWORD)"
DB_NAME="$(resolve DB_NAME MYSQL_DATABASE)"
DB_PORT="${DB_PORT:-3306}"

for name in DB_HOST DB_USER DB_PASSWORD DB_NAME; do
  if [ -z "${!name}" ]; then
    err "required setting ${name} is missing (environment and ${ENV_FILE}); no backup created"
    exit 1
  fi
done

# DB_NAME is used in a file name and a glob; restrict it to safe characters.
if ! [[ "$DB_NAME" =~ ^[A-Za-z0-9_.-]+$ ]]; then
  err "DB_NAME contains unsupported characters; no backup created"
  exit 1
fi
if ! [[ "$DB_PORT" =~ ^[0-9]{1,5}$ ]]; then
  err "DB_PORT is not a valid port number; no backup created"
  exit 1
fi

# Retention validation happens before anything is written or deleted.
RETENTION="${BACKUP_RETENTION_DAYS:-}"
[ -z "$RETENTION" ] && RETENTION="$(env_file_get BACKUP_RETENTION_DAYS)"
RETENTION="${RETENTION:-14}"
if ! [[ "$RETENTION" =~ ^[0-9]+$ ]] || [ "${#RETENTION}" -gt 4 ] \
   || [ "$((10#$RETENTION))" -lt 1 ] || [ "$((10#$RETENTION))" -gt 3650 ]; then
  err "invalid BACKUP_RETENTION_DAYS '${RETENTION}': must be a whole number from 1 to 3650; nothing deleted"
  exit 1
fi
RETENTION=$((10#$RETENTION))

BACKUP_DIR="${BACKUP_DIR:-}"
[ -z "$BACKUP_DIR" ] && BACKUP_DIR="$(env_file_get BACKUP_DIR)"
BACKUP_DIR="${BACKUP_DIR:-${PROJECT_DIR}/backups}"
if ! mkdir -p -- "$BACKUP_DIR"; then
  err "cannot create backup directory ${BACKUP_DIR}"
  exit 1
fi

# Password goes in a private temp option file, never on the command line.
TMP_CNF="$(mktemp "${TMPDIR:-/tmp}/backup_mysql.XXXXXX")" || { err "cannot create temp file"; exit 1; }
chmod 600 "$TMP_CNF"
esc_pw="${DB_PASSWORD//\\/\\\\}"
esc_pw="${esc_pw//\"/\\\"}"
{
  printf '[client]\n'
  printf 'user="%s"\n' "$DB_USER"
  printf 'password="%s"\n' "$esc_pw"
  printf 'host="%s"\n' "$DB_HOST"
  printf 'port=%s\n' "$DB_PORT"
} > "$TMP_CNF"

STAMP="$(date '+%Y%m%d_%H%M%S')"
OUT_FILE="${BACKUP_DIR}/${DB_NAME}_${STAMP}.sql.gz"

mysqldump --defaults-extra-file="$TMP_CNF" --single-transaction --routines --triggers \
  -- "$DB_NAME" | gzip -c > "$OUT_FILE"
rc=("${PIPESTATUS[@]}")
if [ "${rc[0]}" -ne 0 ] || [ "${rc[1]}" -ne 0 ]; then
  rm -f -- "$OUT_FILE"
  err "mysqldump failed (mysqldump exit status ${rc[0]}, gzip exit status ${rc[1]}); partial file removed, no pruning performed"
  exit "$([ "${rc[0]}" -ne 0 ] && echo "${rc[0]}" || echo "${rc[1]}")"
fi
FINISHED=1

# Prune older backups matching this script's pattern; never the new file.
while IFS= read -r old; do
  [ -z "$old" ] && continue
  [ "$old" = "$OUT_FILE" ] && continue
  rm -f -- "$old" && log "pruned old backup $(basename "$old")"
done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${DB_NAME}_????????_??????.sql.gz" -mtime "+${RETENTION}" 2>/dev/null)

SIZE="$(wc -c < "$OUT_FILE" | tr -d '[:space:]')"
log "backup complete: $(basename "$OUT_FILE") (${SIZE} bytes)"
exit 0

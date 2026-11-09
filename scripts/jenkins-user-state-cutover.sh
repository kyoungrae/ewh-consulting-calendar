#!/bin/sh
# Explicit, offline-only first cutover/re-cutover. It is not invoked by the
# ordinary Jenkins job. The operator must independently block user-management
# traffic and wait for all earlier account changes to complete.
set -eu

deploy_tag="${1:?Provide the same build tag used for the release and backup}"
case "$deploy_tag" in *[!A-Za-z0-9_.-]*|'') printf 'Invalid build tag.\n' >&2; exit 64 ;; esac
[ "${FIREBASE_USER_STATES_QUIESCED:-}" = 1 ] || { printf '%s\n' 'Explicit offline user-management quiescence is required.' >&2; exit 1; }
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$script_dir/.."
set -a
. ./infra/jenkins/deploy.env
set +a
: "${RUNTIME_ENV_FILE:?Provide the Jenkins runtime Secret file}"
: "${FIREBASE_SERVICE_ACCOUNT_FILE:?Provide the Jenkins Firebase Secret file}"
: "${FIREBASE_WEB_API_KEY:?Firebase web API key is required}"
[ -r "$RUNTIME_ENV_FILE" ] && [ -s "$RUNTIME_ENV_FILE" ] && [ -r "$FIREBASE_SERVICE_ACCOUNT_FILE" ] && [ -s "$FIREBASE_SERVICE_ACCOUNT_FILE" ] || { printf '%s\n' 'Required runtime or Firebase Secret file is unreadable.' >&2; exit 1; }
case "${BACKUP_DIR:-}" in /*) ;; *) printf '%s\n' 'BACKUP_DIR must be absolute.' >&2; exit 1 ;; esac
backup_path="$BACKUP_DIR/$deploy_tag.archive.gz"
checksum_path="$BACKUP_DIR/$deploy_tag.sha256"
[ -s "$backup_path" ] && [ -s "$checksum_path" ] && gzip -t "$backup_path" 2>/dev/null && [ "$(sha256sum "$backup_path")" = "$(cat "$checksum_path")" ] || { printf '%s\n' 'A verified backup for this build is required.' >&2; exit 1; }

gateway_secret="${GATEWAY_HMAC_SECRET:-}"
case "${GATEWAY_ENABLED:-false}" in
  true) [ "${#gateway_secret}" -ge 32 ] || { printf '%s\n' 'Gateway secret is required.' >&2; exit 1; }; GATEWAY_HMAC_SECRET="$gateway_secret" ;;
  false) GATEWAY_HMAC_SECRET='' ;;
  *) printf '%s\n' 'Invalid gateway configuration.' >&2; exit 1 ;;
esac
APP_IMAGE="ewh-calendar/app:$deploy_tag"
FIREBASE_SERVICE_ACCOUNT_BASE64="$(base64 < "$FIREBASE_SERVICE_ACCOUNT_FILE" | tr -d '\r\n')"
FIREBASE_PROJECT_ID="$FIREBASE_PROJECT"
AUTH_PROVIDER=firebase
export APP_IMAGE FIREBASE_SERVICE_ACCOUNT_BASE64 FIREBASE_PROJECT_ID FIREBASE_WEB_API_KEY AUTH_PROVIDER GATEWAY_HMAC_SECRET FIREBASE_USER_STATES_QUIESCED

compose() { docker compose --env-file "$RUNTIME_ENV_FILE" -p "$COMPOSE_PROJECT_NAME" -f compose.yaml -f infra/jenkins/compose.deploy.yaml "$@"; }
service_id() { compose ps -q "$1" | while IFS= read -r id; do
  oneoff="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.oneoff"}}' "$id")"
  case "$oneoff" in false|False) printf '%s\n' "$id" ;; esac
done; }
all_service_ids() { compose ps --all -q "$1" | while IFS= read -r id; do
  oneoff="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.oneoff"}}' "$id")"
  case "$oneoff" in false|False) printf '%s\n' "$id" ;; esac
done; }
oneoff() { compose run --rm --no-deps -T -e FIREBASE_USER_STATES_QUIESCED=1 app "$@"; }
status() { oneoff node scripts/bootstrap-firebase-user-states.mjs --status; }
healthy() { docker exec "$1" node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" >/dev/null 2>&1; }
wait_healthy() {
  attempt=1
  while [ "$attempt" -le 40 ]; do
    healthy "$1" && return 0
    state="$(docker inspect --format '{{.State.Status}}' "$1" 2>/dev/null || true)"
    case "$state" in exited|dead|'') return 1 ;; esac
    sleep 3
    attempt=$((attempt + 1))
  done
  return 1
}

mongo_id="$(service_id mongo)"
previous_id="$(service_id app)"
[ -n "$mongo_id" ] && [ -n "$previous_id" ] || { printf '%s\n' 'Existing MongoDB and API must be running.' >&2; exit 1; }
previous_image="$(docker inspect --format '{{.Image}}' "$previous_id")"
rollback_image="ewh-calendar/rollback:$deploy_tag"
next_contract="$(docker image inspect --format '{{index .Config.Labels "com.ewh.user-state-contract"}}' "$APP_IMAGE")"
[ "$next_contract" = v1 ] || { printf '%s\n' 'Release image does not support the local user-state contract.' >&2; exit 1; }
docker image tag "$previous_image" "$rollback_image"

# Refuse to cut over an already-authoritative local state. Routine deployments
# have their own path and must not re-seed it.
initial_status="$(status)"
case "$initial_status" in missing|invalidated) ;; ready) printf '%s\n' 'User state is already initialized; use the ordinary deployment path.' >&2; exit 1 ;; *) printf '%s\n' 'Could not determine user-state marker.' >&2; exit 1 ;; esac
oneoff node scripts/bootstrap-firebase-user-states.mjs --verify-seedable
oneoff node scripts/audit-firebase-users.mjs >/dev/null

stopped=0
finished=0
unsafe_stop=0
new_start_attempted=0
recover() {
  [ "$stopped" = 1 ] && [ "$finished" = 0 ] || return 0
  if [ "$unsafe_stop" = 1 ]; then
    printf '%s\n' 'Old API did not stop cleanly; remote writes may still be in flight. Automatic rollback is blocked; inspect both systems.' >&2; return 1
  fi
  printf '%s\n' 'Cutover failed; stopping the new API and protecting the user-state marker before rollback.' >&2
  if ! compose stop --timeout 60 app >/dev/null 2>&1; then
    printf '%s\n' 'Could not stop the API. Automatic rollback is blocked; inspect it manually.' >&2; return 1
  fi
  if [ "$new_start_attempted" = 1 ]; then
    stopped_ids="$(all_service_ids app)" || { printf '%s\n' 'Could not inspect the new API. Automatic rollback is blocked.' >&2; return 1; }
    [ -n "$stopped_ids" ] || { printf '%s\n' 'New API container is missing. Automatic rollback is blocked.' >&2; return 1; }
    for stopped_id in $stopped_ids; do
      stopped_state="$(docker inspect --format '{{.State.Status}}' "$stopped_id")" || return 1
      stopped_exit="$(docker inspect --format '{{.State.ExitCode}}' "$stopped_id")" || return 1
      case "$stopped_state:$stopped_exit" in exited:0|created:0) ;; *) printf '%s\n' 'New API did not stop cleanly. Automatic rollback is blocked.' >&2; return 1 ;; esac
    done
  fi
  if ! oneoff node scripts/bootstrap-firebase-user-states.mjs --verify-no-pending; then
    printf '%s\n' 'A local synchronization is pending. Automatic rollback is blocked.' >&2; return 1
  fi
  if ! oneoff node scripts/audit-firebase-users.mjs >/dev/null; then
    printf '%s\n' 'Firebase account audit failed. Automatic rollback is blocked.' >&2; return 1
  fi
  marker="$(status)" || { printf '%s\n' 'Could not read user-state marker. Automatic rollback is blocked.' >&2; return 1; }
  case "$marker" in
    ready) oneoff node scripts/bootstrap-firebase-user-states.mjs --invalidate || { printf '%s\n' 'Could not invalidate user state. Automatic rollback is blocked.' >&2; return 1; } ;;
    missing|invalidated) ;;
    *) printf '%s\n' 'Unexpected marker. Automatic rollback is blocked.' >&2; return 1 ;;
  esac
  APP_IMAGE="$rollback_image"; export APP_IMAGE
  if ! compose up -d --no-deps --no-build app; then printf '%s\n' 'Previous API could not be restarted.' >&2; return 1; fi
  restored="$(service_id app)"
  [ -n "$restored" ] && wait_healthy "$restored" || { printf '%s\n' 'Previous API failed its health check.' >&2; return 1; }
  printf '%s\n' 'Previous API restored; new user-state marker remains invalidated.' >&2
}
trap 'recover || true' EXIT
trap 'exit 130' INT
trap 'exit 143' HUP TERM
stopped=1
unsafe_stop=1
compose stop --timeout 60 app
old_exit="$(docker inspect --format '{{.State.ExitCode}}' "$previous_id")"
if [ "$old_exit" != 0 ]; then
  printf '%s\n' 'Old API did not exit cleanly; cutover is blocked.' >&2
  exit 1
fi
unsafe_stop=0
# Repeat the Firebase audit after the old API has stopped. This catches pending
# Firebase profile operations, not writes performed by other unmanaged clients.
oneoff node scripts/audit-firebase-users.mjs >/dev/null
oneoff node scripts/bootstrap-firebase-user-states.mjs --apply
oneoff node scripts/bootstrap-firebase-user-states.mjs --check
new_start_attempted=1
compose up -d --no-deps --no-build app
new_id="$(service_id app)"
[ -n "$new_id" ] && wait_healthy "$new_id" || { printf '%s\n' 'New API failed its health check.' >&2; exit 1; }
finished=1
printf '%s\n' 'New API is healthy. Keep user-management traffic blocked until account and calendar checks are complete.'

#!/bin/sh
set -eu

mode="${1:?Specify verify, build, build-hosting, backup, deploy, firebase-check, firebase, smoke, smoke-hosting or cleanup}"
deploy_tag="${2:-manual}"
case "$deploy_tag" in *[!A-Za-z0-9_.-]*|'') printf 'Invalid deployment tag.\n' >&2; exit 64 ;; esac

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$script_dir/.."
set -a
. ./infra/jenkins/deploy.env
set +a
export VERIFY_IMAGE="ewh-calendar/verify:$deploy_tag"
export APP_IMAGE="ewh-calendar/app:$deploy_tag"
export FIREBASE_IMAGE="ewh-calendar/firebase-deploy:$deploy_tag"
rollback_image="ewh-calendar/rollback:$deploy_tag"
test_network="ewh-test-$deploy_tag"
test_mongo="ewh-test-mongo-$deploy_tag"
candidate_name="ewh-candidate-$deploy_tag"
backup_path="${BACKUP_DIR:-}/${deploy_tag}.archive.gz"
checksum_path="${BACKUP_DIR:-}/${deploy_tag}.sha256"

die() { printf '%s\n' "$1" >&2; exit 1; }
require_file() { [ -r "$1" ] && [ -s "$1" ] || die 'A required Jenkins Secret file is empty or unreadable.'; }
verify_backup() {
  case "${BACKUP_DIR:-}" in /*) ;; *) die 'BACKUP_DIR must be an absolute persistent directory.' ;; esac
  [ -s "$backup_path" ] && [ -s "$checksum_path" ] || die 'A verified MongoDB backup is required; the current API was kept.'
  gzip -t "$backup_path" 2>/dev/null || die 'The MongoDB backup is corrupt; the current API was kept.'
  expected_checksum="$(cat "$checksum_path")"
  actual_checksum="$(sha256sum "$backup_path")"
  [ "$actual_checksum" = "$expected_checksum" ] || die 'MongoDB backup checksum verification failed; the current API was kept.'
}
prune_previous_backups() {
  # Only this Jenkins job's numbered, verified archive/checksum pairs are ours
  # to remove. Do not touch manual backups, orphans, symlinks or other jobs.
  prefix='jenkins-ewh-consulting-calendar-deploy-'
  case "$deploy_tag" in "$prefix"*) current_number="${deploy_tag#"$prefix"}" ;; *) return ;; esac
  case "$current_number" in ''|*[!0-9]*) return ;; esac
  for old_archive in "$BACKUP_DIR"/"$prefix"*.archive.gz; do
    [ -f "$old_archive" ] && [ ! -L "$old_archive" ] || continue
    old_name="${old_archive##*/}"
    old_number="${old_name#"$prefix"}"
    old_number="${old_number%.archive.gz}"
    case "$old_number" in ''|*[!0-9]*) continue ;; esac
    [ "$old_number" -lt "$current_number" ] 2>/dev/null || continue
    old_checksum="${old_archive%.archive.gz}.sha256"
    [ -f "$old_checksum" ] && [ ! -L "$old_checksum" ] || continue
    gzip -t "$old_archive" 2>/dev/null || continue
    [ "$(cat "$old_checksum")" = "$(sha256sum "$old_archive")" ] || continue
    rm -f "$old_archive" "$old_checksum"
    printf 'Removed previous verified MongoDB backup: %s\n' "$old_name"
  done
}
compose() {
  docker compose --env-file "$RUNTIME_ENV_FILE" -p "$COMPOSE_PROJECT_NAME" \
    -f compose.yaml -f infra/jenkins/compose.deploy.yaml "$@"
}
service_id() {
  compose ps -q "$1" | while IFS= read -r container_id; do
    oneoff="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.oneoff"}}' "$container_id")"
    case "$oneoff" in False|false) printf '%s\n' "$container_id" ;; esac
  done
}
wait_healthy() {
  attempt=1
  while [ "$attempt" -le 40 ]; do
    if docker exec "$1" node -e "fetch('http://127.0.0.1:3001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))" >/dev/null 2>&1; then return 0; fi
    state="$(docker inspect --format '{{.State.Status}}' "$1" 2>/dev/null || true)"
    case "$state" in exited|dead|'') return 1 ;; esac
    sleep 3
    attempt=$((attempt + 1))
  done
  return 1
}
report_candidate_failure() {
  # Never print raw container logs: connection errors can include credentials.
  candidate_logs="$(docker logs "$candidate_name" 2>&1 || true)"
  case "$candidate_logs" in
    *'Firebase authentication requires FIREBASE_WEB_API_KEY, FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_BASE64'*)
      printf '%s\n' 'Candidate startup: Firebase runtime configuration is missing. Add FIREBASE_WEB_API_KEY, FIREBASE_PROJECT_ID and FIREBASE_SERVICE_ACCOUNT_BASE64 to ewh-calendar-runtime-env.' >&2 ;;
    *'Invalid FIREBASE_SERVICE_ACCOUNT_BASE64'*)
      printf '%s\n' 'Candidate startup: FIREBASE_SERVICE_ACCOUNT_BASE64 is not valid base64-encoded service account JSON.' >&2 ;;
    *'Firebase service account does not match FIREBASE_PROJECT_ID'*)
      printf '%s\n' 'Candidate startup: the Firebase service account is incomplete or does not match FIREBASE_PROJECT_ID.' >&2 ;;
    *'Failed to parse private key'*|*'Invalid PEM formatted message'*|*'Invalid PEM formatted message.'*)
      printf '%s\n' 'Candidate startup: the Firebase service account private key could not be parsed.' >&2 ;;
    *'MongoServerSelectionError'*|*'MongoNetworkError'*)
      printf '%s\n' 'Candidate startup: the API could not connect to MongoDB. Inspect database connectivity on the server.' >&2 ;;
    *)
      printf '%s\n' 'Candidate startup: no recognized error was found. Reproduce the candidate privately and inspect its logs.' >&2 ;;
  esac
}
firebase_command() {
  : "${FIREBASE_TOKEN_FILE:?Configure firebase-consulting-deploy as a Jenkins Secret file}"
  require_file "$FIREBASE_TOKEN_FILE"
  # The Jenkins-side path is not mounted through the host Docker daemon.
  # Only stdin carries the credential; neither image nor Docker run metadata contains it.
  docker run --rm -i "$FIREBASE_IMAGE" sh -c '
    set -eu
    FIREBASE_TOKEN="$(cat)"
    export FIREBASE_TOKEN
    exec firebase "$@"
  ' sh "$@" < "$FIREBASE_TOKEN_FILE"
}

case "$mode" in
  verify)
    test_network_id=''
    test_mongo_id=''
    cleanup_test() {
      [ -z "$test_mongo_id" ] || docker rm -f "$test_mongo_id" >/dev/null 2>&1 || true
      [ -z "$test_network_id" ] || docker network rm "$test_network_id" >/dev/null 2>&1 || true
    }
    trap cleanup_test EXIT
    trap 'exit 130' INT
    trap 'exit 143' HUP TERM
    docker build --target verify -t "$VERIFY_IMAGE" -f infra/jenkins/Dockerfile .
    test_network_id="$(docker network create "$test_network")"
    test_mongo_id="$(docker run --detach --rm --name "$test_mongo" --network "$test_network" \
      mongo:8.0 --replSet rs0 --bind_ip_all)"
    ready=false
    attempt=1
    while [ "$attempt" -le 40 ]; do
      if docker exec "$test_mongo" mongosh --quiet --eval 'db.adminCommand({ping:1})' >/dev/null 2>&1; then ready=true; break; fi
      sleep 2
      attempt=$((attempt + 1))
    done
    [ "$ready" = true ] || die 'The isolated test MongoDB did not start.'
    docker exec "$test_mongo" mongosh --quiet --eval \
      "rs.initiate({_id:'rs0',members:[{_id:0,host:'$test_mongo:27017'}]})" >/dev/null
    ready=false
    attempt=1
    while [ "$attempt" -le 40 ]; do
      if docker exec "$test_mongo" mongosh --quiet --eval 'if (!db.hello().isWritablePrimary) quit(1)' >/dev/null 2>&1; then ready=true; break; fi
      sleep 2
      attempt=$((attempt + 1))
    done
    [ "$ready" = true ] || die 'The isolated test replica set did not become writable.'
    docker run --rm --network "$test_network" \
      -e "MONGODB_TEST_URI=mongodb://$test_mongo:27017/?replicaSet=rs0" "$VERIFY_IMAGE" npm test
    ;;
  build)
    docker build --target runtime -t "$APP_IMAGE" .
    docker build --target firebase --build-arg "FUNNEL_API_BASE_URL=$FUNNEL_API_BASE_URL" \
      -t "$FIREBASE_IMAGE" -f infra/jenkins/Dockerfile .
    ;;
  build-hosting)
    docker build --target firebase --build-arg "FUNNEL_API_BASE_URL=$FUNNEL_API_BASE_URL" \
      -t "$FIREBASE_IMAGE" -f infra/jenkins/Dockerfile .
    ;;
  backup)
    : "${RUNTIME_ENV_FILE:?Configure ewh-calendar-runtime-env as a Jenkins Secret file}"
    require_file "$RUNTIME_ENV_FILE"
    case "$BACKUP_DIR" in /*) ;; *) die 'BACKUP_DIR must be an absolute persistent directory.' ;; esac
    mongo_id="$(service_id mongo)"
    [ -n "$mongo_id" ] || die 'The existing production MongoDB must be running before backup.'
    umask 077
    mkdir -p "$BACKUP_DIR"
    chmod 700 "$BACKUP_DIR"
    [ ! -e "$backup_path" ] && [ ! -e "$checksum_path" ] || die 'A backup for this build already exists; refusing to overwrite it.'
    backup_tmp="$(mktemp "$BACKUP_DIR/.${deploy_tag}.archive.XXXXXX")"
    checksum_tmp=''
    cleanup_backup() {
      [ -z "$backup_tmp" ] || rm -f "$backup_tmp"
      [ -z "$checksum_tmp" ] || rm -f "$checksum_tmp"
    }
    trap cleanup_backup EXIT
    trap 'exit 130' INT
    trap 'exit 143' HUP TERM
    # Stream the authenticated, consistent replica-set dump to Jenkins' persistent volume.
    if ! docker exec "$mongo_id" sh -c 'exec mongodump --host localhost --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --oplog --archive --gzip' > "$backup_tmp" 2>/dev/null; then
      die 'MongoDB backup failed; the current API was kept.'
    fi
    [ -s "$backup_tmp" ] && gzip -t "$backup_tmp" 2>/dev/null || die 'MongoDB backup was empty or corrupt; the current API was kept.'
    ln "$backup_tmp" "$backup_path" || die 'Could not preserve the MongoDB backup without overwriting an existing file.'
    rm -f "$backup_tmp"
    backup_tmp=''
    checksum_tmp="$(mktemp "$BACKUP_DIR/.${deploy_tag}.checksum.XXXXXX")"
    sha256sum "$backup_path" > "$checksum_tmp"
    ln "$checksum_tmp" "$checksum_path" || die 'Could not preserve the backup checksum without overwriting an existing file.'
    rm -f "$checksum_tmp"
    checksum_tmp=''
    verify_backup
    printf 'MongoDB backup saved and checked: %s\n' "$backup_path"
    prune_previous_backups
    ;;
  deploy)
    : "${RUNTIME_ENV_FILE:?Configure ewh-calendar-runtime-env as a Jenkins Secret file}"
    require_file "$RUNTIME_ENV_FILE"
    case "${GATEWAY_ENABLED:-false}" in
      true)
        gateway_secret="${GATEWAY_HMAC_SECRET:-}"
        [ "${#gateway_secret}" -ge 32 ] || die 'Configure the gateway secret in Jenkins before deploying the gateway-enabled API.'
        GATEWAY_HMAC_SECRET="$gateway_secret"
        export GATEWAY_HMAC_SECRET
        ;;
      false)
        # Prevent a stale shell or runtime-file value from enabling this feature.
        GATEWAY_HMAC_SECRET=''
        export GATEWAY_HMAC_SECRET
        ;;
      *) die 'GATEWAY_ENABLED must be true or false.' ;;
    esac
    verify_backup
    : "${FIREBASE_SERVICE_ACCOUNT_FILE:?Configure ewh-calendar-firebase-admin as a Jenkins Secret file}"
    require_file "$FIREBASE_SERVICE_ACCOUNT_FILE"
    : "${FIREBASE_WEB_API_KEY:?Configure the public Firebase web API key}"
    # Credentials are read from a separate Jenkins Secret file; keep the existing
    # MongoDB/runtime credential unchanged. Never enable shell tracing here.
    FIREBASE_SERVICE_ACCOUNT_BASE64="$(base64 < "$FIREBASE_SERVICE_ACCOUNT_FILE" | tr -d '\r\n')"
    FIREBASE_PROJECT_ID="$FIREBASE_PROJECT"
    AUTH_PROVIDER=firebase
    export FIREBASE_SERVICE_ACCOUNT_BASE64 FIREBASE_PROJECT_ID FIREBASE_WEB_API_KEY AUTH_PROVIDER
    mongo_id="$(service_id mongo)"
    [ -n "$mongo_id" ] || die 'The existing production MongoDB must be running before Jenkins deploys the API.'
    previous_id="$(service_id app)"
    [ -n "$previous_id" ] || die 'Initial server setup must complete before Jenkins deployments.'
    previous_image="$(docker inspect --format '{{.Image}}' "$previous_id")"
    previous_contract="$(docker image inspect --format '{{index .Config.Labels "com.ewh.user-state-contract"}}' "$previous_image")"
    next_contract="$(docker image inspect --format '{{index .Config.Labels "com.ewh.user-state-contract"}}' "$APP_IMAGE")"
    [ "$previous_contract" = v1 ] && [ "$next_contract" = v1 ] || die 'This rollout requires the explicit offline user-state cutover; the current API was kept.'
    docker image tag "$previous_image" "$rollback_image"
    candidate_id=''
    cleanup_candidate() { [ -z "$candidate_id" ] || docker rm -f "$candidate_id" >/dev/null 2>&1 || true; }
    trap cleanup_candidate EXIT
    trap 'exit 130' INT
    trap 'exit 143' HUP TERM
    candidate_id="$(compose run --detach --no-deps --name "$candidate_name" app)"
    if ! wait_healthy "$candidate_name"; then
      report_candidate_failure
      die 'The candidate API failed its health check; the current API was kept.'
    fi
    docker exec "$candidate_name" node -e "if(process.env.AUTH_PROVIDER !== 'firebase') process.exit(1)" || die 'Production deployment requires AUTH_PROVIDER=firebase; the current API was kept.'
    # Read-only and fail closed: do not replace the working API while identities disagree.
    if ! docker exec "$candidate_name" node scripts/audit-firebase-users.mjs >/dev/null; then
      die 'Firebase Authentication/Firestore account audit failed; the current API was kept. Run the audit privately on the server.'
    fi
    rollback() {
      export APP_IMAGE="$rollback_image"
      compose up -d --no-deps --no-build app
      restored_id="$(service_id app)"
      wait_healthy "$restored_id" || die 'The previous API image was restored but its health check failed. Inspect the Jenkins release and server.'
      printf 'Restored the previous API image; MongoDB was kept.\n' >&2
    }
    if ! compose up -d --no-deps --no-build app; then rollback; die 'API replacement failed and was rolled back.'; fi
    app_id="$(service_id app)"
    if ! wait_healthy "$app_id"; then rollback; die 'API health check failed and was rolled back.'; fi
    printf 'API healthy. Previous image: %s\n' "$rollback_image"
    ;;
  firebase-check)
    firebase_command hosting:sites:list --project "$FIREBASE_PROJECT" --non-interactive
    ;;
  firebase)
    firebase_command deploy --only hosting --project "$FIREBASE_PROJECT" --non-interactive
    ;;
  smoke)
    docker run --rm -e "SMOKE_API=$FUNNEL_API_BASE_URL" -e "SMOKE_HOSTING=$HOSTING_ORIGIN" "$VERIFY_IMAGE" \
      node --input-type=module -e '
        const api = await fetch(process.env.SMOKE_API + "/health", { signal: AbortSignal.timeout(20000) });
        if (!api.ok || (await api.json()).status !== "ok") throw new Error("Public API health failed");
        const hosting = await fetch(process.env.SMOKE_HOSTING, { signal: AbortSignal.timeout(20000) });
        if (!hosting.ok || !(await hosting.text()).includes("/assets/")) throw new Error("Hosting page failed");
        console.log("Public API and Hosting smoke checks passed.");'
    ;;
  smoke-hosting)
    docker run --rm -e "SMOKE_HOSTING=$HOSTING_ORIGIN" "$FIREBASE_IMAGE" \
      node --input-type=module -e '
        const hosting = await fetch(process.env.SMOKE_HOSTING, { signal: AbortSignal.timeout(20000) });
        if (!hosting.ok || !(await hosting.text()).includes("/assets/")) throw new Error("Hosting page check failed");
        console.log("Hosting page check passed; API deployment was not attempted.");'
    ;;
  cleanup)
    # Temporary containers and networks are cleaned by their creation-stage traps.
    # Never remove by name here: a failed creation could refer to a pre-existing resource.
    docker image rm "$VERIFY_IMAGE" "$FIREBASE_IMAGE" >/dev/null 2>&1 || true
    ;;
  *) die 'Unknown Jenkins operation.' ;;
esac

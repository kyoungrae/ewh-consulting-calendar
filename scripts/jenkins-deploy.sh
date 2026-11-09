#!/bin/sh
set -eu

mode="${1:?Specify verify, build, deploy, firebase-check, firebase, smoke or cleanup}"
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

die() { printf '%s\n' "$1" >&2; exit 1; }
require_file() { [ -r "$1" ] && [ -s "$1" ] || die 'A required Jenkins Secret file is empty or unreadable.'; }
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
    cleanup_test() {
      docker rm -f "$test_mongo" >/dev/null 2>&1 || true
      docker network rm "$test_network" >/dev/null 2>&1 || true
    }
    trap cleanup_test EXIT
    trap 'exit 130' INT
    trap 'exit 143' HUP TERM
    docker build --target verify -t "$VERIFY_IMAGE" -f infra/jenkins/Dockerfile .
    docker network create "$test_network" >/dev/null
    docker run --detach --rm --name "$test_mongo" --network "$test_network" \
      mongo:8.0 --replSet rs0 --bind_ip_all >/dev/null
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
  deploy)
    : "${RUNTIME_ENV_FILE:?Configure ewh-calendar-runtime-env as a Jenkins Secret file}"
    require_file "$RUNTIME_ENV_FILE"
    mongo_id="$(service_id mongo)"
    [ -n "$mongo_id" ] || die 'The existing production MongoDB must be running before Jenkins deploys the API.'
    previous_id="$(service_id app)"
    [ -n "$previous_id" ] || die 'Initial server setup must complete before Jenkins deployments.'
    previous_image="$(docker inspect --format '{{.Image}}' "$previous_id")"
    docker image tag "$previous_image" "$rollback_image"
    cleanup_candidate() { docker rm -f "$candidate_name" >/dev/null 2>&1 || true; }
    trap cleanup_candidate EXIT
    trap 'exit 130' INT
    trap 'exit 143' HUP TERM
    compose run --detach --no-deps --name "$candidate_name" app >/dev/null
    wait_healthy "$candidate_name" || die 'The candidate API failed its health check; the current API was kept.'
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
  cleanup)
    docker rm -f "$candidate_name" "$test_mongo" >/dev/null 2>&1 || true
    docker network rm "$test_network" >/dev/null 2>&1 || true
    docker image rm "$VERIFY_IMAGE" "$FIREBASE_IMAGE" >/dev/null 2>&1 || true
    ;;
  *) die 'Unknown Jenkins operation.' ;;
esac

# 이화 컨설팅 일정

커밋·push 이후에는 Jenkins에서 수동으로 최신 `main`의 API 서버와 Firebase Hosting 화면을 배포합니다. 배포 전에 기존 MongoDB를 백업하며 기존 데이터 볼륨은 유지합니다. 설정과 실행 순서는 [Jenkins 수동 배포](docs/jenkins.md)를 참고하세요.

React 일정 관리 화면과 Node API, Docker MongoDB로 구성한 내부 컨설팅 일정 관리 시스템입니다. Firebase Hosting은 화면을, Firebase Authentication은 로그인 인증을 담당합니다. 최초 사용자 동기화 이후 권한·승인 상태와 일정, 서버 세션은 맥북 프로의 MongoDB에서 확인합니다. Firestore의 사용자 프로필도 앱의 사용자 변경 과정에서 함께 관리합니다.

## 구성

```text
사용자 → https://ewha-consulting.web.app (Firebase Hosting 정적 화면)
                   ↓ HTTPS API 요청
     https://ewh-calendar-api.myljk1025.workers.dev/api
                   ↓ Cloudflare Worker 중계
     https://macbookpro.tailf007d9.ts.net/ewh-calendar/api
                   ↓ Tailscale Funnel
         MacBook Pro localhost:8180 (Node API)
                   ↓ Docker 내부 연결
       MongoDB rs0 / ewh_consulting / 독립 영속 볼륨
```

MongoDB의 27017 포트는 호스트나 인터넷에 공개하지 않습니다. 단일 노드 replica set `rs0`은 일정 업로드·되돌리기의 원자적 트랜잭션을 지원하기 위한 구성입니다. 이 구성에는 다른 장비로의 자동 복제가 없으므로 백업을 별도로 보관해야 합니다.

운영 로그인은 Firebase Authentication에서 이메일과 비밀번호 및 ID 토큰을 검증합니다. 최초 전환 시 Firebase 계정과 Firestore 프로필을 동일 UID의 MongoDB `firebase_user_states`에 복제하고, 이후 API는 세션과 이 컬렉션의 권한·승인·잠금 상태를 확인합니다. 프로필 없는 Firebase 계정은 기존과 같이 기본 컨설턴트로 처리합니다. 서버 세션은 30분 후 만료됩니다. Hosting과 Worker API처럼 출처가 다르면 Bearer 전송을 사용하고, 같은 출처의 로컬 환경은 HttpOnly 쿠키 세션을 사용합니다. 사용자 관리 변경은 반드시 캘린더 관리자 화면에서 수행해야 하며 Firebase 콘솔이나 다른 앱의 직접 변경은 MongoDB에 자동 반영되지 않습니다.

## Firebase 로그인 서버 전환 설정

전환은 기존 계정을 먼저 대조한 뒤 진행합니다. 이전 앱은 Firestore 비밀번호와 Firebase 비밀번호가 서로 다른 경우에도 어느 쪽이든 허용했으므로, Firebase 비밀번호가 없는 계정이나 이전에 Firestore 비밀번호를 쓰던 계정은 개별 복구가 필요합니다. `805246`에 MongoDB로 설정한 임시 비밀번호는 Firebase 비밀번호를 바꾸지 않았습니다. 기존 UID와 이메일을 자동으로 결합하거나 기존 계정의 비밀번호를 일괄 변경하지 않습니다.

기존 `ewh-calendar-runtime-env`의 MongoDB·세션 설정은 그대로 유지합니다. Firebase 서비스 계정 JSON은 Jenkins에 별도 Secret file `ewh-calendar-firebase-admin`으로 등록합니다. Jenkins는 배포 시에만 이 파일을 메모리에서 base64로 변환해 후보 API에 전달합니다. 웹 API 키와 프로젝트 ID는 공개 설정인 `infra/jenkins/deploy.env`에 있습니다. 서비스 계정에는 Authentication 사용자 조회·생성·수정·삭제와 Firestore 사용자 프로필 읽기·쓰기에 필요한 권한만 부여하세요. 키 파일을 Git, 로그 또는 채팅에 넣지 않습니다.

직접 서버를 실행할 때는 `AUTH_PROVIDER=firebase`, `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_BASE64`를 서버 환경에 설정합니다. Identity Toolkit API와 이메일/비밀번호 로그인이 활성화되어 있어야 합니다.

Firestore 사용자 프로필에는 권한과 승인 상태가 있으므로 클라이언트가 해당 문서를 수정하지 못하도록 규칙을 유지해야 합니다. 서버 Admin SDK는 규칙을 우회하므로 서비스 계정의 IAM 접근도 제한합니다. Firebase Authentication에 계정만 있고 프로필이 없으면 누구나 기본 컨설턴트로 접속할 수 있습니다. 이 Firebase 프로젝트의 계정이 모두 이 앱에 접속할 수 있어도 되는지 확인하세요.

Jenkins는 백업과 후보 서버 검사 후 Firebase Authentication 계정과 Firestore 프로필을 읽기 전용으로 대조합니다. 일치하지 않는 UID·중복 아이디·중단된 동기화가 있으면 기존 API를 유지하고 배포를 중단합니다. 사용자 목록 대조에는 Firebase Authentication 사용자 목록 조회 권한이 필요합니다. 감사는 암호나 암호 해시를 확인하지 않으므로 **Firebase 비밀번호가 실제 사용자에게 알려져 있는지까지 보장하지 않습니다.** 사용자별 실제 로그인 확인이 필요합니다.

서버의 비공개 운영 환경을 사용하는 새 이미지에서 `node scripts/audit-firebase-users.mjs`를 실행하면 불일치한 아이디·UID와 사유를 확인할 수 있습니다. 프로필 없이 Firebase Authentication에만 있는 계정은 개수만 보고하며 컨설턴트로 로그인할 수 있습니다. 이름 선택이나 아이디 로그인에 필요한 프로필이 없으므로 이메일로 로그인해야 합니다. 정상 로그인 사례와 이름 로그인, 일정·권한을 검증한 뒤 운영에 반영하세요. `AUTH_PROVIDER=mongo`는 Firebase에 접속하지 않는 격리된 로컬 개발 환경을 위한 것입니다.

관리자 화면의 사용자 생성·변경·삭제는 로컬 상태와 Firebase Authentication/Firestore를 함께 처리합니다. 중간 실패 시 계정을 `authSyncPending` 상태로 잠그며, Firebase나 MongoDB 한쪽의 잠금만 수동으로 해제해서는 안 됩니다. 복구 전 로컬 계정과 Firebase 계정 및 프로필을 모두 조사해야 합니다. 비공개 운영 환경에서 다음 명령은 읽기 전용 진단만 수행합니다.

```bash
docker exec -i <app-container> node scripts/recover-firebase-sync.mjs --user-id <아이디>
```

로컬 사용자 상태가 생성된 후에는 기존 Firebase 단독 `--apply` 복구를 차단합니다. 로컬 상태가 없는 기존 Firebase 전용 운영에서만 예전 복구 명령을 사용할 수 있습니다. 새 구조에서 부분 실패한 계정은 우선 진단 결과를 검토하고, 두 API를 중지해 모든 계정 변경이 끝난 것을 확인한 뒤 `FIREBASE_USER_STATES_QUIESCED=1 node scripts/recover-firebase-sync.mjs --uid <UID> --suspend --apply`로 Firebase와 로컬 양쪽을 정지 상태로 대조할 수 있습니다. 계정이 Firebase에 없거나 결과가 불확실하면 잠금을 유지합니다. 이 명령은 비밀번호를 확인하지 않으며, 복구 후 관리자가 필요한 비밀번호를 재설정하고 계정을 명시적으로 다시 승인해야 합니다. 도구는 비밀번호나 토큰을 표시·비교하지 않습니다.

최초 MongoDB 사용자 상태 전환은 일반 Jenkins 배포와 구분된 명시적 전환 옵션을 사용합니다. [Jenkins 전환 안내](docs/jenkins.md)의 백업과 사용자 변경 중지 절차를 먼저 완료해야 합니다. 초기화 완료 마커가 없으면 새 서버가 시작하지 않아 기존 운영 서버를 보호합니다.

전환 후 Firebase에서 새 사용자를 만들거나 비밀번호를 변경한 뒤 구 MongoDB 인증 버전으로 롤백하면 해당 사용자가 로그인하지 못할 수 있습니다. 롤백은 계정 변경 내역과 백업을 확인하고 진행합니다.

참조 프로젝트의 기존 운영 화면은 `https://consultingmanagement.web.app`, API는 `https://macbookpro.tailf007d9.ts.net/api/v1`입니다. 이 달력은 별도 포트·경로·Compose 프로젝트·MongoDB 볼륨을 사용하므로 분석 서비스의 설정과 데이터를 공유하지 않습니다.

## 맥북 프로에서 실행

Docker Desktop 또는 호환 Docker Engine과 Compose, Node.js 24를 사용합니다. Apple Silicon에서도 동일한 Compose 파일을 사용합니다.

```bash
cp .env.example .env
openssl rand -hex 32
openssl rand -hex 32
openssl rand -base64 48
```

생성한 값을 `.env`의 `SESSION_SECRET`, `MONGO_ROOT_PASSWORD`, `MONGO_REPLICA_KEY`에 각각 입력합니다. MongoDB 비밀번호는 URI에 안전한 hex 값을 권장합니다. 비밀 값은 `VITE_` 환경 변수에 넣지 않습니다.

로컬 확인에는 다음 설정을 사용합니다.

```dotenv
APP_ORIGIN=http://localhost:8180
COOKIE_SECURE=false
SESSION_TRANSPORT=cookie
APP_PORT=8180
MONGO_ROOT_USERNAME=calendar_root
MONGODB_DB=ewh_consulting
```

```bash
docker compose up -d --build
docker compose ps
curl --fail http://localhost:8180/api/health
```

브라우저에서 `http://localhost:8180`을 엽니다. 처음 MongoDB 볼륨을 생성할 때 관리자 인증과 replica set 초기화 때문에 약간의 시간이 필요합니다. `.env`의 MongoDB 자격 증명을 나중에 바꾸는 것만으로 기존 DB 사용자 비밀번호가 변경되지는 않습니다.

## Firebase 데이터 이전

이 저장소의 수정만으로 기존 Firebase 데이터나 운영 도메인이 변경되지는 않습니다. 아래 순서로 별도 실행합니다.

1. 기존 운영 사이트의 일정·회원 변경을 잠시 중지합니다. 일관된 전체 내보내기를 위해 내보내기부터 새 서버 확인까지 변경을 막습니다.
2. Firebase 서비스 계정을 사용해 현재 Firestore를 읽기 전용으로 내보냅니다. 기존 Firebase 프로젝트는 확인이 끝날 때까지 유지합니다.
3. 새 MongoDB에서 dry run을 실행해 식별자와 고유 값 충돌을 확인합니다.
4. 백업을 확보한 뒤 `--apply`로 새 문서만 가져옵니다.
5. 관리자와 컨설턴트 계정으로 일정, 코드, 특별 일정, 강사료, 엑셀 업로드와 되돌리기를 확인합니다.
6. 달력 전용 Funnel 경로를 검증하고 새 화면을 기존 Hosting에 배포합니다. 계정용 Firebase Authentication과 Firestore 사용자 프로필은 유지합니다. Hosting과 기존 주소는 유지합니다.

### Firestore 내보내기

내보내기 도구에만 Firebase Admin SDK가 필요합니다. 별도 `migration/`에 설치되며 운영 이미지에는 포함되지 않습니다.

```bash
npm --prefix migration install
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/service-account.json node scripts/export-firestore.mjs --project ewha-consulting --out /absolute/path/firestore-export.json
```

서비스 계정에는 내보내기에 필요한 Firestore 읽기 권한만 부여합니다. 도구는 원본을 수정하지 않고 출력 파일도 덮어쓰지 않습니다. 파일에는 개인정보와 구 시스템의 평문 비밀번호가 포함될 수 있으므로 파일 권한을 제한하고 Git에 추가하지 않습니다.

내보내기는 다음 컬렉션을 처리합니다.

| Firestore 원본 | MongoDB 대상 |
| --- | --- |
| `users` | `users` — 기존 UID 유지 |
| `schedules_by_month/*`의 `items` | `schedules` — 현재 화면과 같은 일정별 문서 |
| 구 `schedules` 및 현재 화면의 중복 제외 행 | `migration_schedule_archive` — `--current-layout` 정책의 원본 보관 |
| `special_schedules_by_year/*`의 `items` + 구 `special_schedules` | `special_schedules` — 일정별 문서 |
| `common_codes` | `common_codes` |
| `change_logs` | `change_logs` |

기존 배열 항목의 `id`와 사용자 UID를 유지해 담당 컨설턴트 연결과 변경 이력을 보존합니다. ID가 없는 오래된 항목은 문서 ID와 배열 순번으로 결정적인 ID를 부여하고 검사 결과에 개수를 표시합니다. 한국 시간 기준으로 월을 계산합니다. 전체 원본은 제한된 권한의 내보내기 파일에 그대로 보관합니다.

### 현재 화면 기준 이전 정책

기본 정책은 엄격 검사입니다. 옵션 없이 실행하면 월별·구 컬렉션을 함께 검사하며, 서로 다른 내용이 같은 ID를 사용하거나 동일 일시·담당자의 일정이 중복되면 쓰기 전에 중단합니다. 이 프로젝트의 실제 데이터에는 과거 컬렉션과 중복 행이 함께 남아 있으므로, 현재 운영 화면과 맞추려면 `--current-layout`을 명시합니다.

`--current-layout`은 다음 규칙을 적용합니다.

- 월별 문서가 하나라도 있으면 현재 화면이 읽는 `schedules_by_month`만 활성 일정의 원본으로 사용합니다. 구 `schedules`의 모든 행은 원본 그대로 별도 보관하고 현재 일정에 합치지 않습니다. 과거 컬렉션에만 남은 삭제 전 일정이 다시 나타나지 않게 합니다.
- 같은 슬롯의 월별 행은 기존 달력 화면과 동일하게 `updatedAt`, 없으면 `createdAt`을 비교해 최신 한 건을 사용합니다. 시간이 같으면 취소 행을 우선하고, 취소 상태까지 같으면 먼저 나온 행을 유지합니다. 제외된 모든 행을 원본 그대로 보관합니다.
- 월별 문서가 전혀 없을 때만 구 `schedules`를 원본으로 사용하고 동일한 중복 선택 규칙을 적용합니다. 월별 문서의 `items`가 비어 있는 경우에는 구 일정을 되살리지 않습니다.
- 보관 문서에는 원본 컬렉션·문서 ID·배열 순번·전체 원본 데이터를 기록합니다. 원본 위치와 내용의 SHA-256으로 보관 ID를 만들기 때문에 반복 실행은 중복 삽입하지 않고, 같은 위치의 내용이 바뀐 새 스냅샷은 별도 버전으로 보존합니다. 서로 다른 활성 슬롯이 같은 일정 ID를 사용하는 경우에는 계속 중단합니다.

2026-11-06 실제 Firestore의 읽기 전용 스냅샷 검사 결과는 다음과 같습니다. 이 검사는 Firestore 원본을 변경하지 않았습니다.

| 항목 | 개수 |
| --- | ---: |
| 사용자 | 21 |
| 월별 원본 문서 / 배열 행 | 25 / 1,248 |
| 현재 화면 기준 활성 일정 | 1,229 |
| 구 `schedules` 전체 보관 | 775 |
| 월별 중복 제외 행 보관 | 19 |
| 총 보관 문서 | 794 |
| 특별 일정 / 코드 / 변경 이력 | 20 / 8 / 947 |
| 기존 비밀번호 재설정 필요 계정 | 3 |

구 일정 775개의 슬롯 중 472개는 현재 월별 일정과 겹치고 303개는 과거 컬렉션에만 있습니다. 이 303개를 현재 일정에 추가하지 않고 원본 보관으로 남깁니다. 보관 컬렉션은 일반 일정 API로 제공하지 않습니다.

### MongoDB 가져오기

```bash
docker compose cp /absolute/path/firestore-export.json app:/tmp/firestore-export.json
docker compose exec -T -u root app chown node:node /tmp/firestore-export.json
docker compose exec -T app node scripts/import-firestore.mjs --file /tmp/firestore-export.json --current-layout
```

컨테이너는 일반 `node` 사용자로 실행하므로 복사한 파일의 소유자를 바꿔 0600 권한을 유지한 채 읽을 수 있게 합니다. 기본 동작은 검사만 수행하는 dry run입니다. 원본과 대상 DB의 충돌, 활성 일정과 보관 문서의 추가 예정 개수만 표시하고 데이터를 쓰지 않습니다. 문서 내용·사용자 식별자·비밀번호는 출력하지 않습니다. 결과 확인과 기존 DB 백업 후 같은 정책 옵션을 유지해 실행합니다.

```bash
docker compose exec -T app node scripts/import-firestore.mjs --file /tmp/firestore-export.json --current-layout --apply
docker compose exec -T app rm /tmp/firestore-export.json
```

`--apply`도 기존 `_id` 문서를 덮어쓰지 않습니다. 같은 파일을 다시 실행해도 기존 문서는 유지합니다. 대상 DB의 다른 문서와 아이디·이메일·일정 슬롯·코드가 충돌하면 중단합니다. 모든 문서 삽입은 하나의 트랜잭션으로 처리하므로 데이터 일부만 가져오는 상황을 방지합니다. 큰 데이터는 트랜잭션 제한에 맞는 별도 이전 절차가 필요할 수 있습니다.

기존 가져오기 도구는 Firestore의 평문 비밀번호를 MongoDB 해시로 변환했지만, Firebase Authentication 전환 후에는 이 해시를 운영 로그인에 사용하지 않습니다. `mustResetPassword`는 당시 이전 도구의 기록이며 Firebase 계정의 현재 비밀번호 유무를 뜻하지 않습니다. Firebase 비밀번호는 자동으로 가져오거나 변경하지 않습니다.

## 관리자 계정

다음 도구는 MongoDB 전용 로컬 개발 모드에서만 사용합니다. Firebase 모드에서는 거부되며, 운영 계정은 Firebase Authentication과 Firestore 프로필을 사용해 관리합니다.

```bash
read -s ADMIN_PASSWORD
export ADMIN_PASSWORD
docker compose exec -e ADMIN_PASSWORD app node scripts/manage-user.mjs --user-id YOUR_ADMIN_ID --name 관리자 --email admin@YOUR-DOMAIN
unset ADMIN_PASSWORD
```

Firebase 모드에서는 관리자 로그인 후 회원 관리 화면에서 비밀번호를 변경하면 Firebase Authentication의 비밀번호가 변경됩니다. 기존 세션은 유지되지 않으며 다시 로그인해야 합니다.

## 기존 Hosting 주소와 API 연결

`https://ewha-consulting.web.app`은 그대로 사용합니다. `.firebaserc`는 기존 `ewha-consulting` 프로젝트를 가리키며, `firebase.json`은 `dist`의 정적 화면과 React Router fallback만 배포합니다. 앱 서버는 별도 Firebase 서비스 계정으로 Authentication과 Firestore 사용자 프로필에 연결합니다.

브라우저는 `https://ewh-calendar-api.myljk1025.workers.dev/api`에 요청하며, Worker가 기존 Funnel API로 전달합니다. Worker와 서버의 로그인 제한 서명 비밀키 관리와 배포 순서는 [Jenkins 수동 배포](docs/jenkins.md)와 [중계 운영 안내](infra/cloudflare-api-gateway/README.md)를 참고하세요. 서버 Mac의 Docker, Tailscale과 Funnel은 계속 실행되어야 합니다. 공개 Worker 주소가 해당 유선망에서 허용되는지와 실제 로그인·일정 조회는 현장 PC에서 확인해야 합니다. Workers 무료 플랜에는 일일 요청 제한이 있으며, 한도 초과 시 서비스가 중단될 수 있습니다. 자세한 내용은 [Cloudflare Workers 한도](https://developers.cloudflare.com/workers/platform/limits/)를 참고하세요.

맥북 프로의 서버용 `.env`를 다음과 같이 설정합니다. `APP_ORIGIN`은 API 주소가 아니라 사용자가 여는 화면의 출처이며, CORS와 변경 요청 검증에 사용합니다.

```dotenv
APP_ORIGIN=https://ewha-consulting.web.app
COOKIE_SECURE=true
SESSION_TRANSPORT=bearer
APP_PORT=8180
```

```bash
docker compose up -d --build
curl --fail http://localhost:8180/api/health
```

### 기존 서비스를 유지하며 달력 경로 추가

2026-11-06 읽기 전용으로 확인한 맥북 프로의 기존 Tailscale 설정은 다음과 같습니다.

| HTTPS 경로 | 기존 로컬 서비스 |
| --- | --- |
| `https://macbookpro.tailf007d9.ts.net/` | `http://127.0.0.1:8080` — 참여자 분석 |
| `https://macbookpro.tailf007d9.ts.net/consulting-manager` | `http://127.0.0.1:3080` — 기존 별도 서비스 |
| `https://macbookpro.tailf007d9.ts.net:8443/` | `http://127.0.0.1:4301` — tailnet 전용 |

`/ewh-calendar` 경로는 달력 전용이며, 재설정 전에는 다른 서비스의 기존 Funnel 경로와 포트 충돌 여부를 확인합니다.

```bash
tailscale funnel status
tailscale serve status
```

기존 `/`, `/consulting-manager`, 8443 설정을 확인한 뒤 달력 전용 경로만 추가합니다. 아래는 운영자가 배포 시 실행할 명령입니다.

```bash
tailscale funnel --bg --https=443 --set-path=/ewh-calendar http://127.0.0.1:8180
tailscale funnel status
curl --fail https://macbookpro.tailf007d9.ts.net/ewh-calendar/api/health
```

Tailscale reverse proxy는 mount 접두어를 제거하므로 외부 `/ewh-calendar/api/health`는 달력 서버의 `/api/health`로 전달됩니다. 참조: [Funnel 명령과 경로 옵션](https://tailscale.com/docs/reference/tailscale-cli/funnel), [Tailscale의 접두어 제거 구현](https://github.com/tailscale/tailscale/blob/main/ipn/ipnlocal/serve.go).

경로 옵션 없는 `tailscale funnel --bg http://127.0.0.1:8180`은 기존 루트 서비스를 바꿀 수 있으므로 위 경로 지정 명령을 사용합니다. `tailscale funnel reset`도 기존 서비스를 제거하므로 사용하지 않습니다. 명령 후 기존 두 공개 경로와 tailnet 전용 설정이 유지되는지 대조합니다. macOS에서 `tailscale` 명령을 찾지 못하면 `/Applications/Tailscale.app/Contents/MacOS/Tailscale`을 사용합니다.

### Hosting 화면 빌드와 배포

빌드하는 컴퓨터에서 공개 API 주소만 담은 `.env.hosting`을 준비합니다. 비밀번호·MongoDB URI·세션 비밀 값은 이 파일에 넣지 않습니다.

```bash
cp .env.hosting.example .env.hosting
npm ci
npm run build:hosting
```

`.env.hosting`의 기본값은 다음과 같습니다.

```dotenv
FUNNEL_API_BASE_URL=https://ewh-calendar-api.myljk1025.workers.dev/api
```

`build:hosting`은 HTTPS와 전체 `/api` 경로를 검증한 뒤 `VITE_API_BASE_URL`을 빌드 프로세스에 전달합니다. API 주소가 없거나 HTTP이면 중단합니다. 다른 주소로 배포할 때는 환경 변수로 명시할 수도 있습니다.

```bash
FUNNEL_API_BASE_URL=https://ewh-calendar-api.myljk1025.workers.dev/api npm run build:hosting
```

기존 Firebase CLI 인증 계정에서 대상 프로젝트와 API health를 확인한 뒤 정적 화면만 배포합니다.

```bash
firebase deploy --only hosting --project ewha-consulting
```

Firebase CLI는 화면 배포 도구이며 앱의 로그인·DB용 SDK와 별개입니다. 배포 후 기존 `https://ewha-consulting.web.app`에서 관리자와 컨설턴트 로그인, 새로고침, 로그아웃, 일정 조회·변경을 확인합니다. 서버 Mac만 Docker·Tailscale·Funnel을 유지하면 되고 일반 사용자는 Tailscale을 설치할 필요가 없습니다.

## 자체 호스팅 선택지

Firebase Hosting까지 제거하려는 경우에는 소유한 사용자 도메인의 HTTPS 프록시가 React 화면과 `/api`를 모두 `http://127.0.0.1:8180`으로 전달하도록 구성할 수 있습니다. 이 모드에서는 `.env`를 `APP_ORIGIN=https://실제-도메인`, `COOKIE_SECURE=true`, `SESSION_TRANSPORT=cookie`로 설정하고 일반 `npm run build`로 화면을 빌드합니다. Hosting용 `VITE_API_BASE_URL`이 남아 있지 않아야 같은 출처의 `/api`를 호출합니다.

현재 요청에 맞는 기본 운영 방식은 Hosting 주소 유지입니다. 자체 호스팅으로 변경하면 Firebase 제공 `web.app` 주소를 외부 서버로 이전할 수 없으므로 접속 주소도 사용자 도메인으로 바뀝니다. 참조: [Firebase Hosting 도메인 안내](https://firebase.google.com/docs/hosting/custom-domain).

서버용 맥북은 절전 중 서비스를 제공할 수 없으므로 전원·네트워크·Docker 자동 시작을 운영 환경에 맞게 설정합니다.

## 백업과 복원

백업은 볼륨과 다른 저장 위치에도 복사합니다. 아래 명령은 MongoDB 컨테이너 안의 인증 환경 변수를 사용합니다.

```bash
mkdir -p backups
docker compose exec -T mongo sh -c 'mongodump --host localhost --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --oplog --archive --gzip' > backups/mongo.archive.gz
chmod 600 backups/mongo.archive.gz
```

출력 파일 이름은 매번 변경해 이전 백업을 덮어쓰지 않도록 합니다. 복원은 현재 데이터에 영향을 주므로 점검 시간에 앱을 중지하고 현재 백업을 먼저 만든 뒤 실행합니다. `--drop`은 백업에 포함된 컬렉션의 현재 데이터를 교체합니다.

```bash
docker compose stop app
docker compose exec -T mongo sh -c 'mongorestore --host localhost --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip --drop --oplogReplay' < backups/mongo.archive.gz
docker compose up -d app
```

`docker compose down`은 데이터를 named volume에 남깁니다. `docker compose down -v`는 DB 볼륨을 삭제하므로 운영 데이터에 사용하지 않습니다. MongoDB replica set 및 기동 순서는 [MongoDB 인증 문서](https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set-with-keyfile-access-control/), [Compose healthcheck 문서](https://docs.docker.com/compose/how-tos/startup-order/)를 참고하세요.

## 개발과 점검

```bash
npm ci
npm run dev:server
npm run dev
npm run build
npm test
```

개발 API 서버는 `.env`의 `MONGODB_URI`로 접근 가능한 개발 MongoDB replica set이 필요합니다. Compose의 MongoDB는 외부 포트를 공개하지 않으므로 호스트에서 직접 연결할 수 없습니다. 기존 운영 DB의 포트를 열기보다 별도 개발 DB를 사용합니다.

Vite 개발 모드에서는 `.env`를 `APP_ORIGIN=http://localhost:5173`, `COOKIE_SECURE=false`, `SESSION_TRANSPORT=cookie`, `PORT=3001`로 설정합니다. API 프록시 대상은 기본 `http://127.0.0.1:3001`이며 필요하면 `API_PROXY_TARGET`으로 바꿉니다. `APP_ORIGIN`은 브라우저 주소와 정확히 일치해야 합니다.

`npm test`는 기본 단위·이전 데이터 테스트를 실행합니다. 별도의 테스트용 MongoDB replica set이 있으면 `MONGODB_TEST_URI='mongodb://127.0.0.1:27781/?replicaSet=rs0' npm test`로 실제 API 인증·권한·업로드·되돌리기 통합 테스트도 실행합니다. 이 테스트는 임의 이름의 테스트 DB를 만들고 종료 시 해당 DB만 삭제합니다.

운영 로그는 `docker compose logs --tail=100 app`과 `docker compose logs --tail=100 mongo`로 확인합니다. 서버용 비밀 값과 개인정보는 로그나 저장소에 넣지 않습니다.

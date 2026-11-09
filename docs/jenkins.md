# Jenkins 수동 배포

개발 컴퓨터에서 변경사항을 커밋하고 GitHub `main`에 push한 다음 Jenkins의 `ewh-consulting-calendar-deploy` 작업에서 **Build Now**를 누릅니다. 매 실행은 `origin/main`을 새로 checkout하고 그 커밋의 `Jenkinsfile`을 읽습니다. 로컬에만 있는 커밋이나 다른 브랜치는 배포하지 않습니다. 타이머, SCM 폴링, GitHub webhook은 설정하지 않습니다.

```bash
git add <변경한-파일>
git commit -m '변경 내용'
git push origin main
```

배포 작업: [ewh-consulting-calendar-deploy](http://192.168.0.47:8081/job/ewh-consulting-calendar-deploy/). 회사에서 Tailscale로 접속할 경우 Jenkins 서버의 tailnet 주소를 사용합니다. 일반 사용자용 사이트는 계속 [ewha-consulting.web.app](https://ewha-consulting.web.app)입니다.

## 한 번 필요한 설정

Jenkins 실행 노드에는 Docker CLI, Compose, Git, gzip, sha256sum, 호스트 Docker socket 접근 권한이 필요합니다. 기존 참여자 분석 프로젝트와 동일한 Jenkins 노드를 사용할 수 있습니다. Jenkins Git 플러그인 대신 CLI Git과 `GIT_ASKPASS`를 사용하는 고정 checkout 로더를 제공합니다.

다음 Credentials를 Jenkins에 등록합니다. 비밀 값은 이 저장소나 공개 배포 설정에 넣지 않습니다.

| ID | 형식 | 용도 |
| --- | --- | --- |
| `consultingManager` | Username with password | GitHub 저장소 읽기. password에는 GitHub 토큰 |
| `firebase-consulting-deploy` | Secret file | 기존 Firebase CI 토큰 파일. `ewha-consulting` Hosting 배포 권한 필요 |
| `ewh-calendar-runtime-env` | Secret file | 기존 MongoDB·세션 운영 환경 파일. 교체하지 않고 유지 |
| `ewh-calendar-firebase-admin` | Secret file | Firebase 서비스 계정 JSON 파일 |
| `ewh-calendar-gateway-hmac` | Secret text | API 중계를 활성화할 때만 필요. Worker의 `GATEWAY_HMAC_SECRET`과 동일한 무작위 비밀키 |

기존 `ewh-calendar-runtime-env`는 수정하지 않습니다. Firebase 서비스 계정 JSON을 별도 Secret file `ewh-calendar-firebase-admin`으로 등록합니다. Jenkins는 실행 중에만 키를 인코딩해 후보 서버에 전달하며 키 파일이나 값을 로그·Git에 넣지 않습니다. 웹 API 키는 Firebase 웹 앱의 공개 설정이며 API URL, Hosting 프로젝트와 백업 저장 경로와 함께 `infra/jenkins/deploy.env`에서 관리합니다. 서비스 계정 준비가 끝나기 전에는 배포를 시작하지 않습니다.

API 중계를 사용할 때는 무작위로 생성한 32자 이상의 비밀키를 Jenkins의 Secret text `ewh-calendar-gateway-hmac`과 Worker의 Secret `GATEWAY_HMAC_SECRET`에 각각 안전하게 등록합니다. 두 값은 일치해야 합니다. 비밀키는 Git·로그·채팅이나 `deploy.env`에 넣지 않습니다. 등록과 Worker 검증 후 `infra/jenkins/deploy.env`에서 `GATEWAY_ENABLED=true`로 설정하면 Jenkins가 배포 단계에서만 Secret text를 후보 및 운영 API에 주입합니다. `GATEWAY_ENABLED=false`이면 추가 자격 증명 없이 기존 배포가 작동하고 비밀키가 전달되지 않습니다. 기존 API 주소를 유지하며 서버부터 배포한 뒤 Worker 인증과 로그인 제한을 확인하고, 그 다음 Hosting API 주소를 변경합니다.

Hosting 빌드는 `infra/jenkins/deploy.env`의 `FUNNEL_API_BASE_URL`을 사용합니다. Worker 사용 시 주소는 `https://ewh-calendar-api.myljk1025.workers.dev/api`이며, 기존 Funnel은 Worker에서 서버로 연결하는 경로로 유지합니다. 전환 후 공개 API 상태, 로그인과 일정 조회를 확인하고 문제 유선 PC에서 새 주소가 허용되는지도 확인합니다. Firebase Hosting에서 문제가 발생하면 이전 Hosting 버전으로 롤백하거나 API 주소를 이전 Funnel 주소로 되돌려 빌드·배포할 수 있지만, 그 경우 `*.ts.net`을 차단하는 유선망 문제도 되돌아옵니다. 롤백 중에도 기존 MongoDB 볼륨과 다른 Funnel 경로를 삭제하지 않습니다.

`infra/jenkins/ewh-calendar-deploy.xml`을 Pipeline 작업으로 등록합니다. 기존 작업이 있으면 registrar가 설정을 먼저 0600 파일로 백업하고, 저장 후 다시 읽어 동일한 로더인지 확인합니다.

```bash
node scripts/jenkins-register-job.mjs --interactive
```

기본 Jenkins 주소가 다르면 `JENKINS_URL`을 지정합니다. 등록만 실행하면 배포를 시작하지 않습니다. 작업 등록 후 즉시 수동 배포도 요청하려는 경우에만 `--build`를 추가합니다. 자동화 환경에서는 대화형 입력 대신 `JENKINS_USER`, `JENKINS_API_TOKEN`을 사용할 수 있습니다. Jenkins 비밀번호·API 토큰과 GitHub 토큰은 서로 다릅니다.

## 배포 검증과 데이터 유지

### MongoDB 사용자 상태 최초 전환

이 변경의 첫 운영 전환은 일반 Jenkins 빌드만 실행하면 안 됩니다. 신 API는 `local_state_metadata`의 `firebase-user-states-v1` 완료 마커가 없으면 시작하지 않습니다. 기존 운영 서버가 Firebase 사용자 상태를 변경하는 동안 복제하면 권한 정보가 오래될 수 있으므로, 전환 작업에는 별도 점검 시간과 명시적인 운영 승인이 필요합니다.

1. 점검 시간을 확보하고 사용자 관리 및 본인 강사료 변경을 포함한 모든 계정 변경 요청을 차단합니다. 진행 중인 계정 변경이 모두 정상 완료됐고 Firebase 콘솔이나 다른 경로에서 변경하지 않는 것을 확인합니다. 다른 Jenkins 작업이나 수동 배포도 동시에 실행하지 않습니다. 동일 Jenkins 작업의 중복 실행은 방지되지만 별도 작업·수동 배포까지 잠그지는 않습니다. 이 차단은 Jenkins가 자동으로 수행하거나 검증하지 않습니다.
2. Jenkins의 `INITIAL_USER_STATE_CUTOVER` 옵션을 명시적으로 선택해 빌드를 실행합니다. 선택은 1단계를 완료했다는 운영자의 확인을 뜻합니다. 옵션은 기본적으로 꺼져 있으며, 일반 배포는 기존 API가 새 사용자 상태 계약을 지원하지 않으면 운영 서버를 유지한 채 중단합니다. 새 매개변수가 Jenkins에 아직 나타나지 않으면 작업 설정 반영 상태를 먼저 확인합니다.
3. Jenkins가 테스트와 빌드, Hosting 접근 확인 및 MongoDB 백업을 실행합니다. 이후 구 API를 정상 종료하고 Firebase 감사를 재실행한 뒤, 일회성 컨테이너에서 Firebase 사용자 목록을 전용 MongoDB 컬렉션에 트랜잭션으로 초기화합니다. 신 API 시작 및 상태 검사가 성공해야 Hosting 배포가 계속됩니다. 비정상 종료나 계정 동기화 중단이 있으면 안전을 위해 중단합니다.
4. 관리자·컨설턴트 로그인, 권한, 일정 조회를 확인한 뒤 차단을 해제합니다. 초기화 완료 마커가 없거나 무효화되어 있으면 신 API는 시작하지 않습니다.

**구 API로 롤백하기 전:** 신 API를 포함해 양쪽 API를 정상 종료하고 진행 중인 사용자 변경이 종료됐음을 확인합니다. 백업과 Firebase 계정 감사를 검증한 뒤 같은 일회성 컨테이너에서 `FIREBASE_USER_STATES_QUIESCED=1 node scripts/bootstrap-firebase-user-states.mjs --invalidate`를 실행해 완료 마커를 무효화한 후에만 구 API를 시작합니다. 로컬 사용자 상태에 미완료 동기화가 있으면 마커 무효화를 거부합니다. 신 API는 무효화된 마커에서는 시작할 수 없습니다. 마커 무효화가 실패하면 구 API를 시작하지 않습니다.

**다시 신 API로 전환할 때:** 사용자 변경 차단과 구 API 중지를 다시 확인하고, 새로운 검증된 백업과 Firebase 계정 감사를 수행합니다. 위 초기화 도구를 `--apply`로 다시 실행하면 무효화된 전용 컬렉션만 Firebase 현재 상태로 트랜잭션 안에서 교체하고 마커를 복구합니다. 로컬 또는 Firebase에 동기화가 중단된 계정이 있으면 자동으로 덮어쓰지 않고 중단합니다. 양쪽 불일치의 원인과 중단된 작업을 조사해 안전하게 조정하기 전에는 재전환하지 않습니다. `FIREBASE_USER_STATES_QUIESCED` 설정만으로 중단이 보장되지는 않습니다.

초기 전환 스크립트는 장애 발생 시 신 API를 정지하고, 로컬 미완료 작업 및 Firebase 감사가 통과한 경우에만 완료 마커를 무효화해 이전 API를 복구합니다. 정지 상태나 미완료 여부를 확인하지 못하면 자동 복구하지 않습니다. 운영 트래픽 차단은 자동화되어 있지 않습니다. 동기화 오류·부분 장애가 생기면 Firebase 또는 로컬 잠금을 단독으로 해제하지 말고 양쪽 상태와 백업을 조사합니다.

배포는 다음 순서로 실행합니다.

1. **Checkout**: GitHub `main`의 커밋 SHA와 이미지 태그를 기록합니다.
2. **Verify**: lint·빌드와 별도 임시 MongoDB replica set의 통합 테스트를 실행합니다. 운영 데이터는 테스트에 사용하지 않습니다.
3. **Build release**: 백엔드와 Firebase Hosting 이미지를 빌드합니다.
4. **Check Hosting access**: Firebase Hosting 접근 권한을 먼저 확인합니다.
5. **Backup MongoDB**: 운영 MongoDB를 `mongodump --oplog`로 백업하고 압축과 SHA-256을 검사합니다. 백업 실패 시 배포를 중단합니다.
6. **Deploy API**: 백업을 재검증하고, 기존 이미지를 보관한 다음 후보 API의 상태와 Firebase 계정 대조를 확인합니다. 성공하면 앱 컨테이너만 교체하고, API 시작 검사 실패 시 이전 이미지를 복구합니다.
7. **Firebase Hosting**: 정적 화면을 배포하고 API와 화면의 공개 응답을 확인합니다.

운영 MongoDB 컨테이너와 named volume은 교체·삭제·초기화하지 않습니다. 백업과 후보 검사에 실패하면 기존 API와 화면을 유지합니다. 앱 교체 중에는 일시적인 접속 중단이 발생할 수 있습니다. Hosting 배포가 실패하면 API는 이미 교체되어 있을 수 있으므로 로그를 확인하고, API와 화면의 호환성을 확인한 뒤 조치해야 합니다. DB 스키마를 변경하는 코드는 별도의 데이터 이전·롤백 계획과 복원 테스트가 필요합니다.

## 백업 보관과 복원 검증

백업은 기본적으로 Jenkins의 영속 볼륨 `/var/jenkins_home/ewh-calendar-backups`에 빌드별 `.archive.gz`와 `.sha256` 파일로 남습니다. 디렉터리는 0700, 파일은 0600 권한으로 만듭니다. 새 백업의 압축과 체크섬을 확인한 뒤 이 작업의 이전 번호 백업 중 압축과 체크섬이 일치하는 쌍만 삭제해 정상 백업을 최신 1개로 유지합니다. 다른 이름, 짝이 없거나 손상된 파일과 심볼릭 링크는 자동 삭제하지 않으므로 남아 있으면 별도로 확인해야 합니다. 새 백업에 실패하면 기존 파일을 정리하지 않습니다. 해당 경로는 workspace가 아니므로 빌드 정리로 삭제되지 않습니다.

압축 검사와 체크섬은 파일 손상 여부를 확인하지만 **실제 복원 가능성을 보장하지 않습니다.** 정기적으로 격리된 MongoDB에 복원해 검증하고, 서버나 Jenkins 볼륨 장애에 대비해 별도의 안전한 저장소에도 백업 사본을 보관해야 합니다. MongoDB 백업은 Firebase Authentication이나 Firestore 데이터의 백업이 아닙니다.

Jenkins 빌드 로그와 `release-metadata.txt`에서 배포 커밋과 이미지 태그를 확인할 수 있습니다. 배포 작업은 MongoDB 복원이나 데이터 삭제를 수행하지 않습니다.

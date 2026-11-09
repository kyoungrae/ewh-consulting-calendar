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

API 중계를 사용할 때는 무작위로 생성한 32자 이상의 비밀키를 Jenkins의 Secret text `ewh-calendar-gateway-hmac`과 Worker의 Secret `GATEWAY_HMAC_SECRET`에 각각 안전하게 등록합니다. 두 값은 일치해야 합니다. 비밀키는 Git·로그·채팅이나 `deploy.env`에 넣지 않습니다. 등록과 Worker 검증 후 `infra/jenkins/deploy.env`에서 `GATEWAY_ENABLED=true`로 설정하면 Jenkins가 배포 단계에서만 Secret text를 후보 및 운영 API에 주입합니다. 기본값 `false`에서는 추가 자격 증명 없이 기존 배포가 작동하고 비밀키가 전달되지 않습니다. 기존 API 주소를 유지하며 서버부터 배포한 뒤 Worker 인증과 로그인 제한을 확인하고, 그 다음 Hosting API 주소를 변경합니다.

`infra/jenkins/ewh-calendar-deploy.xml`을 Pipeline 작업으로 등록합니다. 기존 작업이 있으면 registrar가 설정을 먼저 0600 파일로 백업하고, 저장 후 다시 읽어 동일한 로더인지 확인합니다.

```bash
node scripts/jenkins-register-job.mjs --interactive
```

기본 Jenkins 주소가 다르면 `JENKINS_URL`을 지정합니다. 등록만 실행하면 배포를 시작하지 않습니다. 작업 등록 후 즉시 수동 배포도 요청하려는 경우에만 `--build`를 추가합니다. 자동화 환경에서는 대화형 입력 대신 `JENKINS_USER`, `JENKINS_API_TOKEN`을 사용할 수 있습니다. Jenkins 비밀번호·API 토큰과 GitHub 토큰은 서로 다릅니다.

## 배포 검증과 데이터 유지

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

백업은 기본적으로 Jenkins의 영속 볼륨 `/var/jenkins_home/ewh-calendar-backups`에 빌드별 `.archive.gz`와 `.sha256` 파일로 남습니다. 디렉터리는 0700, 파일은 0600 권한으로 만들며 이전 백업을 덮어쓰거나 자동 삭제하지 않습니다. 백업에는 개인정보가 포함되므로 접근 권한을 제한하고 디스크 여유 공간을 관리하세요. 해당 경로는 workspace가 아니므로 빌드 정리로 삭제되지 않습니다.

압축 검사와 체크섬은 파일 손상 여부를 확인하지만 **실제 복원 가능성을 보장하지 않습니다.** 정기적으로 격리된 MongoDB에 복원해 검증하고, 서버나 Jenkins 볼륨 장애에 대비해 별도의 안전한 저장소에도 백업 사본을 보관해야 합니다. MongoDB 백업은 Firebase Authentication이나 Firestore 데이터의 백업이 아닙니다.

Jenkins 빌드 로그와 `release-metadata.txt`에서 배포 커밋과 이미지 태그를 확인할 수 있습니다. 배포 작업은 MongoDB 복원이나 데이터 삭제를 수행하지 않습니다.

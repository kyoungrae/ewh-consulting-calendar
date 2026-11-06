# Jenkins 수동 배포

개발 컴퓨터에서 변경사항을 커밋하고 GitHub `main`에 push한 다음 Jenkins의 `ewh-consulting-calendar-deploy` 작업에서 **Build Now**를 누릅니다. 매 실행은 `origin/main`을 새로 checkout하고 그 커밋의 `Jenkinsfile`을 읽습니다. 로컬에만 있는 커밋이나 다른 브랜치는 배포하지 않습니다. 타이머, SCM 폴링, GitHub webhook은 설정하지 않습니다.

```bash
git add <변경한-파일>
git commit -m '변경 내용'
git push origin main
```

배포 작업: [ewh-consulting-calendar-deploy](http://192.168.0.47:8081/job/ewh-consulting-calendar-deploy/). 회사에서 Tailscale로 접속할 경우 Jenkins 서버의 tailnet 주소를 사용합니다. 일반 사용자용 사이트는 계속 [ewha-consulting.web.app](https://ewha-consulting.web.app)입니다.

## 한 번 필요한 설정

Jenkins 실행 노드에는 Docker CLI, Compose, Git, 호스트 Docker socket 접근 권한이 필요합니다. 기존 참여자 분석 프로젝트와 동일한 Jenkins 노드를 사용할 수 있습니다. Jenkins Git 플러그인 대신 CLI Git과 `GIT_ASKPASS`를 사용하는 고정 checkout 로더를 제공합니다.

다음 Credentials를 Jenkins에 등록합니다. 비밀 값은 이 저장소나 공개 배포 설정에 넣지 않습니다.

| ID | 형식 | 용도 |
| --- | --- | --- |
| `consultingManager` | Username with password | GitHub 저장소 읽기. password에는 GitHub 토큰 |
| `firebase-consulting-deploy` | Secret file | 기존 Firebase CI 토큰 파일. `ewha-consulting` Hosting 배포 권한 필요 |
| `ewh-calendar-runtime-env` | Secret file | 맥북의 달력 운영 `.env` 전체 사본. MongoDB 자격 증명 및 서버 설정 |

운영 환경 파일은 Jenkins의 지속되는 Credentials 저장소에서 관리합니다. checkout workspace의 `.env`를 사용하거나 빌드마다 새 DB 비밀번호를 생성하지 않습니다. 운영 서버 설정을 변경할 때는 이 Credential도 함께 갱신합니다. 공개 API URL과 Hosting 프로젝트는 `infra/jenkins/deploy.env`에서 관리합니다.

Jenkins 안의 Secret file 경로는 Compose CLI가 `--env-file`로 직접 읽습니다. 해당 경로를 Mac 호스트의 Docker bind mount로 사용하지 않으므로 Jenkins 컨테이너와 호스트의 경로가 달라도 됩니다. MongoDB 데이터는 고정 Compose 프로젝트 `ewh-consulting-calendar`의 named volume을 사용합니다.

`infra/jenkins/ewh-calendar-deploy.xml`을 Pipeline 작업으로 등록합니다. 기존 작업이 있으면 registrar가 설정을 먼저 0600 파일로 백업하고, 저장 후 다시 읽어 동일한 로더인지 확인합니다.

```bash
node scripts/jenkins-register-job.mjs --interactive
```

기본 Jenkins 주소가 다르면 `JENKINS_URL`을 지정합니다. 등록만 실행하면 배포를 시작하지 않습니다. 작업 등록 후 즉시 수동 배포도 요청하려는 경우에만 `--build`를 추가합니다. 자동화 환경에서는 대화형 입력 대신 `JENKINS_USER`, `JENKINS_API_TOKEN`을 사용할 수 있습니다. Jenkins 비밀번호·API 토큰과 GitHub 토큰은 서로 다릅니다.

## 배포 검증과 데이터 유지

배포는 다음 순서로 실행합니다.

1. **Checkout**: GitHub `main` 최신 커밋을 받고 SHA를 빌드 설명과 `release-metadata.txt`에 기록합니다.
2. **Verify**: lint와 화면 빌드를 검사합니다. 별도의 Docker network와 MongoDB replica set을 만들고 인증·권한·일정 업로드·되돌리기·이전 데이터 통합 테스트를 실행한 뒤 테스트 컨테이너와 network만 제거합니다. 운영 MongoDB나 운영 자격 증명은 테스트에 사용하지 않습니다.
3. **Build release**: 해당 커밋의 API 이미지와 Funnel 주소가 들어간 Hosting 이미지를 빌드합니다.
4. **Check Hosting access**: 기존 Firebase 자격 증명으로 대상 프로젝트를 읽을 수 있는지 먼저 확인합니다.
5. **Deploy API**: 현재 API 이미지를 rollback 태그로 보존하고, 공개 포트가 없는 후보 API를 먼저 기동해 health를 확인합니다. 이후 운영 `app` 서비스만 교체합니다. health가 실패하면 이전 API 이미지로 자동 복구합니다. 운영 MongoDB 서비스와 볼륨은 교체하지 않습니다.
6. **Firebase Hosting**: 정적 화면만 기존 `ewha-consulting` 프로젝트에 배포합니다. 토큰은 배포 컨테이너의 stdin으로 전달하며 이미지·Docker 실행 환경 설정에 넣지 않습니다.
7. **Public smoke check**: 공개 Funnel API의 health와 Hosting 화면이 응답하는지 확인합니다. 로그인이나 사용자 데이터 변경은 수행하지 않습니다.

초기 MongoDB 생성, Firebase 데이터 가져오기, Funnel 경로 추가는 최초 서버 설치 단계에서 수행합니다. Jenkins의 반복 배포는 데이터 이전을 다시 실행하거나 Tailscale 설정을 바꾸지 않습니다. 최초 설치가 끝나지 않아 운영 MongoDB나 API가 없으면 배포를 중단합니다.

Jenkins 빌드 로그와 보관된 `release-metadata.txt`에서 배포 커밋과 이미지 태그를 확인할 수 있습니다. 최근 20개 빌드를 보관하며 현재 API 이미지와 rollback 이미지는 자동 삭제하지 않습니다. 디스크 정리는 실제 운영 이미지와 필요한 rollback 이미지를 확인한 후 수행합니다.

Hosting 배포나 공개 네트워크 확인이 실패하면 Jenkins 결과는 실패로 남습니다. 이미 health를 통과한 API를 이 경우에 자동으로 되돌리지는 않습니다. 로그에서 어느 단계가 실패했는지 확인하고 수정 후 같은 작업을 수동으로 재실행합니다. API 시작·health 실패에 대한 자동 복구는 DB 내용을 되돌리지 않으며, 데이터 복원은 별도 백업 절차로 수행합니다.

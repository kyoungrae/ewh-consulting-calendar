# Jenkins 수동 배포

개발 컴퓨터에서 변경사항을 커밋하고 GitHub `main`에 push한 다음 Jenkins의 `ewh-consulting-calendar-deploy` 작업에서 **Build Now**를 누릅니다. 매 실행은 `origin/main`을 새로 checkout하고 그 커밋의 `Jenkinsfile`을 읽습니다. 로컬에만 있는 커밋이나 다른 브랜치는 배포하지 않습니다. 타이머, SCM 폴링, GitHub webhook은 설정하지 않습니다.

```bash
git add <변경한-파일>
git commit -m '변경 내용'
git push origin main
```

배포 작업: [ewh-consulting-calendar-deploy](http://192.168.0.47:8081/job/ewh-consulting-calendar-deploy/). 회사에서 Tailscale로 접속할 경우 Jenkins 서버의 tailnet 주소를 사용합니다. 일반 사용자용 사이트는 계속 [ewha-consulting.web.app](https://ewha-consulting.web.app)입니다.

## 한 번 필요한 설정

Jenkins 실행 노드에는 Docker CLI, Git, 호스트 Docker socket 접근 권한이 필요합니다. 기존 참여자 분석 프로젝트와 동일한 Jenkins 노드를 사용할 수 있습니다. Jenkins Git 플러그인 대신 CLI Git과 `GIT_ASKPASS`를 사용하는 고정 checkout 로더를 제공합니다.

다음 Credentials를 Jenkins에 등록합니다. 비밀 값은 이 저장소나 공개 배포 설정에 넣지 않습니다.

| ID | 형식 | 용도 |
| --- | --- | --- |
| `consultingManager` | Username with password | GitHub 저장소 읽기. password에는 GitHub 토큰 |
| `firebase-consulting-deploy` | Secret file | 기존 Firebase CI 토큰 파일. `ewha-consulting` Hosting 배포 권한 필요 |

기본 작업은 화면만 배포하므로 `ewh-calendar-runtime-env`를 사용하지 않습니다. API 서버를 별도로 배포할 때는 서버의 운영 환경 파일과 Firebase 인증 설정이 필요합니다. 공개 API URL과 Hosting 프로젝트는 `infra/jenkins/deploy.env`에서 관리합니다.

`infra/jenkins/ewh-calendar-deploy.xml`을 Pipeline 작업으로 등록합니다. 기존 작업이 있으면 registrar가 설정을 먼저 0600 파일로 백업하고, 저장 후 다시 읽어 동일한 로더인지 확인합니다.

```bash
node scripts/jenkins-register-job.mjs --interactive
```

기본 Jenkins 주소가 다르면 `JENKINS_URL`을 지정합니다. 등록만 실행하면 배포를 시작하지 않습니다. 작업 등록 후 즉시 수동 배포도 요청하려는 경우에만 `--build`를 추가합니다. 자동화 환경에서는 대화형 입력 대신 `JENKINS_USER`, `JENKINS_API_TOKEN`을 사용할 수 있습니다. Jenkins 비밀번호·API 토큰과 GitHub 토큰은 서로 다릅니다.

## 배포 검증과 데이터 유지

배포는 다음 순서로 실행합니다.

1. **Checkout**: GitHub `main` 최신 커밋을 받고 SHA를 빌드 설명과 `release-metadata.txt`에 기록합니다.
2. **Build release**: `npm ci`와 `npm run build:hosting`을 실행하는 Hosting 이미지만 빌드합니다. 화면에 공개 Funnel API 주소가 포함됩니다.
3. **Firebase Hosting**: `firebase deploy --only hosting --project ewha-consulting`과 같은 방식으로 정적 화면을 배포합니다. 토큰은 배포 컨테이너의 stdin으로 전달합니다.
4. **Public smoke check**: Hosting 화면이 응답하는지 확인합니다.

이 작업은 API 서버, 서버 인증 설정, MongoDB를 배포하거나 변경하지 않습니다. 따라서 서버 소스 수정이나 Firebase Authentication 전환은 별도의 서버 배포와 설정 없이는 운영에 적용되지 않습니다. 화면과 서버 API가 호환되는지 배포 전에 확인하세요.

Jenkins 빌드 로그와 `release-metadata.txt`에서 배포 커밋과 Hosting 이미지 태그를 확인할 수 있습니다. Hosting 배포 또는 확인이 실패하면 해당 단계의 로그를 확인한 후 수동으로 재실행합니다.

# Firebase Hosting 배포 가이드

이 문서는 이 프로젝트를 Firebase Hosting에 배포하는 방법을 정리한 가이드입니다.

## 1. 사전 준비 (최초 1회)

### Firebase CLI 설치
터미널에서 아래 명령어를 실행하여 Firebase 도구를 전역으로 설치합니다.
```bash
npm install -g firebase-tools
```

### Firebase 로그인
구글 계정으로 로그인합니다.
```bash
firebase login
```

## 2. 프로젝트 초기화 (최초 1회)

프로젝트 루트 디렉토리에서 아래 명령어를 실행합니다.
```bash
firebase init hosting
```

**설정 옵션 선택:**
- **Project Setup**: `Use an existing project` 선택 후 해당 프로젝트(ewha-consulting) 선택
- **Public directory**: `dist` 작성 (Vite 빌드 폴더)
- **Single-page app**: `Yes` (React Router 사용 시 필수)
- **Automatic builds with GitHub**: `No` (필요 시 나중에 설정 가능)
- **Overwrite index.html**: `No`

## 3. 배포 프로세스 (업데이트 시마다 실행)

코드를 수정하고 서버에 반영하고 싶을 때는 항상 아래 두 단계를 순서대로 실행합니다.

### Step 1: 프로젝트 빌드
최신 소스 코드를 배포용 파일로 변환합니다.
```bash
npm run build
```

### Step 2: 배포 실행
빌드된 결과물(`dist` 폴더)을 Firebase 서버로 업로드합니다.
```bash
firebase deploy --only hosting
```

## 4. 배포 정보

- **Hosting URL**: [https://ewha-consulting.web.app](https://ewha-consulting.web.app)
- **Project Console**: [https://console.firebase.google.com/project/ewha-consulting/overview](https://console.firebase.google.com/project/ewha-consulting/overview)

---

**주의사항**:
- 배포 전 `src/hooks/useFirestore.js` 파일의 `DISABLE_FIRESTORE` 값이 `false`로 설정되어 실제 데이터베이스와 연결되어 있는지 확인하세요.
- `.env.local` 등 환경 변수 파일에 실제 Firebase 설정 정보가 올바르게 들어있는지 확인하세요.

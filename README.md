# 이화 컨설팅 관리 시스템 (EWH Consulting Management System)

이화여대 스타일의 내부 컨설팅 관리 시스템입니다. 컨설턴트와 관리자만 접속할 수 있는 일정 관리 플랫폼입니다.

![Ewha Green Theme](https://via.placeholder.com/800x400/00462A/FFFFFF?text=EWH+Consulting+Management+System)

## 🎯 주요 기능

### 접근 제어
- 등록된 컨설턴트와 관리자 계정으로만 로그인 가능
- 관리자가 계정을 생성하거나 승인해야 접속 가능
- 권한별 메뉴 접근 제어

### 관리자 기능
- **달력**: 전체 컨설팅 일정 조회 (FullCalendar)
- **일정 등록**: 컨설팅 일정 CRUD
- **코드 관리**: 컨설팅 구분 코드 관리
- **회원 관리**: 컨설턴트/관리자 계정 관리 및 승인

### 컨설턴트 기능
- **달력**: 본인에게 배정된 컨설팅 일정만 조회

### 실시간 동기화
- Firestore `onSnapshot`을 사용한 실시간 데이터 동기화
- 관리자가 일정을 수정하면 컨설턴트 화면에 즉시 반영

## 🛠 기술 스택

| 분류 | 기술 |
|------|------|
| Frontend | React (Vite) |
| Styling | Tailwind CSS |
| Calendar | FullCalendar |
| Backend/Auth | Firebase Authentication |
| Database | Cloud Firestore (NoSQL) |
| Icons | Lucide React |

## 📁 프로젝트 구조

```
src/
├── components/
│   ├── common/
│   │   ├── LoadingSpinner.jsx
│   │   └── Modal.jsx
│   └── layout/
│       ├── Header.jsx
│       ├── MainLayout.jsx
│       └── Sidebar.jsx
├── contexts/
│   └── AuthContext.jsx
├── firebase/
│   └── config.js
├── hooks/
│   └── useFirestore.js
├── pages/
│   ├── auth/
│   │   └── LoginPage.jsx
│   ├── calendar/
│   │   └── CalendarPage.jsx
│   ├── codes/
│   │   └── CodesPage.jsx
│   ├── schedules/
│   │   └── SchedulesPage.jsx
│   └── users/
│       └── UsersPage.jsx
├── routes/
│   └── ProtectedRoute.jsx
├── App.jsx
├── index.css
└── main.jsx
```

## 🗄 Firestore 데이터 구조

### users 컬렉션
| 필드 | 타입 | 설명 |
|------|------|------|
| uid | string | Firebase Auth UID |
| email | string | 이메일 |
| name | string | 이름 |
| tel | string | 전화번호 |
| role | string | 권한 (admin/consultant) |
| status | string | 상태 (pending/approved) |
| createdAt | timestamp | 생성일 |
| updatedAt | timestamp | 수정일 |

### schedules 컬렉션
| 필드 | 타입 | 설명 |
|------|------|------|
| studentName | string | 학생 이름 |
| date | string | 시작일시 |
| endDate | string | 종료일시 |
| location | string | 장소 |
| consultantId | string | 담당 컨설턴트 UID |
| typeCode | string | 컨설팅 구분 코드 |
| memo | string | 메모 |
| createdAt | timestamp | 생성일 |
| updatedAt | timestamp | 수정일 |

### common_codes 컬렉션
| 필드 | 타입 | 설명 |
|------|------|------|
| code | string | 코드 (예: 01, 02) |
| name | string | 코드명 (예: 진로, 취업) |
| description | string | 설명 |
| createdAt | timestamp | 생성일 |
| updatedAt | timestamp | 수정일 |

## 🚀 시작하기

### 1. Firebase 프로젝트 설정

1. [Firebase Console](https://console.firebase.google.com/)에서 새 프로젝트 생성
2. Authentication 활성화 (이메일/비밀번호)
3. Firestore 데이터베이스 생성
4. 프로젝트 설정에서 웹 앱 추가 및 설정값 복사

### 2. 환경 변수 설정

```bash
# .env.example을 복사하여 .env.local 생성
cp .env.example .env.local

# .env.local에 Firebase 설정값 입력
```

### 3. 의존성 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```

### 4. 초기 관리자 계정 생성

Firebase Console에서 직접 관리자 계정을 생성하세요:

1. **Authentication**: 이메일/비밀번호로 사용자 생성
2. **Firestore**: users 컬렉션에 문서 추가

```javascript
// Firestore > users 컬렉션에 추가
{
  uid: "[Authentication에서 생성된 UID]",
  email: "admin@example.com",
  name: "관리자",
  tel: "010-0000-0000",
  role: "admin",
  status: "approved",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp()
}
```

### 5. Firestore 보안 규칙

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 인증된 사용자만 접근 가능
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    match /schedules/{scheduleId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
    
    match /common_codes/{codeId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }
  }
}
```

## 🎨 디자인 가이드

### 컬러 팔레트 (이화여대 스타일)

| 용도 | 색상 | HEX |
|------|------|-----|
| Primary | Deep Green | #00462A |
| Primary Light | Light Green | #005c37 |
| Background | Light Gray | #f9fafb |
| Text Primary | Dark Gray | #1f2937 |
| Text Secondary | Medium Gray | #6b7280 |

### 폰트

- **Pretendard**: 기본 UI 폰트
- Google Fonts CDN 사용

## 📜 스크립트

```bash
# 개발 서버
npm run dev

# 프로덕션 빌드
npm run build

# 빌드 미리보기
npm run preview

# ESLint 검사
npm run lint
```

## 🔐 보안 참고사항

- Firebase 설정값은 환경 변수로 관리하세요
- `.env.local` 파일은 `.gitignore`에 포함되어 있습니다
- 프로덕션 배포 시 Firestore 보안 규칙을 반드시 설정하세요
- 관리자 초대 이메일 방식보다 직접 계정 생성을 권장합니다

## 📄 라이선스

MIT License

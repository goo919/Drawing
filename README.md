# 🫧 우리만의 상상 수족관

연인 두 명이 매일 주어지는 주제 문장을 보고 각자 상상 속 동물을 그리면,
두 그림이 공유 수족관에서 함께 헤엄치는 웹사이트입니다.

## 주요 기능

- **오늘의 주제**: 매일 자정에 새로운 주제 문장이 등장 (`js/topics.js`의 200개 문장을 날짜 기준으로 순환)
- **유형별 움직임**: 주제마다 유형이 붙어 있고, 그린 그림은 수족관에서 유형대로 행동
  - `swim` 물고기 (자유 유영, 밥에 반응) · `surface` 수면 생물 · `jelly` 해파리(둥실둥실)
  - `walker` 거북이·게 (바닥 걷기 + 가끔 헤엄) · `crawler` 불가사리·달팽이 (아주 느리게)
  - `reef` 암초 (배경, 옅은 색) · `plant` 수초 (살랑살랑) · `giant` 고래 (멀리서 옅은 회색으로 천천히)
- **비공개 규칙**: 두 사람이 **둘 다 제출하기 전까지는 서로의 그림을 볼 수 없음**.
  내 그림은 제출 직후 나만 볼 수 있고, 둘 다 제출하면 동시에 공개
- **당일 수정**: 제출한 그림은 그날 자정 전까지 언제든 수정 가능 (다음 날부터 잠금)
- **밥주기**: 수족관 빈 곳을 클릭하면 밥이 가라앉고, 물고기들이 (조금 뜸을 들이다) 다가와 먹음
- **드로잉 캔버스**: 기본 8색 ↔ 파스텔 8색 토글, 브러시 굵기, 지우개, 실행 취소, 전체 지우기,
  줌(버튼 / 마우스 휠 / 두 손가락 핀치), 터치 드로잉, 연필 낙서 느낌의 선
- **수족관**: 아래 1/5은 모랫바닥 (바닥 생물들의 무대), 클릭하면 주제·날짜·그린 사람과 함께 확대, 날짜별 필터
- **도감**: 그리드 카드로 한눈에 보기, 최신순/날짜순 정렬, 그린 사람별 필터
- **로그인**: 아이디(자성/지수) + 비밀번호. 각 아이디의 **첫 로그인 때 입력한 비밀번호가 등록**되고
  이후엔 그 비밀번호로만 로그인 가능 (SHA-256 해시로 공유 저장소에 저장). "자동 로그인" 체크 시
  기기에 저장되어 다음부터 바로 입장. 헤더의 사람 아이콘으로 로그아웃

## 실행 방법

정적 사이트라서 그냥 열면 됩니다.

```bash
# 로컬 서버로 실행 (추천 — Firebase 공유 모드를 쓸 거라면 필수)
npx serve .
# 또는
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000` 접속.
(Firebase 없이 로컬 모드로만 쓸 거면 `index.html`을 더블클릭해서 열어도 동작합니다.)

## 진짜로 둘이 함께 쓰기 — 온라인 배포 3단계

1. **Firebase 연결** (아래 "Firebase 연동" 5분 가이드) → `firebase-config.js` 를 만들어 **커밋**
   (웹 설정값은 비밀이 아니라서 커밋해도 안전해요. 데이터 보호는 보안 규칙이 담당)
2. **푸시** → `.github/workflows/deploy-pages.yml` 이 자동으로 GitHub Pages 에 배포
   (첫 배포가 실패하면 저장소 Settings → Pages → Source 를 "GitHub Actions" 로 한 번만 설정)
3. 배포 주소 **`https://goo919.github.io/Drawing/`** 를 여자친구에게 공유 →
   각자 폰에서 열고 A / B 프로필 선택. 끝!

> 테스트 팁: Cmd/Ctrl + T 또는 주제 카드를 빠르게 3번 탭하면 주제가 다음 것으로 바뀝니다 (이 기기에서만).

## 두 사람이 같은 수족관 보기 — Firebase 연동 (공유 모드)

기본 상태에서는 **로컬 모드**(💾 이 기기에만 저장)로 동작합니다.
두 사람이 서로 다른 기기에서 같은 수족관을 보려면 Firebase를 연결하세요. 5분이면 됩니다.

1. [Firebase 콘솔](https://console.firebase.google.com)에서 새 프로젝트 생성 (Google 애널리틱스는 꺼도 됨)
2. 왼쪽 메뉴 **빌드 → Firestore Database → 데이터베이스 만들기** (테스트 모드로 시작)
3. 프로젝트 설정(⚙️) → **웹 앱 추가(</>)** → 나오는 `firebaseConfig` 값 복사
4. 이 폴더의 `firebase-config.example.js`를 복사해 **`firebase-config.js`** 로 저장하고 설정값 붙여넣기
5. 새로고침하면 헤더에 **☁️ 공유 모드** 배지가 뜹니다. 끝!

배포는 GitHub Pages, Netlify, Firebase Hosting 등 아무 정적 호스팅이면 됩니다.
같은 주소로 두 사람이 접속해서 각자 A / B 프로필을 고르면 됩니다.

### Firestore 보안 규칙 (권장)

테스트 모드 규칙은 30일 후 만료되므로, **Firestore → 규칙** 탭에 아래를 붙여넣어 두세요.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /drawings/{id} {
      allow read: if true;
      allow create, update: if true; // 당일 수정을 위해 덮어쓰기 허용 (앱이 당일만 허용)
      allow delete: if false;
    }
    match /meta/{docId} {
      allow read, write: if true; // 이름 표시(profiles) + 로그인 정보(auth)
    }
  }
}
```

> 두 사람만 아는 URL로 운영하는 소규모 앱 기준의 단순한 규칙입니다.
> 더 잠그고 싶다면 Firebase 익명 인증 + 규칙 강화를 추가하면 됩니다.

## 카카오톡 아침 알림 (선택)

매일 자정(00:05 KST)에 두 사람의 카카오톡 **"나와의 채팅"** 으로
"오늘의 주제 도착" 메시지가 갑니다. GitHub Actions(`kakao-notify.yml`)가 보내며,
시크릿이 설정되지 않으면 조용히 건너뛰므로 안 써도 무방합니다.

### 설정 (약 10분, 한 번만)

1. [카카오 개발자](https://developers.kakao.com) → 애플리케이션 추가 → **REST API 키** 복사
2. 앱 설정에서:
   - **카카오 로그인 활성화** + Redirect URI에 `https://goo919.github.io/Drawing/` 등록
   - **동의항목**에서 "카카오톡 메시지 전송(talk_message)" 을 "선택 동의"로 설정
   - **팀원 관리**에 지수의 카카오 계정 초대 (개발 중 앱은 팀원만 로그인 가능)
3. **각자** 자기 카카오 계정으로 아래 URL을 브라우저에서 열어 동의 → 주소창에 붙는 `code=...` 값 복사
   ```
   https://kauth.kakao.com/oauth/authorize?client_id=REST키&redirect_uri=https://goo919.github.io/Drawing/&response_type=code&scope=talk_message
   ```
4. 받은 code로 토큰 발급 (10분 안에, code는 1회용):
   ```bash
   curl -X POST https://kauth.kakao.com/oauth/token \
     -d grant_type=authorization_code \
     -d client_id=REST키 \
     -d redirect_uri=https://goo919.github.io/Drawing/ \
     -d code=아까받은code
   ```
   응답의 **`refresh_token`** 값을 보관 (각자 1개씩, 총 2개)
5. GitHub 저장소 → Settings → Secrets and variables → Actions 에 등록:
   - `KAKAO_REST_KEY` = REST API 키
   - `KAKAO_REFRESH_A` = 자성의 refresh_token
   - `KAKAO_REFRESH_B` = 지수의 refresh_token
6. Actions 탭 → "KakaoTalk daily reminder" → Run workflow 로 즉시 테스트

> refresh token은 사용 중이면 자동 연장되지만, 두 달 이상 워크플로가 실패하면
> 3~5번을 다시 하면 됩니다. 알림은 각자 자신의 "나와의 채팅"방으로 도착합니다.

## 왜 Firebase(옵션 A)를 추천하나요?

| | 옵션 A: Firebase | 옵션 B: Node.js + Express 직접 구축 |
|---|---|---|
| 서버 운영 | 필요 없음 (정적 호스팅만) | 서버를 24시간 띄울 곳이 필요 |
| 실시간 동기화 | `onSnapshot`으로 내장 | 폴링/웹소켓 직접 구현 |
| 유지보수 | 설정 파일 하나 | 서버 코드 + 배포 + 백업 관리 |
| 비용 | 무료 티어로 충분 (하루 그림 2장) | 호스팅 비용 발생 가능 |

이 앱은 하루에 그림 2장, 사용자 2명이라 Firestore 무료 티어(일 5만 읽기/2만 쓰기)로 넉넉하고,
"상대가 제출하는 순간 동시 공개" 기능이 실시간 리스너로 자연스럽게 구현됩니다.

## 파일 구조

```
index.html                  # 페이지 구조 (오늘의 그림 / 수족관 / 도감 탭) + 연필 SVG 필터
css/style.css               # 흑백 연필 낙서 테마, 모바일 우선 반응형
js/topics.js                # 주제 문장 200개 (유형 태그 포함)
js/storage.js               # 저장소 레이어 (localStorage ↔ Firestore 자동 전환)
js/canvas.js                # 드로잉 캔버스 (색상/파스텔토글/굵기/줌/undo/지우개/낙서 지터)
js/aquarium.js              # 수족관 행동 엔진 (8가지 유형별 움직임 + 밥주기)
js/dogam.js                 # 도감 그리드
js/ui.js                    # 자체 확인 모달/토스트
js/app.js                   # 메인 로직 (주제 계산, 비공개 규칙, 당일 수정, 탭, 프로필, 모달)
firebase-config.example.js  # Firebase 설정 템플릿 (복사해서 firebase-config.js 로)
```

## 데이터 구조

그림 한 장 = 레코드 하나:

```js
{
  id: "2026-07-14_A",       // 날짜_사용자 (하루 1장 보장)
  date: "2026-07-14",
  user: "A",                 // 'A' | 'B'
  name: "콩이",
  topic: "비 오는 날에만 나타나는 동물",
  image: "data:image/png;base64,...", // 투명 배경 PNG
  submittedAt: 1789344000000
}
```

공개 여부는 저장하지 않고 **같은 날짜에 A와 B 레코드가 모두 존재하는지**로 판정합니다.

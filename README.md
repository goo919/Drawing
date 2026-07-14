# 🫧 우리만의 상상 수족관

연인 두 명이 매일 주어지는 주제 문장을 보고 각자 상상 속 동물을 그리면,
두 그림이 공유 수족관에서 함께 헤엄치는 웹사이트입니다.

## 주요 기능

- **오늘의 주제**: 매일 자정에 새로운 주제 문장이 등장 (`js/topics.js`의 120개 문장을 날짜 기준으로 순환)
- **비공개 규칙**: 두 사람이 **둘 다 제출하기 전까지는 서로의 그림을 볼 수 없음**.
  내 그림은 제출 직후 나만 미리 볼 수 있고(수정 불가), 둘 다 제출하면 동시에 공개
- **드로잉 캔버스**: 기본 8색 ↔ 파스텔 8색 토글, 브러시 굵기, 지우개, 실행 취소, 전체 지우기,
  줌(버튼 / 마우스 휠 / 두 손가락 핀치), 터치 드로잉 지원
- **수족관**: 공개된 그림들이 물고기처럼 유영 (클릭하면 주제·날짜·그린 사람과 함께 확대), 날짜별 필터
- **도감**: 그리드 카드로 한눈에 보기, 최신순/날짜순 정렬, 그린 사람별 필터
- **간단한 사용자 구분**: 로그인 없이 "나는 A / 나는 B" 선택 + 이름 입력

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
"이미 저장된 그림은 덮어쓸 수 없다"는 규칙까지 겸합니다.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /drawings/{id} {
      allow read: if true;
      allow create: if true;      // 새 그림 추가만 허용
      allow update, delete: if false; // 제출 후 수정/삭제 불가
    }
    match /meta/profiles {
      allow read, write: if true; // 이름 표시용
    }
  }
}
```

> 두 사람만 아는 URL로 운영하는 소규모 앱 기준의 단순한 규칙입니다.
> 더 잠그고 싶다면 Firebase 익명 인증 + 규칙 강화를 추가하면 됩니다.

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
index.html                  # 페이지 구조 (오늘의 그림 / 수족관 / 도감 탭)
css/style.css               # 파스텔 톤 스타일 + 반응형
js/topics.js                # 주제 문장 120개
js/storage.js               # 저장소 레이어 (localStorage ↔ Firestore 자동 전환)
js/canvas.js                # 드로잉 캔버스 (색상/파스텔토글/굵기/줌/undo/지우개)
js/aquarium.js              # 수족관 유영 애니메이션 + 거품/수초
js/dogam.js                 # 도감 그리드
js/app.js                   # 메인 로직 (주제 계산, 비공개 규칙, 탭, 프로필, 모달)
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

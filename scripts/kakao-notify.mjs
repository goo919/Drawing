// 매일 자정(KST)에 두 사람의 카카오톡 "나와의 채팅"으로 오늘의 주제를 보냅니다.
// GitHub Actions (kakao-notify.yml) 에서 실행되며, 아래 시크릿이 필요합니다:
//   KAKAO_REST_KEY   카카오 개발자 앱의 REST API 키
//   KAKAO_REFRESH_A  자성 계정의 refresh token
//   KAKAO_REFRESH_B  지수 계정의 refresh token
// 발급 방법은 README.md 의 "카카오톡 아침 알림" 섹션 참고.

import { readFileSync } from "fs";

const SITE = "https://goo919.github.io/Drawing/";
const REST = process.env.KAKAO_REST_KEY;

if (!REST) {
  console.log("KAKAO_REST_KEY 시크릿이 없어 알림을 건너뜁니다. (README의 설정 가이드 참고)");
  process.exit(0);
}

// 오늘의 주제 계산 (js/topics.js + app.js 의 날짜 로직과 동일, KST 기준)
const TOPICS = new Function(readFileSync("js/topics.js", "utf8") + "; return TOPICS;")();
const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
const todayUTC = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate());
const epochUTC = Date.UTC(2026, 0, 1);
const days = Math.round((todayUTC - epochUTC) / 86400000);
const topic = TOPICS[((days % TOPICS.length) + TOPICS.length) % TOPICS.length];

const message =
  `🐠 새로운 그림 주제가 도착했어요!\n\n` +
  `오늘의 주제\n“${topic.t}”\n\n` +
  `오늘 자정 전까지 그려서 수족관에 풀어주세요.`;

async function send(name, refreshToken) {
  if (!refreshToken) {
    console.log(`${name}: refresh token 시크릿이 없어 건너뜁니다.`);
    return;
  }
  // refresh token → access token
  const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: REST,
      refresh_token: refreshToken,
    }),
  });
  const token = await tokenRes.json();
  if (!token.access_token) {
    console.error(`${name}: 토큰 갱신 실패 —`, JSON.stringify(token));
    console.error(`::error::${name}의 카카오 refresh token이 만료됐을 수 있어요. README 가이드로 다시 발급해 시크릿을 교체하세요.`);
    process.exitCode = 1;
    return;
  }
  if (token.refresh_token) {
    // 카카오가 새 refresh token을 발급한 경우 (만료 1달 전) — 시크릿 교체 필요
    console.log(`::warning::${name}의 refresh token이 갱신되었습니다. 워크플로 로그 말고 카카오 재발급 절차로 새 토큰을 받아 시크릿을 교체해주세요.`);
  }

  // 나에게 보내기 (나와의 채팅)
  const sendRes = await fetch("https://kapi.kakao.com/v2/api/talk/memo/default/send", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token.access_token,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      template_object: JSON.stringify({
        object_type: "text",
        text: message,
        link: { web_url: SITE, mobile_web_url: SITE },
        button_title: "그리러 가기",
      }),
    }),
  });
  const result = await sendRes.json();
  if (result.result_code === 0) {
    console.log(`${name}: 카카오톡 전송 완료`);
  } else {
    console.error(`${name}: 전송 실패 —`, JSON.stringify(result));
    process.exitCode = 1;
  }
}

await send("자성", process.env.KAKAO_REFRESH_A);
await send("지수", process.env.KAKAO_REFRESH_B);

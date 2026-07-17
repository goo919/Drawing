// 웹 푸시 발송 스크립트 (GitHub Actions 에서 10분마다 실행)
//
// 하는 일:
//  1) 자정이 지나 새 주제가 나오면 → 두 사람 모두에게 "오늘의 주제" 알림
//  2) 한쪽이 오늘 그림을 제출한 걸 발견하면 → 아직 안 그린 상대방에게 알림
//  3) 둘 다 제출 완료(공개)를 발견하면 → 두 사람 모두에게 알림
//
// 구독 정보는 Firestore `push_subs` 컬렉션에서 읽고,
// 중복 발송 방지 상태는 `meta/notify_state` 문서에 기록합니다.
// 필요 시크릿: VAPID_PRIVATE_KEY (필수), VAPID_SUBJECT (선택, 기본 mailto)

import { readFileSync } from "fs";
import webpush from "web-push";

const SITE = "https://goo919.github.io/Drawing/";
const USERS = { A: "자성", B: "지수" };

// ---------- 설정 읽기 (커밋된 파일에서) ----------
const fbConf = readFileSync("firebase-config.js", "utf8");
const projectId = fbConf.match(/projectId:\s*"([^"]+)"/)?.[1];
const apiKey = fbConf.match(/apiKey:\s*"([^"]+)"/)?.[1];
const vapidPublic = readFileSync("push-public-key.js", "utf8").match(/"([A-Za-z0-9_-]{80,})"/)?.[1];
const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "mailto:kjsjs0919@gmail.com";

if (!vapidPrivate) {
  console.log("VAPID_PRIVATE_KEY 시크릿이 없어 알림을 건너뜁니다. (README의 웹 푸시 설정 참고)");
  process.exit(0);
}
if (!projectId || !apiKey || !vapidPublic) {
  console.error("firebase-config.js / push-public-key.js 에서 설정을 읽지 못했습니다.");
  process.exit(1);
}
webpush.setVapidDetails(subject, vapidPublic, vapidPrivate);

// ---------- Firestore REST 헬퍼 ----------
const BASE = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

function withKey(path) {
  // path 에 이미 쿼리(?)가 있으면 & 로 이어붙인다
  return `${BASE}/${path}${path.includes("?") ? "&" : "?"}key=${apiKey}`;
}

async function fsGet(path) {
  const r = await fetch(withKey(path));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Firestore GET ${path} 실패: ${r.status} ${await r.text()}`);
  return r.json();
}

async function fsPatch(path, fields) {
  const r = await fetch(withKey(path), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`Firestore PATCH ${path} 실패: ${r.status} ${await r.text()}`);
}

async function fsDelete(path) {
  await fetch(withKey(path), { method: "DELETE" });
}

// 오늘 날짜의 그림들만 (이미지 필드 제외하고) 조회
async function todaySubmissions(date) {
  const r = await fetch(`${BASE}:runQuery?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "drawings" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "date" },
            op: "EQUAL",
            value: { stringValue: date },
          },
        },
        select: { fields: [{ fieldPath: "user" }, { fieldPath: "date" }] },
      },
    }),
  });
  if (!r.ok) throw new Error(`runQuery 실패: ${r.status} ${await r.text()}`);
  const rows = await r.json();
  return rows
    .filter((row) => row.document)
    .map((row) => row.document.fields?.user?.stringValue)
    .filter(Boolean);
}

// ---------- 오늘 날짜/주제 (앱과 동일한 KST 로직) ----------
const TOPICS = new Function(readFileSync("js/topics.js", "utf8") + "; return TOPICS;")();
const kst = new Date(Date.now() + 9 * 3600 * 1000);
const todayKey = kst.toISOString().slice(0, 10);
const days = Math.round(
  (Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - Date.UTC(2026, 0, 1)) / 86400000
);
const topic = TOPICS[((days % TOPICS.length) + TOPICS.length) % TOPICS.length];

// ---------- 구독 목록 ----------
const subsDoc = await fsGet("push_subs?pageSize=300");
const subs = (subsDoc?.documents || []).map((d) => ({
  docPath: "push_subs/" + d.name.split("/").pop(),
  user: d.fields?.user?.stringValue,
  sub: JSON.parse(d.fields?.sub?.stringValue || "null"),
})).filter((s) => s.sub);

if (!subs.length) {
  console.log("등록된 푸시 구독이 없습니다. (앱에서 🔔 버튼으로 알림을 켜면 등록돼요)");
  process.exit(0);
}
console.log(`구독 ${subs.length}개 (자성 ${subs.filter((s) => s.user === "A").length} / 지수 ${subs.filter((s) => s.user === "B").length})`);

async function notify(targetUsers, payload) {
  const body = JSON.stringify({ ...payload, url: SITE });
  for (const s of subs) {
    if (targetUsers !== "all" && !targetUsers.includes(s.user)) continue;
    try {
      await webpush.sendNotification(s.sub, body);
      console.log(`  → ${USERS[s.user] || s.user} 기기 전송 완료`);
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        console.log(`  → 만료된 구독 삭제: ${s.docPath}`);
        await fsDelete(s.docPath);
      } else {
        console.error(`  → 전송 실패(${e.statusCode}):`, e.body || e.message);
        process.exitCode = 1;
      }
    }
  }
}

// ---------- 자유 문구 수동 발송 (Actions 의 Run workflow 에서 message 입력) ----------
if (process.env.PUSH_MESSAGE && process.env.PUSH_MESSAGE.trim()) {
  const targetLabel = process.env.PUSH_TARGET || "둘 다";
  const targets =
    targetLabel === "자성" ? ["A"] : targetLabel === "지수" ? ["B"] : "all";
  const sender = process.env.PUSH_SENDER || "자성";
  console.log(`자유 문구 발송: [${sender} → ${targetLabel}] ${process.env.PUSH_MESSAGE}`);
  await notify(targets, {
    title: `💌 ${sender}의 메시지`,
    body: process.env.PUSH_MESSAGE.trim(),
    tag: "manual-" + Date.now(),
  });
  process.exit(process.exitCode || 0);
}

// ---------- 수동 테스트 (Actions 의 Run workflow 에서 test=true) ----------
if (process.env.TEST_PUSH === "true") {
  console.log("테스트 알림 발송");
  await notify("all", {
    title: "🔔 테스트 알림",
    body: "알림이 잘 도착하고 있어요! 오늘의 주제: " + topic.t,
    tag: "test",
  });
  process.exit(process.exitCode || 0);
}

// ---------- 상태 읽기 (중복 발송 방지) ----------
const stateDoc = await fsGet("meta/notify_state");
let state = {};
try {
  state = JSON.parse(stateDoc?.fields?.data?.stringValue || "{}");
} catch {}
const before = JSON.stringify(state);

// 1) 새 주제 알림 (자정 이후 첫 실행)
if (state.topicDate !== todayKey) {
  console.log("새 주제 알림:", topic.t);
  await notify("all", {
    title: "🐠 오늘의 주제가 도착했어요!",
    body: `“${topic.t}” — 그리러 가볼까요?`,
    tag: "topic-" + todayKey,
  });
  state.topicDate = todayKey;
}

// 2) 3) 제출/공개 알림
const submitted = await todaySubmissions(todayKey); // ['A'] 또는 ['A','B'] ...
state.submitNotified = state.submitNotified || {};
state.revealNotified = state.revealNotified || {};

const bothDone = submitted.includes("A") && submitted.includes("B");

for (const u of submitted) {
  const id = `${todayKey}_${u}`;
  if (state.submitNotified[id]) continue;
  state.submitNotified[id] = true;
  const other = u === "A" ? "B" : "A";
  if (!bothDone) {
    console.log(`제출 알림: ${USERS[u]} → ${USERS[other]}에게`);
    await notify([other], {
      title: `🎨 ${USERS[u]}님이 오늘 그림을 완성했어요!`,
      body: "아직 안 그리셨다면 서둘러주세요. 둘 다 제출해야 공개돼요 🤫",
      tag: "submit-" + id,
    });
  }
}

if (bothDone && !state.revealNotified[todayKey]) {
  state.revealNotified[todayKey] = true;
  console.log("공개 알림 발송");
  await notify("all", {
    title: "🎉 오늘의 그림이 공개됐어요!",
    body: `“${topic.t}” — 수족관에서 새 친구들을 만나보세요`,
    tag: "reveal-" + todayKey,
  });
}

// 오래된 상태 정리 (3일 이전 기록 삭제)
const cutoff = new Date(Date.now() + 9 * 3600 * 1000 - 3 * 86400000).toISOString().slice(0, 10);
for (const k of Object.keys(state.submitNotified)) if (k.slice(0, 10) < cutoff) delete state.submitNotified[k];
for (const k of Object.keys(state.revealNotified)) if (k < cutoff) delete state.revealNotified[k];

if (JSON.stringify(state) !== before) {
  await fsPatch("meta/notify_state", { data: { stringValue: JSON.stringify(state) } });
  console.log("상태 저장 완료");
} else {
  console.log("보낼 알림 없음");
}

// 반납 예정일이 오늘이거나 내일인 책이 있으면 앱을 열 때 눈에 띄게 알려준다.
// 서버에는 아무 정보도 보내지 않고, 기기에 저장된 데이터만으로 그때그때 판단한다.
// (앱이 닫혀 있는 동안 알림을 보내는 진짜 푸시는 아니고, 앱을 열었을 때만 확인된다.)

import { getData, getDisplayStatus } from "./store.js";
import { todayStr, addDays } from "./dateUtils.js";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function computeDueSummary() {
  const data = getData();
  const today = todayStr();
  const tomorrow = addDays(today, 1);
  const borrowed = data.books.filter((b) => getDisplayStatus(b) === "borrowed");
  return {
    dueTodayCount: borrowed.filter((b) => b.dueAt === today).length,
    dueTomorrowCount: borrowed.filter((b) => b.dueAt === tomorrow).length,
  };
}

// 홈 화면 아이콘에 숫자 배지를 띄운다. iOS 16.4+ 홈 화면 추가 상태 등 지원하는
// 환경에서만 동작하고, 지원하지 않으면 조용히 넘어간다.
function updateAppBadge(total) {
  if (!("setAppBadge" in navigator)) return;
  try {
    if (total > 0) navigator.setAppBadge(total);
    else navigator.clearAppBadge();
  } catch {
    // 무시: 배지 갱신은 부가 기능이라 실패해도 앱 사용에 지장이 없어야 한다
  }
}

function bannerMessage(dueTodayCount, dueTomorrowCount) {
  if (dueTodayCount > 0 && dueTomorrowCount > 0) return `오늘 ${dueTodayCount}권, 내일 ${dueTomorrowCount}권 반납해야 해요!`;
  if (dueTodayCount > 0) return `오늘 ${dueTodayCount}권 반납해야 해요!`;
  return `내일 ${dueTomorrowCount}권 반납해야 해요!`;
}

// onOpenList: 배너를 누르면 반납할 책 목록을 보여줄 곳으로 이동시키는 콜백 (예: 홈 탭 이동)
export function renderDueReminder(onOpenList) {
  const { dueTodayCount, dueTomorrowCount } = computeDueSummary();
  const total = dueTodayCount + dueTomorrowCount;
  updateAppBadge(total);
  if (total === 0) return;

  const dismissKey = `rl_due_banner_dismissed_${todayStr()}`;
  try {
    if (sessionStorage.getItem(dismissKey)) return;
  } catch {
    // sessionStorage를 못 쓰는 환경이어도 배너 자체는 보여준다
  }

  const appEl = document.getElementById("app");
  if (!appEl || document.getElementById("due-reminder-banner")) return;

  const banner = document.createElement("div");
  banner.className = "due-reminder-banner";
  banner.id = "due-reminder-banner";
  banner.innerHTML = `
    <span class="stamp stamp--out due-reminder-stamp">반납 알림</span>
    <p class="due-reminder-text">${escapeHtml(bannerMessage(dueTodayCount, dueTomorrowCount))}</p>
    <button type="button" class="due-reminder-close" id="due-reminder-close-btn" aria-label="닫기">✕</button>
  `;
  appEl.prepend(banner);

  banner.addEventListener("click", (e) => {
    if (e.target.closest("#due-reminder-close-btn")) return;
    onOpenList?.();
  });
  banner.querySelector("#due-reminder-close-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    banner.remove();
    try {
      sessionStorage.setItem(dismissKey, "1");
    } catch {
      // 무시: 닫기는 이번 화면에서만 즉시 사라지면 충분하다
    }
  });
}

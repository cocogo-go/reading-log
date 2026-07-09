import { openAddFlow } from "./add.js";

const ONBOARD_KEY = "rl_onboarded_v1";

export function shouldShowOnboarding() {
  try {
    return !localStorage.getItem(ONBOARD_KEY);
  } catch {
    return false;
  }
}

function markOnboarded() {
  try {
    localStorage.setItem(ONBOARD_KEY, "1");
  } catch {
    // localStorage를 쓸 수 없어도 온보딩 자체는 계속 진행한다
  }
}

function homeScreenHint() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return "사파리 하단(또는 상단)의 공유 버튼을 누르고 '홈 화면에 추가'를 선택해보세요.";
  }
  if (/Android/i.test(ua)) {
    return "브라우저 오른쪽 위 메뉴(⋮)를 누르고 '홈 화면에 추가'를 선택해보세요.";
  }
  return "휴대폰 브라우저로 열면 홈 화면에 추가해서 앱처럼 쓸 수 있어요.";
}

const CARDS = [
  {
    emoji: "📖",
    title: "우리 가족,\n이번 달엔 어떤 책을 만났을까요?",
    body: "빌린 책, 반납일, 아이가 남긴 한마디까지 — 도서관 나들이의 기억을 대출카드처럼 차곡차곡 모아드려요.",
  },
  {
    emoji: "📮",
    title: "책 등 뒤에 도장 찍듯,\n기록은 10초면 충분해요",
    body: "도서관에서 바로 바코드를 비추거나, 책 정보 사진 한 장, 혹은 제목 한 줄이면 돼요.",
  },
  {
    emoji: "🔖",
    title: "자, 첫 도장을\n찍어볼까요?",
    body: "지금 빌린 책이 있다면 바로 기록해보세요. 도서관·가족 설정은 나중에 천천히 하셔도 괜찮아요.",
    cta: true,
  },
];

let overlayEl = null;

export function renderOnboarding(onDone) {
  overlayEl = document.createElement("div");
  overlayEl.className = "overlay";
  document.body.appendChild(overlayEl);

  overlayEl.innerHTML = `
    <div class="overlay-header">
      <span class="serif" style="font-size:17px;">우리 가족 대출카드</span>
      <button type="button" class="close-btn" id="onb-skip" style="font-size:13px; width:auto; padding:4px 8px;">건너뛰기</button>
    </div>
    <div class="onboarding-track" id="onb-track">
      ${CARDS.map(
        (c) => `
        <div class="onboarding-card">
          <div class="onboarding-emoji">${c.emoji}</div>
          <h2 class="serif onboarding-title">${c.title.replace(/\n/g, "<br />")}</h2>
          <p class="onboarding-body">${c.body}</p>
          ${
            c.cta
              ? `<button type="button" class="btn btn-primary btn-block" id="onb-cta" style="margin-top:24px;">첫 책 기록하기</button>
                <button type="button" class="hint" id="onb-homescreen-toggle" style="text-decoration:underline; margin-top:18px; background:none;">📱 홈 화면에 추가하는 방법</button>
                <p class="hint" id="onb-homescreen-hint" hidden style="margin-top:6px;">${homeScreenHint()}</p>`
              : ""
          }
        </div>
      `
      ).join("")}
    </div>
    <div class="onboarding-dots" id="onb-dots">
      ${CARDS.map((_, i) => `<span class="dot ${i === 0 ? "active" : ""}"></span>`).join("")}
    </div>
  `;

  const track = overlayEl.querySelector("#onb-track");
  const dots = overlayEl.querySelectorAll(".dot");

  function finish() {
    markOnboarded();
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
  }

  overlayEl.querySelector("#onb-skip").addEventListener("click", finish);

  track.addEventListener("scroll", () => {
    const idx = Math.round(track.scrollLeft / track.clientWidth);
    dots.forEach((d, i) => d.classList.toggle("active", i === idx));
  });

  overlayEl.querySelector("#onb-cta").addEventListener("click", () => {
    finish();
    openAddFlow(onDone);
  });

  const hsToggle = overlayEl.querySelector("#onb-homescreen-toggle");
  const hsHint = overlayEl.querySelector("#onb-homescreen-hint");
  hsToggle?.addEventListener("click", () => {
    hsHint.hidden = !hsHint.hidden;
  });
}

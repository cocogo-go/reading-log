// 카카오톡·인스타그램 같은 인앱 브라우저는 저장 공간이 불안정하거나 별도 컨테이너를 써서,
// 방금 기록한 내용이 다음에 열었을 때 사라져 보일 수 있다. 감지해서 사파리/크롬으로
// 나가도록 안내한다.

const DISMISS_KEY = "rl_inapp_banner_dismissed";

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function detectInAppBrowser() {
  const ua = navigator.userAgent || "";
  if (/KAKAOTALK/i.test(ua)) return { id: "kakaotalk", name: "카카오톡" };
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return { id: "facebook", name: "페이스북" };
  if (/Instagram/i.test(ua)) return { id: "instagram", name: "인스타그램" };
  if (/Line\//i.test(ua)) return { id: "line", name: "라인" };
  if (/NAVER\(inapp/i.test(ua)) return { id: "naver", name: "네이버 앱" };
  return null;
}

// 사파리/크롬으로 강제로 열 수 있는 URL 스킴이 알려진 경우에만 버튼이 실제로 이동시킨다.
// 인스타그램 등은 외부 브라우저로 여는 공식 스킴이 없어서, 그런 경우엔 링크 복사로 대신한다.
function externalOpenUrl(id, url) {
  if (id === "kakaotalk") return `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
  return null;
}

export function renderInAppBanner() {
  const info = detectInAppBrowser();
  if (!info) return;
  try {
    if (sessionStorage.getItem(DISMISS_KEY)) return;
  } catch {
    // sessionStorage를 쓸 수 없어도 배너 자체는 보여준다
  }

  const appEl = document.getElementById("app");
  if (!appEl) return;

  const openUrl = externalOpenUrl(info.id, location.href);

  const banner = document.createElement("div");
  banner.className = "inapp-banner";
  banner.innerHTML = `
    <div class="inapp-banner-top">
      <span class="stamp stamp--out inapp-banner-stamp">안내</span>
      <p class="inapp-banner-text"><strong>${escapeHtml(info.name)}</strong> 안에서 열려 있어요. 이대로 두면 기록이 저장되지 않을 수 있어요. 사파리나 크롬에서 열어주세요.</p>
      <button type="button" class="inapp-banner-close" id="inapp-close-btn" aria-label="닫기">✕</button>
    </div>
    <button type="button" class="btn btn-secondary btn-block inapp-banner-btn" id="${openUrl ? "inapp-open-btn" : "inapp-copy-btn"}">
      ${openUrl ? "사파리/크롬에서 열기" : "링크 복사하기"}
    </button>
  `;

  appEl.prepend(banner);

  banner.querySelector("#inapp-close-btn").addEventListener("click", () => {
    banner.remove();
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // 무시: 닫기 버튼은 이번 화면에서만 즉시 사라지면 충분하다
    }
  });

  const openBtn = banner.querySelector("#inapp-open-btn");
  openBtn?.addEventListener("click", () => {
    location.href = openUrl;
  });

  const copyBtn = banner.querySelector("#inapp-copy-btn");
  copyBtn?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      copyBtn.textContent = "복사했어요! 브라우저 앱에 붙여넣어 열어주세요.";
    } catch {
      copyBtn.textContent = "오른쪽 위 메뉴에서 '다른 브라우저로 열기'를 선택해주세요.";
    }
  });
}

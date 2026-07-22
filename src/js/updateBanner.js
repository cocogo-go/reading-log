// 홈 화면에 추가해 쓰는 경우, iOS가 앱을 완전히 새로 켜지 않고 백그라운드에서
// 그대로 이어서 보여주는 경우가 많아 새 버전이 있어도 새로고침 전까지는 반영되지 않는다.
// 이미 화면이 떠 있는 상태에서 새 버전이 설치 완료되면(= controller가 이미 있는 상태에서
// 새 워커가 installed 상태가 되면) 배너로 알려주고, 눌러서 새로고침할 수 있게 한다.

function showBanner() {
  if (document.getElementById("update-banner")) return; // 이미 떠 있으면 중복으로 만들지 않는다

  const appEl = document.getElementById("app");
  if (!appEl) return;

  const banner = document.createElement("div");
  banner.className = "update-banner";
  banner.id = "update-banner";
  banner.innerHTML = `
    <span class="stamp update-banner-stamp">새 버전</span>
    <p class="update-banner-text">기록장이 새 모습으로 업데이트됐어요.</p>
    <button type="button" class="btn btn-secondary update-banner-btn" id="update-reload-btn">새로고침</button>
    <button type="button" class="update-banner-close" id="update-close-btn" aria-label="닫기">✕</button>
  `;

  appEl.prepend(banner);

  banner.querySelector("#update-reload-btn").addEventListener("click", () => {
    window.location.reload();
  });
  banner.querySelector("#update-close-btn").addEventListener("click", () => {
    banner.remove();
  });
}

// register()가 반환한 등록 객체를 그대로 받아서 감시한다. getRegistration()을 따로
// 호출하면 register()가 실제로 등록을 마치기 전에 undefined를 돌려받는 경합이 생길 수 있다.
export function watchForUpdates(reg) {
  if (!reg) return;
  reg.addEventListener("updatefound", () => {
    const newWorker = reg.installing;
    if (!newWorker) return;
    newWorker.addEventListener("statechange", () => {
      // controller가 이미 있다는 건 최초 설치가 아니라 이미 쓰고 있던 화면에서
      // 새 버전이 설치 완료됐다는 뜻이다 (최초 설치 때는 알릴 필요가 없다).
      if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
        showBanner();
      }
    });
  });
}

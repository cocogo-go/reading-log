import { renderSettingsView } from "./views/settings.js";
import { renderHomeView } from "./views/home.js";
import { renderShelfView } from "./views/shelf.js";
import { renderUnderlineView } from "./views/underline.js";
import { openAddFlow } from "./views/add.js";
import { shouldShowOnboarding, renderOnboarding } from "./views/onboarding.js";
import { renderInAppBanner } from "./inAppBrowser.js";

const TABS = ["home", "shelf", "underline", "settings"];

const RENDERERS = {
  home: renderHomeView,
  shelf: renderShelfView,
  underline: renderUnderlineView,
  settings: renderSettingsView,
};

export function navigateToTab(name) {
  showView(name);
}

function showView(name) {
  for (const tab of TABS) {
    const view = document.getElementById(`view-${tab}`);
    if (tab === name) {
      view.hidden = false;
      RENDERERS[tab](view);
    } else {
      view.hidden = true;
    }
  }
  for (const btn of document.querySelectorAll(".tab")) {
    btn.setAttribute("aria-current", btn.dataset.tab === name ? "true" : "false");
  }
  location.hash = name;
}

function currentTab() {
  return TABS.find((tab) => !document.getElementById(`view-${tab}`).hidden) || "home";
}

function init() {
  renderInAppBanner();

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.tab));
  });
  document.getElementById("btn-add").addEventListener("click", () => {
    openAddFlow(() => showView(currentTab()));
  });

  const initial = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "home";
  showView(initial);

  if (shouldShowOnboarding()) {
    renderOnboarding(() => showView(currentTab()));
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./service-worker.js").catch((err) => {
      console.warn("service worker 등록 실패", err);
    });
  }
}

document.addEventListener("DOMContentLoaded", init);

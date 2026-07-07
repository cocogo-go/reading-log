import { getData, addBook, borrowCount } from "../store.js";
import { AGE_GROUPS, loanItemSrch, bookExist, enrichKeywords, hotTrend, newArrivalBook } from "../api.js";
import { enrichBookMetadata } from "../googleBooksApi.js";
import { todayStr } from "../dateUtils.js";
import { escapeHtml, renderCoverThumb, wireCoverFallbacks } from "./bookCard.js";

let overlayEl = null;

const SOURCES = [
  { code: "popular", name: "인기대출" },
  { code: "hot", name: "급상승" },
  { code: "new", name: "신착도서" },
  { code: "curated", name: "기관 추천" },
];

export function openRecommend() {
  closeRecommend();
  overlayEl = document.createElement("div");
  overlayEl.className = "overlay";
  document.body.appendChild(overlayEl);
  render();
}

function closeRecommend() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}

function render() {
  const data = getData();
  let ageCode = AGE_GROUPS[2].code; // 초등을 기본값으로
  let source = "popular"; // "popular" | "hot" | "new" | "curated"
  let libCode = data.libraries[0]?.libCode || "";

  function paint() {
    overlayEl.innerHTML = `
      <div class="overlay-header">
        <h2 class="serif" style="font-size:18px;">추천도서</h2>
        <button type="button" class="close-btn" id="rec-close">✕</button>
      </div>
      <div class="overlay-body">
        <div class="filter-row">
          ${SOURCES.map((s) => `<button type="button" class="filter-chip ${source === s.code ? "active" : ""}" data-source="${s.code}">${s.name}</button>`).join("")}
        </div>

        ${
          source === "curated"
            ? `<div class="empty-state">기관 추천도서는 다음 버전에서 만나요.<br />(어린이도서연구회 등 권장도서 목록 예정)</div>`
            : `
          ${
            source === "popular"
              ? `<div class="filter-row" id="age-row">
                  ${AGE_GROUPS.map((a) => `<button type="button" class="filter-chip ${a.code === ageCode ? "active" : ""}" data-age="${a.code}">${a.name}</button>`).join("")}
                </div>`
              : ""
          }
          ${
            source === "new"
              ? data.libraries.length > 0
                ? `<div class="field-group">
                    <span class="field-label">어느 도서관 신착도서를 볼까요?</span>
                    <select class="input" id="rec-lib-select">
                      ${data.libraries.map((l) => `<option value="${l.libCode}" ${l.libCode === libCode ? "selected" : ""}>${escapeHtml(l.libName)}</option>`).join("")}
                    </select>
                  </div>`
                : `<p class="hint">먼저 설정에서 나의 도서관을 등록해주세요.</p>`
              : ""
          }
          ${
            data.members.length > 0
              ? `<div class="field-group">
                  <span class="field-label">누구 걸로 담을까요?</span>
                  <select class="input" id="rec-member-select">
                    ${data.members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("")}
                  </select>
                </div>`
              : `<p class="hint">먼저 설정에서 가족 구성원을 등록해주세요.</p>`
          }
          <div id="rec-list"><p class="hint" style="margin:0;">불러오는 중이에요...</p></div>
        `
        }
      </div>
    `;

    overlayEl.querySelector("#rec-close").addEventListener("click", closeRecommend);

    overlayEl.querySelectorAll("[data-source]").forEach((btn) => {
      btn.addEventListener("click", () => {
        source = btn.dataset.source;
        paint();
      });
    });

    if (source === "popular") {
      overlayEl.querySelectorAll("[data-age]").forEach((btn) => {
        btn.addEventListener("click", () => {
          ageCode = btn.dataset.age;
          paint();
        });
      });
      loadPopular(ageCode);
    } else if (source === "hot") {
      loadHot();
    } else if (source === "new") {
      const libSelect = overlayEl.querySelector("#rec-lib-select");
      if (libSelect) {
        libSelect.addEventListener("change", () => {
          libCode = libSelect.value;
          loadNew(libCode);
        });
        loadNew(libCode);
      }
    }
  }

  async function loadPopular(ageCode) {
    const listEl = overlayEl.querySelector("#rec-list");
    if (!listEl) return;
    try {
      const books = await loanItemSrch(ageCode);
      paintList(listEl, books);
    } catch (err) {
      listEl.innerHTML = `<p class="hint" style="margin:0;">추천 목록을 불러오지 못했어요: ${escapeHtml(err.message)}</p>`;
    }
  }

  async function loadHot() {
    const listEl = overlayEl.querySelector("#rec-list");
    if (!listEl) return;
    try {
      const results = await hotTrend(todayStr());
      if (!overlayEl || !overlayEl.contains(listEl)) return;
      const books = [];
      results.forEach((r) => {
        r.docs.forEach((doc) => books.push({ ...doc, _dateLabel: r.date }));
      });
      paintList(listEl, books, (b) => `📈 ${b._dateLabel} 기준 ${b.difference}단계 상승`);
    } catch (err) {
      listEl.innerHTML = `<p class="hint" style="margin:0;">급상승 도서를 불러오지 못했어요: ${escapeHtml(err.message)}</p>`;
    }
  }

  async function loadNew(libCode) {
    const listEl = overlayEl.querySelector("#rec-list");
    if (!listEl || !libCode) return;
    listEl.innerHTML = `<p class="hint" style="margin:0;">불러오는 중이에요...</p>`;
    try {
      const books = await newArrivalBook(libCode);
      if (!overlayEl || !overlayEl.contains(listEl)) return;
      paintList(listEl, books, (b) => (b.reg_date ? `🆕 ${b.reg_date} 입고` : ""));
    } catch (err) {
      listEl.innerHTML = `<p class="hint" style="margin:0;">신착도서를 불러오지 못했어요: ${escapeHtml(err.message)}</p>`;
    }
  }

  function paintList(listEl, books, extraInfo) {
    if (!overlayEl || !overlayEl.contains(listEl)) return;
    if (books.length === 0) {
      listEl.innerHTML = `<p class="hint" style="margin:0;">추천할 책을 찾지 못했어요.</p>`;
      return;
    }
    listEl.innerHTML = books.map((b, i) => renderRecItem(b, i, extraInfo?.(b))).join("");
    wireCoverFallbacks(listEl);
    wireAvailability(listEl, books);
    wireAddButtons(listEl, books);
  }

  function renderRecItem(b, i, extraInfo) {
    const count = borrowCount(b.isbn13);
    return `
      <div class="lib-item" style="align-items:flex-start;" data-rec-idx="${i}">
        <div style="display:flex; gap:10px; min-width:0;">
          ${renderCoverThumb({ title: b.bookname, coverUrl: b.bookImageURL }, "sm")}
          <div style="min-width:0;">
            <div class="lib-name">${escapeHtml(b.bookname)}</div>
            <div class="lib-address">${escapeHtml(b.authors || "")}${b.authors && b.publisher ? " · " : ""}${escapeHtml(b.publisher || "")}</div>
            ${extraInfo ? `<div class="hint" style="margin-top:2px;">${escapeHtml(extraInfo)}</div>` : ""}
            <div class="hint" id="avail-${i}" style="margin-top:4px;">${getData().libraries.length > 0 ? "대출 가능 여부 확인 중..." : ""}</div>
            ${count > 0 ? `<div class="hint" style="color:var(--stamp); margin-top:2px;">이미 ${count}번 빌린 책이에요!</div>` : ""}
          </div>
        </div>
        <button type="button" class="btn btn-secondary" data-add-idx="${i}" style="flex-shrink:0;">담기</button>
      </div>
    `;
  }

  async function wireAvailability(listEl, books) {
    const libraries = getData().libraries;
    if (libraries.length === 0) return;
    books.forEach(async (b, i) => {
      const el = listEl.querySelector(`#avail-${i}`);
      if (!el || !b.isbn13) return;
      try {
        const results = await Promise.all(libraries.map((lib) => bookExist(b.isbn13, lib.libCode)));
        if (!overlayEl || !overlayEl.contains(el)) return;
        const available = results.filter((r) => r === "available").length;
        el.textContent = available > 0 ? `🟢 ${available}곳에서 대출 가능` : "🔴 대출 가능한 곳이 없어요";
      } catch {
        if (overlayEl && overlayEl.contains(el)) el.textContent = "";
      }
    });
  }

  function wireAddButtons(listEl, books) {
    listEl.querySelectorAll("[data-add-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const memberSelect = overlayEl.querySelector("#rec-member-select");
        if (!memberSelect) {
          alert("먼저 설정에서 가족 구성원을 등록해주세요.");
          return;
        }
        const b = books[Number(btn.dataset.addIdx)];
        const newBook = addBook({
          memberId: memberSelect.value,
          isbn13: b.isbn13 || "",
          title: b.bookname,
          author: b.authors || "",
          publisher: b.publisher || "",
          kdc: b.class_no || "",
          coverUrl: b.bookImageURL || "",
          status: "willBorrow",
        });
        enrichKeywords(b.isbn13);
        enrichBookMetadata(newBook);
        btn.textContent = "담았어요";
        btn.disabled = true;
      });
    });
  }

  paint();
}

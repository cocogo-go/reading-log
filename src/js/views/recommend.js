import { getData, addBook, borrowCount } from "../store.js";
import { AGE_GROUPS, loanItemSrch, bookExist, enrichKeywords } from "../api.js";
import { enrichBookMetadata } from "../googleBooksApi.js";
import { escapeHtml, renderCoverThumb, wireCoverFallbacks } from "./bookCard.js";

let overlayEl = null;

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
  let source = "popular"; // "popular" | "curated" (기관 추천, 다음 버전)

  function paint() {
    overlayEl.innerHTML = `
      <div class="overlay-header">
        <h2 class="serif" style="font-size:18px;">추천도서</h2>
        <button type="button" class="close-btn" id="rec-close">✕</button>
      </div>
      <div class="overlay-body">
        <div class="filter-row">
          <button type="button" class="filter-chip ${source === "popular" ? "active" : ""}" data-source="popular">인기대출</button>
          <button type="button" class="filter-chip ${source === "curated" ? "active" : ""}" data-source="curated">기관 추천</button>
        </div>

        ${
          source === "curated"
            ? `<div class="empty-state">기관 추천도서는 다음 버전에서 만나요.<br />(어린이도서연구회 등 권장도서 목록 예정)</div>`
            : `
          <div class="filter-row" id="age-row">
            ${AGE_GROUPS.map((a) => `<button type="button" class="filter-chip ${a.code === ageCode ? "active" : ""}" data-age="${a.code}">${a.name}</button>`).join("")}
          </div>
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
      loadList(ageCode);
    }
  }

  async function loadList(ageCode) {
    const listEl = overlayEl.querySelector("#rec-list");
    if (!listEl) return;
    try {
      const books = await loanItemSrch(ageCode);
      if (!overlayEl || !overlayEl.contains(listEl)) return;
      if (books.length === 0) {
        listEl.innerHTML = `<p class="hint" style="margin:0;">추천할 책을 찾지 못했어요.</p>`;
        return;
      }
      listEl.innerHTML = books.map((b, i) => renderRecItem(b, i)).join("");
      wireCoverFallbacks(listEl);
      wireAvailability(listEl, books);
      wireAddButtons(listEl, books);
    } catch (err) {
      listEl.innerHTML = `<p class="hint" style="margin:0;">추천 목록을 불러오지 못했어요: ${escapeHtml(err.message)}</p>`;
    }
  }

  function renderRecItem(b, i) {
    const count = borrowCount(b.isbn13);
    return `
      <div class="lib-item" style="align-items:flex-start;" data-rec-idx="${i}">
        <div style="display:flex; gap:10px; min-width:0;">
          ${renderCoverThumb({ title: b.bookname, coverUrl: b.bookImageURL }, "sm")}
          <div style="min-width:0;">
            <div class="lib-name">${escapeHtml(b.bookname)}</div>
            <div class="lib-address">${escapeHtml(b.authors || "")}${b.authors && b.publisher ? " · " : ""}${escapeHtml(b.publisher || "")}</div>
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

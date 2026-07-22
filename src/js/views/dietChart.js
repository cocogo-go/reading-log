import { getData } from "../store.js";
import { CATEGORIES, computeCounts, buildDietComment, classifyBook } from "../kdc.js";
import { escapeHtml, renderBookCard, wireCoverFallbacks } from "./bookCard.js";
import { openBookDetail } from "./bookDetail.js";
import { thisMonthKey } from "../dateUtils.js";
import { reclassifyEtcBooks } from "../kdcFallback.js";

let overlayEl = null;

function filterBooks(books, memberFilter, period) {
  let result = books;
  if (memberFilter !== "all") result = result.filter((b) => b.memberId === memberFilter);
  if (period === "month") {
    const mk = thisMonthKey();
    result = result.filter((b) => (b.borrowedAt || "").startsWith(mk));
  }
  return result;
}

function renderBar(counts, total, selectedCategory) {
  if (total === 0) {
    return `<div class="empty-state" style="padding:24px 0;">이 기간엔 기록된 책이 없어요.</div>`;
  }
  const segments = Object.entries(counts).filter(([, c]) => c > 0);
  return `
    <div style="display:flex; height:28px; border-radius:8px; overflow:hidden; margin-bottom:16px;">
      ${segments
        .map(
          ([key, c]) =>
            `<button type="button" data-category="${key}" title="${escapeHtml(CATEGORIES[key].label)} ${c}권" style="width:${((c / total) * 100).toFixed(1)}%; background:${CATEGORIES[key].color}; border:none; padding:0; cursor:pointer; opacity:${selectedCategory && selectedCategory !== key ? "0.45" : "1"};"></button>`
        )
        .join("")}
    </div>
    <div style="display:flex; flex-direction:column; gap:2px;">
      ${segments
        .sort((a, b) => b[1] - a[1])
        .map(
          ([key, c]) => `
        <button type="button" data-category="${key}" style="display:flex; align-items:center; gap:8px; font-size:13px; background:${selectedCategory === key ? "var(--line)" : "none"}; border:none; padding:6px 4px; border-radius:6px; cursor:pointer; text-align:left; width:100%;">
          <span style="width:10px; height:10px; border-radius:50%; background:${CATEGORIES[key].color}; display:inline-block; flex-shrink:0;"></span>
          <span style="flex:1; color:var(--ink);">${CATEGORIES[key].label}</span>
          <span style="color:var(--muted);">${c}권 ›</span>
        </button>
      `
        )
        .join("")}
    </div>
  `;
}

export function openDietChart() {
  closeDietChart();
  overlayEl = document.createElement("div");
  overlayEl.className = "overlay";
  document.body.appendChild(overlayEl);

  let memberFilter = "all";
  let period = "month";
  let selectedCategory = null;

  function paint() {
    const data = getData();
    const books = filterBooks(data.books, memberFilter, period);
    const counts = computeCounts(books);
    const total = books.length;
    const comment = buildDietComment(counts, total);
    // 기간/구성원 필터와 상관없이, 저장된 책 전체에서 재분류 대상(기타 + 직접 지정 안 함)을 센다.
    const etcTargetCount = data.books.filter((b) => b.isbn13 && !b.manualCategory && classifyBook(b) === "etc").length;
    // 선택한 카테고리가 이번 필터에서 사라졌으면(예: 구성원/기간을 바꿔서 0권이 됨) 선택을 푼다.
    if (selectedCategory && !counts[selectedCategory]) selectedCategory = null;
    const selectedBooks = selectedCategory ? books.filter((b) => classifyBook(b) === selectedCategory) : [];

    overlayEl.innerHTML = `
      <div class="overlay-header">
        <h2 class="serif" style="font-size:18px;">독서 식단표</h2>
        <button type="button" class="close-btn" id="diet-close">✕</button>
      </div>
      <div class="overlay-body">
        ${
          data.members.length > 0
            ? `<div class="filter-row">
                <button type="button" class="filter-chip ${memberFilter === "all" ? "active" : ""}" data-member="all">전체 가족</button>
                ${data.members
                  .map((m) => `<button type="button" class="filter-chip ${memberFilter === m.id ? "active" : ""}" data-member="${m.id}">${escapeHtml(m.name)}</button>`)
                  .join("")}
              </div>`
            : ""
        }
        <div class="filter-row">
          <button type="button" class="filter-chip ${period === "month" ? "active" : ""}" data-period="month">이번 달</button>
          <button type="button" class="filter-chip ${period === "all" ? "active" : ""}" data-period="all">전체 기간</button>
        </div>
        ${comment ? `<div class="card" style="margin-bottom:16px;"><p class="serif" style="font-size:16px; margin:0;">${escapeHtml(comment)}</p></div>` : ""}
        ${renderBar(counts, total, selectedCategory)}
        ${
          selectedCategory
            ? `<div class="card" style="margin-top:4px; margin-bottom:16px;">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                  <span class="serif" style="font-size:15px;">${escapeHtml(CATEGORIES[selectedCategory].label)} · ${selectedBooks.length}권</span>
                  <button type="button" id="category-list-close" class="hint" style="background:none; text-decoration:underline;">닫기</button>
                </div>
                <div id="category-book-list" style="display:flex; flex-direction:column; gap:10px;">
                  ${selectedBooks.map((b) => renderBookCard(b)).join("")}
                </div>
              </div>`
            : ""
        }
        ${
          etcTargetCount > 0
            ? `<div class="card" style="margin-top:16px;">
                <p class="hint" style="margin:0 0 10px;">'기타'로 분류된 책이 ${etcTargetCount}권 있어요. 국립중앙도서관 등에서 분류 정보를 다시 확인해볼까요?</p>
                <button type="button" class="btn btn-secondary btn-block" id="reclassify-btn">분류 다시 불러오기</button>
                <p class="hint" id="reclassify-status" style="margin:8px 0 0;"></p>
              </div>`
            : ""
        }
      </div>
    `;

    overlayEl.querySelector("#diet-close").addEventListener("click", closeDietChart);

    const reclassifyBtn = overlayEl.querySelector("#reclassify-btn");
    if (reclassifyBtn) {
      reclassifyBtn.addEventListener("click", async () => {
        const statusEl = overlayEl.querySelector("#reclassify-status");
        reclassifyBtn.disabled = true;
        statusEl.textContent = "다시 확인하는 중이에요...";
        const beforeIds = data.books.filter((b) => b.isbn13 && !b.manualCategory && classifyBook(b) === "etc").map((b) => b.id);
        await reclassifyEtcBooks();
        if (!overlayEl) return; // 그 사이 화면을 닫았으면 여기서 끝낸다
        const fresh = getData();
        const changed = beforeIds.filter((id) => {
          const b = fresh.books.find((x) => x.id === id);
          return b && classifyBook(b) !== "etc";
        }).length;
        // 결과 메시지를 먼저 보여주고(다 고쳐져서 이 카드 자체가 사라질 수도 있으니), 잠시 후 화면을 새로 그린다.
        statusEl.textContent = `${beforeIds.length}권 중 ${changed}권 다시 분류했어요.`;
        setTimeout(() => {
          if (overlayEl) paint();
        }, 1500);
      });
    }
    overlayEl.querySelectorAll("[data-member]").forEach((btn) => {
      btn.addEventListener("click", () => {
        memberFilter = btn.dataset.member;
        paint();
      });
    });
    overlayEl.querySelectorAll("[data-period]").forEach((btn) => {
      btn.addEventListener("click", () => {
        period = btn.dataset.period;
        paint();
      });
    });
    overlayEl.querySelectorAll("[data-category]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedCategory = selectedCategory === btn.dataset.category ? null : btn.dataset.category;
        paint();
      });
    });
    const categoryListCloseBtn = overlayEl.querySelector("#category-list-close");
    if (categoryListCloseBtn) {
      categoryListCloseBtn.addEventListener("click", () => {
        selectedCategory = null;
        paint();
      });
    }
    const categoryBookList = overlayEl.querySelector("#category-book-list");
    if (categoryBookList) {
      categoryBookList.querySelectorAll("[data-book-id]").forEach((el) => {
        el.addEventListener("click", () => {
          openBookDetail(el.dataset.bookId, paint);
        });
      });
      wireCoverFallbacks(categoryBookList);
    }
  }

  paint();
}

function closeDietChart() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}

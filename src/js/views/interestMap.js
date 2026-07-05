import { getData, getKeywordsForIsbn } from "../store.js";
import { monthsAgoStr } from "../dateUtils.js";
import { escapeHtml } from "./bookCard.js";

let overlayEl = null;

export function openInterestMap() {
  closeInterestMap();
  overlayEl = document.createElement("div");
  overlayEl.className = "overlay";
  document.body.appendChild(overlayEl);
  render();
}

function closeInterestMap() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}

// 대출 기록마다(재대출 포함) 키워드 가중치를 더한다 — 여러 번 빌릴수록 자연히 더 크게 반영된다.
function computeScores(books) {
  const scores = {};
  books.forEach((b) => {
    const keywords = getKeywordsForIsbn(b.isbn13);
    if (!keywords) return;
    keywords.forEach(({ word, weight }) => {
      scores[word] = (scores[word] || 0) + weight;
    });
  });
  return scores;
}

function render() {
  const data = getData();
  let memberFilter = "all";

  function paint() {
    const cutoff = monthsAgoStr(3);
    let books = data.books.filter((b) => b.borrowedAt && b.borrowedAt >= cutoff);
    if (memberFilter !== "all") books = books.filter((b) => b.memberId === memberFilter);

    const scores = computeScores(books);
    const entries = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);
    const maxScore = entries[0]?.[1] || 1;
    const minScore = entries[entries.length - 1]?.[1] || 1;
    const comment = entries.length > 0 ? `요즘 '${entries[0][0]}'에 관심이 많아요!` : "";

    overlayEl.innerHTML = `
      <div class="overlay-header">
        <h2 class="serif" style="font-size:18px;">관심사 지도</h2>
        <button type="button" class="close-btn" id="im-close">✕</button>
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
        <p class="hint" style="margin-bottom:14px;">최근 3개월 대출 기록 기준</p>
        ${
          entries.length === 0
            ? `<div class="empty-state">아직 관심사를 보여줄 만큼 기록이 쌓이지 않았어요.<br />바코드 스캔이나 자동완성으로 등록하면 키워드가 쌓여요.</div>`
            : `
          <div class="card" style="margin-bottom:16px;">
            <p class="serif" style="font-size:16px; margin:0;">${escapeHtml(comment)}</p>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:10px 14px; align-items:center; justify-content:center; padding:12px 8px;">
            ${entries
              .map(([word, score]) => {
                const t = maxScore === minScore ? 1 : (score - minScore) / (maxScore - minScore);
                const fontSize = 14 + t * 20;
                const opacity = 0.55 + t * 0.45;
                return `<span class="serif" style="font-size:${fontSize.toFixed(0)}px; color:var(--spine); opacity:${opacity.toFixed(2)};">${escapeHtml(word)}</span>`;
              })
              .join("")}
          </div>
        `
        }
      </div>
    `;

    overlayEl.querySelector("#im-close").addEventListener("click", closeInterestMap);
    overlayEl.querySelectorAll("[data-member]").forEach((btn) => {
      btn.addEventListener("click", () => {
        memberFilter = btn.dataset.member;
        paint();
      });
    });
  }

  paint();
}

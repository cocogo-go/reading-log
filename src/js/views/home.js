import { getData, getDisplayStatus } from "../store.js";
import { renderBookCard } from "./bookCard.js";
import { openBookDetail } from "./bookDetail.js";
import { CATEGORIES, computeCounts, buildDietComment } from "../kdc.js";
import { openDietChart } from "./dietChart.js";

function thisMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

export function renderHomeView(container) {
  const data = getData();
  const borrowedBooks = data.books
    .filter((b) => {
      const s = getDisplayStatus(b);
      return s === "borrowed" || s === "overdue";
    })
    .sort((a, b) => (a.dueAt || "").localeCompare(b.dueAt || ""));

  const monthKey = thisMonthKey();
  const thisMonthBooks = data.books.filter((b) => (b.borrowedAt || "").startsWith(monthKey));
  const thisMonthCount = thisMonthBooks.length;

  const dietCounts = computeCounts(thisMonthBooks);
  const dietTotal = thisMonthBooks.length;
  const dietComment = buildDietComment(dietCounts, dietTotal);
  const dietSegments = Object.entries(dietCounts).filter(([, c]) => c > 0);

  container.innerHTML = `
    <h2 class="screen-title serif">홈</h2>

    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div class="hint" style="margin:0;">이번 달 대출</div>
          <div class="serif" style="font-size:24px; margin-top:2px;">${thisMonthCount}권</div>
        </div>
        <span class="stamp">${new Date().getMonth() + 1}월</span>
      </div>
    </div>

    <div class="card book-card" id="diet-preview" style="margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <h3 class="serif" style="font-size:15px; margin:0;">이번 달 독서 식단표</h3>
        <span class="hint" style="margin:0;">자세히 보기 ›</span>
      </div>
      ${
        dietTotal === 0
          ? `<p class="hint" style="margin:0;">이번 달 기록이 쌓이면 식단표가 채워져요.</p>`
          : `
        <div style="display:flex; height:14px; border-radius:7px; overflow:hidden; margin-bottom:10px;">
          ${dietSegments.map(([key, c]) => `<div style="width:${((c / dietTotal) * 100).toFixed(1)}%; background:${CATEGORIES[key].color};"></div>`).join("")}
        </div>
        <p class="serif" style="font-size:14px; margin:0;">${dietComment}</p>
      `
      }
    </div>

    <h3 class="serif" style="font-size:15px; margin-bottom:10px;">지금 빌린 책</h3>
    ${
      borrowedBooks.length === 0
        ? `<div class="empty-state">아직 도장이 하나도 없어요.<br />첫 번째 책을 기록해보세요.</div>`
        : borrowedBooks.map((b) => renderBookCard(b)).join("")
    }
  `;

  container.querySelectorAll("[data-book-id]").forEach((el) => {
    el.addEventListener("click", () => {
      openBookDetail(el.dataset.bookId, () => renderHomeView(container));
    });
  });

  container.querySelector("#diet-preview").addEventListener("click", openDietChart);
}

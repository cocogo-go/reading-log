import { getData, getDisplayStatus } from "../store.js";
import { renderBookCard, wireCoverFallbacks } from "./bookCard.js";
import { openBookDetail } from "./bookDetail.js";
import { CATEGORIES, computeCounts, buildDietComment } from "../kdc.js";
import { openDietChart } from "./dietChart.js";
import { openRecommend } from "./recommend.js";
import { openInterestMap } from "./interestMap.js";
import { thisMonthKey } from "../dateUtils.js";

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

  const dietCounts = computeCounts(thisMonthBooks);
  const dietTotal = thisMonthBooks.length;
  const dietComment = buildDietComment(dietCounts, dietTotal);
  const dietSegments = Object.entries(dietCounts).filter(([, c]) => c > 0);

  container.innerHTML = `
    <h2 class="screen-title serif">홈</h2>

    <div class="card" style="margin-bottom:16px;">
      <div id="borrowed-toggle" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
        <div>
          <div class="hint" style="margin:0;">대출중인 책</div>
          <div class="serif" style="font-size:24px; margin-top:2px;">${borrowedBooks.length}권</div>
        </div>
        <span class="hint" id="borrowed-toggle-label" style="margin:0;">${borrowedBooks.length === 0 ? "" : "더보기 ›"}</span>
      </div>
      <div id="borrowed-list" hidden style="margin-top:14px;">
        ${borrowedBooks.map((b) => renderBookCard(b)).join("")}
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

    <div class="card book-card" id="interest-entry" style="margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3 class="serif" style="font-size:15px; margin:0;">관심사 지도</h3>
        <span class="hint" style="margin:0;">›</span>
      </div>
    </div>

    <div class="card book-card" id="recommend-entry">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h3 class="serif" style="font-size:15px; margin:0;">추천도서 둘러보기</h3>
        <span class="hint" style="margin:0;">›</span>
      </div>
    </div>

    ${borrowedBooks.length === 0 ? `<div class="empty-state" style="margin-top:16px;">아직 도장이 하나도 없어요.<br />첫 번째 책을 기록해보세요.</div>` : ""}
  `;

  const borrowedList = container.querySelector("#borrowed-list");
  if (borrowedBooks.length > 0) {
    container.querySelector("#borrowed-toggle").addEventListener("click", () => {
      borrowedList.hidden = !borrowedList.hidden;
      container.querySelector("#borrowed-toggle-label").textContent = borrowedList.hidden ? "더보기 ›" : "접기 ‹";
    });
  }

  container.querySelectorAll("[data-book-id]").forEach((el) => {
    el.addEventListener("click", () => {
      openBookDetail(el.dataset.bookId, () => renderHomeView(container));
    });
  });
  wireCoverFallbacks(container);

  container.querySelector("#diet-preview").addEventListener("click", openDietChart);
  container.querySelector("#interest-entry").addEventListener("click", openInterestMap);
  container.querySelector("#recommend-entry").addEventListener("click", openRecommend);
}

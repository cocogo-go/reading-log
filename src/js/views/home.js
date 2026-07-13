import { getData, getDisplayStatus } from "../store.js";
import { renderBookCard, wireCoverFallbacks } from "./bookCard.js";
import { openBookDetail } from "./bookDetail.js";
import { CATEGORIES, computeCounts, buildDietComment } from "../kdc.js";
import { openDietChart } from "./dietChart.js";
import { openRecommend } from "./recommend.js";
import { openInterestMap } from "./interestMap.js";
import { thisMonthKey, todayStr, addDays } from "../dateUtils.js";

function renderBookListCard({ id, title, count, books, emptyText }) {
  return `
    <div class="card" style="margin-bottom:16px;">
      <div id="${id}-toggle" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;">
        <div>
          <div class="hint" style="margin:0;">${title}</div>
          <div class="serif" style="font-size:24px; margin-top:2px;">${count}권</div>
        </div>
        <span class="hint" id="${id}-toggle-label" style="margin:0;">${count === 0 ? "" : "더보기 ›"}</span>
      </div>
      <div id="${id}-list" hidden style="margin-top:14px;">
        ${count === 0 ? `<p class="hint" style="margin:0;">${emptyText}</p>` : books.map((b) => renderBookCard(b)).join("")}
      </div>
    </div>
  `;
}

function wireBookListCard(container, id, onChange) {
  const list = container.querySelector(`#${id}-list`);
  const toggle = container.querySelector(`#${id}-toggle`);
  const label = container.querySelector(`#${id}-toggle-label`);
  if (!toggle) return;
  toggle.addEventListener("click", () => {
    list.hidden = !list.hidden;
    if (label.textContent) label.textContent = list.hidden ? "더보기 ›" : "접기 ‹";
  });
}

export function renderHomeView(container) {
  const data = getData();
  const today = todayStr();
  const soonCutoff = addDays(today, 3);
  const weekCutoff = addDays(today, 7);

  const borrowedBooks = data.books
    .filter((b) => {
      const s = getDisplayStatus(b);
      return s === "borrowed" || s === "overdue";
    })
    .sort((a, b) => (a.dueAt || "").localeCompare(b.dueAt || ""));

  const dueTodayCount = borrowedBooks.filter((b) => b.dueAt === today).length;
  const dueSoonCount = borrowedBooks.filter((b) => b.dueAt > today && b.dueAt <= soonCutoff).length;

  const dueThisWeekBooks = borrowedBooks.filter((b) => b.dueAt && b.dueAt <= weekCutoff);
  const willBorrowBooks = data.books
    .filter((b) => getDisplayStatus(b) === "willBorrow")
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const monthKey = thisMonthKey();
  const thisMonthBooks = data.books.filter((b) => (b.borrowedAt || "").startsWith(monthKey));

  const dietCounts = computeCounts(thisMonthBooks);
  const dietTotal = thisMonthBooks.length;
  const dietComment = buildDietComment(dietCounts, dietTotal);
  const dietSegments = Object.entries(dietCounts).filter(([, c]) => c > 0);

  const hasAnyBooks = data.books.length > 0;

  container.innerHTML = `
    <h2 class="screen-title serif">홈</h2>

    <div class="card" style="margin-bottom:16px;">
      <div class="hint" style="margin:0;">오늘 우리 집 도서관 책</div>
      <div class="serif" style="font-size:19px; margin-top:6px; line-height:1.6;">
        대출중 ${borrowedBooks.length}권 · 오늘 반납 ${dueTodayCount}권 · 곧 반납 ${dueSoonCount}권
      </div>
    </div>

    ${renderBookListCard({
      id: "due-soon",
      title: "오늘/이번 주 반납할 책",
      count: dueThisWeekBooks.length,
      books: dueThisWeekBooks,
      emptyText: "이번 주 안에 반납할 책이 없어요.",
    })}

    ${renderBookListCard({
      id: "borrowed",
      title: "지금 대출중인 책",
      count: borrowedBooks.length,
      books: borrowedBooks,
      emptyText: "지금 대출중인 책이 없어요.",
    })}

    ${renderBookListCard({
      id: "will-borrow",
      title: "다음에 빌릴 책",
      count: willBorrowBooks.length,
      books: willBorrowBooks,
      emptyText: "다음에 빌릴 책을 담아보세요.",
    })}

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

    ${!hasAnyBooks ? `<div class="empty-state" style="margin-top:16px;">아직 도장이 하나도 없어요.<br />첫 번째 책을 기록해보세요.</div>` : ""}
  `;

  wireBookListCard(container, "due-soon");
  wireBookListCard(container, "borrowed");
  wireBookListCard(container, "will-borrow");

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

import { getData } from "../store.js";
import { escapeHtml } from "./bookCard.js";
import { openBookDetail } from "./bookDetail.js";
import { formatLocalDateFromTimestamp } from "../dateUtils.js";

function bookOf(bookId) {
  return getData().books.find((b) => b.id === bookId);
}

function memberOf(memberId) {
  return getData().members.find((m) => m.id === memberId);
}

export function renderUnderlineView(container) {
  const data = getData();
  const underlines = [...data.underlines].sort((a, b) => b.createdAt - a.createdAt);

  container.innerHTML = `
    <h2 class="screen-title serif">밑줄</h2>
    ${
      underlines.length === 0
        ? `<div class="empty-state">아직 모은 밑줄이 없어요.<br />책을 다 읽고 마음에 남은 한 문장을 적어보세요.</div>`
        : underlines
            .map((u) => {
              const book = bookOf(u.bookId);
              const member = memberOf(u.memberId);
              const date = formatLocalDateFromTimestamp(u.createdAt);
              return `
              <div class="card underline-card" data-book-id="${u.bookId || ""}" style="${book ? "cursor:pointer;" : ""}">
                <p class="underline-text" style="display:block;">${escapeHtml(u.text)}</p>
                <div class="underline-meta">
                  ${book ? escapeHtml(book.title) : ""}${book && member ? " · " : ""}${member ? escapeHtml(member.name) : ""}${(book || member) ? " · " : ""}${date}
                </div>
              </div>
            `;
            })
            .join("")
    }
  `;

  container.querySelectorAll("[data-book-id]").forEach((el) => {
    const bookId = el.dataset.bookId;
    if (!bookId) return;
    el.addEventListener("click", () => {
      openBookDetail(bookId, () => renderUnderlineView(container));
    });
  });
}

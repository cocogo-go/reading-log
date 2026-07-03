import { getData, getDisplayStatus } from "../store.js";
import { renderBookCard, statusLabel, escapeHtml } from "./bookCard.js";
import { openBookDetail } from "./bookDetail.js";

const STATUS_FILTERS = ["all", "willBorrow", "borrowed", "overdue", "returned"];

export function renderShelfView(container) {
  let memberFilter = "all";
  let statusFilter = "all";
  let search = "";

  const data = getData();

  container.innerHTML = `
    <h2 class="screen-title serif">책장</h2>
    <input type="text" class="input" id="shelf-search" placeholder="책 제목으로 검색" style="margin-bottom:14px;" />
    ${
      data.members.length > 0
        ? `<div class="filter-row" id="member-filter-row">
            <button type="button" class="filter-chip active" data-member="all">전체</button>
            ${data.members
              .map((m) => `<button type="button" class="filter-chip" data-member="${m.id}">${escapeHtml(m.name)}</button>`)
              .join("")}
          </div>`
        : ""
    }
    <div class="filter-row" id="status-filter-row">
      ${STATUS_FILTERS.map(
        (s) => `<button type="button" class="filter-chip ${s === "all" ? "active" : ""}" data-status="${s}">${s === "all" ? "전체" : statusLabel(s)}</button>`
      ).join("")}
    </div>
    <div id="book-list-slot"></div>
  `;

  const listSlot = container.querySelector("#book-list-slot");

  function renderList() {
    const fresh = getData();
    let books = fresh.books;
    if (memberFilter !== "all") books = books.filter((b) => b.memberId === memberFilter);
    if (statusFilter !== "all") books = books.filter((b) => getDisplayStatus(b) === statusFilter);
    if (search) books = books.filter((b) => b.title.toLowerCase().includes(search.toLowerCase()));
    books = [...books].sort((a, b) => b.createdAt - a.createdAt);

    listSlot.innerHTML =
      books.length === 0
        ? `<div class="empty-state">책장이 비어 있어요.<br />＋ 버튼을 눌러 첫 책을 등록해보세요.</div>`
        : books.map((b) => renderBookCard(b)).join("");

    listSlot.querySelectorAll("[data-book-id]").forEach((el) => {
      el.addEventListener("click", () => {
        openBookDetail(el.dataset.bookId, renderList);
      });
    });
  }

  container.querySelector("#shelf-search").addEventListener("input", (e) => {
    search = e.target.value.trim();
    renderList();
  });

  const memberRow = container.querySelector("#member-filter-row");
  if (memberRow) {
    memberRow.querySelectorAll("[data-member]").forEach((btn) => {
      btn.addEventListener("click", () => {
        memberFilter = btn.dataset.member;
        memberRow.querySelectorAll("[data-member]").forEach((b) => b.classList.toggle("active", b === btn));
        renderList();
      });
    });
  }

  const statusRow = container.querySelector("#status-filter-row");
  statusRow.querySelectorAll("[data-status]").forEach((btn) => {
    btn.addEventListener("click", () => {
      statusFilter = btn.dataset.status;
      statusRow.querySelectorAll("[data-status]").forEach((b) => b.classList.toggle("active", b === btn));
      renderList();
    });
  });

  renderList();
}

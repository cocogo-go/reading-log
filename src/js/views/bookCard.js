import { getDisplayStatus, dDay, getData } from "../store.js";

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

export function statusLabel(status) {
  return { willBorrow: "빌릴 책", borrowed: "대출중", returned: "반납완료", overdue: "반납지연" }[status] || status;
}

function statusStampClass(status) {
  if (status === "overdue") return "stamp stamp--out";
  if (status === "returned" || status === "willBorrow") return "stamp stamp--muted";
  return "stamp";
}

function memberOf(memberId) {
  return getData().members.find((m) => m.id === memberId);
}

function starRow(rating) {
  if (!rating) return "";
  return `<span style="color:var(--star);">${"★".repeat(rating)}${"☆".repeat(5 - rating)}</span>`;
}

function dueLine(book) {
  const status = getDisplayStatus(book);
  if (status !== "borrowed" && status !== "overdue") return "";
  const diff = dDay(book.dueAt);
  if (status === "overdue") {
    return `<span class="stamp stamp--out">반납 ${Math.abs(diff)}일 지남</span>`;
  }
  if (diff <= 3) {
    return `<span class="stamp">D${diff === 0 ? "-day" : diff}</span>`;
  }
  return `<span style="color:var(--muted); font-size:12px;">반납예정 ${book.dueAt}</span>`;
}

export function renderBookCard(book) {
  const status = getDisplayStatus(book);
  const member = memberOf(book.memberId);
  return `
    <div class="card book-card" data-book-id="${book.id}">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
        <div style="min-width:0;">
          <div class="serif" style="font-size:16px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(book.title)}</div>
          <div style="font-size:12px; color:var(--muted); margin-top:2px;">${escapeHtml(book.author || "")}${book.author && book.publisher ? " · " : ""}${escapeHtml(book.publisher || "")}</div>
        </div>
        <span class="${statusStampClass(status)}">${statusLabel(status)}</span>
      </div>
      <div style="display:flex; align-items:center; gap:10px; margin-top:10px; flex-wrap:wrap;">
        ${member ? `<span class="member-badge" style="background:${member.color}; width:20px; height:20px; font-size:11px;">${escapeHtml(member.name.slice(0, 1))}</span><span style="font-size:12px; color:var(--muted);">${escapeHtml(member.name)}</span>` : ""}
        ${dueLine(book)}
        ${starRow(book.rating)}
      </div>
    </div>
  `;
}

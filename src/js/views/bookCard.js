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

// 표지 폴백: 정보나루/구글 북스 이미지 → 초록 책등에 제목을 세로로 얹은 기본 표지.
// 이미지가 실제로 로드에 실패하는 경우까지 대비해 fallback 엘리먼트를 항상 같이 그려둔다.
export function renderCoverThumb(book, size = "sm") {
  const hasImage = !!book.coverUrl;
  return `
    <div class="book-cover book-cover--${size}" data-book-cover>
      ${hasImage ? `<img src="${escapeHtml(book.coverUrl)}" alt="" loading="lazy" />` : ""}
      <div class="book-cover-fallback" ${hasImage ? "hidden" : ""}>
        <span>${escapeHtml(book.title || "")}</span>
      </div>
    </div>
  `;
}

// renderCoverThumb으로 그린 표지들을 실제 DOM에 넣은 뒤 호출한다. 이미지 로드가
// 실패하면 그 자리에서 기본 표지로 바꿔준다.
export function wireCoverFallbacks(container) {
  container.querySelectorAll("[data-book-cover]").forEach((el) => {
    const img = el.querySelector("img");
    if (!img) return;
    img.addEventListener(
      "error",
      () => {
        img.remove();
        const fallback = el.querySelector(".book-cover-fallback");
        if (fallback) fallback.hidden = false;
      },
      { once: true }
    );
  });
}

export function renderBookCard(book) {
  const status = getDisplayStatus(book);
  const member = memberOf(book.memberId);
  return `
    <div class="card book-card" data-book-id="${book.id}">
      <div style="display:flex; gap:12px;">
        ${renderCoverThumb(book, "sm")}
        <div style="flex:1; min-width:0;">
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
      </div>
    </div>
  `;
}

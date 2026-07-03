import { getData, getBook, getDisplayStatus, markBorrowed, markReturned, reborrowBook, removeBook } from "../store.js";
import { escapeHtml, statusLabel } from "./bookCard.js";

let overlayEl = null;

function memberName(memberId) {
  return getData().members.find((m) => m.id === memberId)?.name || "";
}

export function openBookDetail(bookId, onChange) {
  closeDetail();
  overlayEl = document.createElement("div");
  overlayEl.className = "overlay";
  document.body.appendChild(overlayEl);
  render(bookId, onChange);
}

function closeDetail() {
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}

function render(bookId, onChange) {
  const book = getBook(bookId);
  if (!book) {
    closeDetail();
    return;
  }
  const status = getDisplayStatus(book);

  overlayEl.innerHTML = `
    <div class="overlay-header">
      <h2 class="serif" style="font-size:18px;">책 기록</h2>
      <button type="button" class="close-btn" id="detail-close">✕</button>
    </div>
    <div class="overlay-body">
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
          <div>
            <div class="serif" style="font-size:19px; font-weight:700;">${escapeHtml(book.title)}</div>
            <div class="hint" style="margin-top:4px;">${escapeHtml(book.author || "")}${book.author && book.publisher ? " · " : ""}${escapeHtml(book.publisher || "")}</div>
          </div>
          <span class="stamp ${status === "overdue" ? "stamp--out" : status === "returned" || status === "willBorrow" ? "stamp--muted" : ""}">${statusLabel(status)}</span>
        </div>

        <div style="margin-top:16px; font-size:14px; line-height:2;">
          <div>읽는 사람 · ${escapeHtml(memberName(book.memberId))}</div>
          ${book.libName ? `<div>도서관 · ${escapeHtml(book.libName)}</div>` : ""}
          ${book.borrowedAt ? `<div>빌린 날짜 · ${book.borrowedAt}</div>` : ""}
          ${book.dueAt ? `<div>반납 예정일 · ${book.dueAt}</div>` : ""}
          ${book.returnedAt ? `<div>반납한 날짜 · ${book.returnedAt}</div>` : ""}
          ${book.read !== null && book.status === "returned" ? `<div>완독 · ${book.read ? "다 읽었어요" : "못 읽었어요"}</div>` : ""}
          ${book.rating ? `<div>별점 · <span style="color:var(--star);">${"★".repeat(book.rating)}</span></div>` : ""}
        </div>

        ${book.memo ? `<div class="underline-text" style="margin-top:16px; display:block;">${escapeHtml(book.memo)}</div>` : ""}
      </div>

      <div id="action-area" style="margin-top:16px; display:flex; flex-direction:column; gap:10px;"></div>

      <button type="button" class="btn btn-secondary btn-block" id="delete-btn" style="margin-top:24px; color:var(--out); border-color:var(--out);">이 기록 삭제하기</button>
    </div>
  `;

  overlayEl.querySelector("#detail-close").addEventListener("click", () => {
    closeDetail();
  });

  const actionArea = overlayEl.querySelector("#action-area");

  if (status === "willBorrow") {
    actionArea.innerHTML = `<button type="button" class="btn btn-primary btn-block" id="mark-borrowed">대출 도장 찍기</button>`;
    actionArea.querySelector("#mark-borrowed").addEventListener("click", () => {
      markBorrowed(bookId);
      onChange?.();
      render(bookId, onChange);
    });
  } else if (status === "borrowed" || status === "overdue") {
    actionArea.innerHTML = `
      <button type="button" class="btn btn-primary btn-block" id="return-read">반납했어요 · 다 읽었어요</button>
      <button type="button" class="btn btn-secondary btn-block" id="return-unread">반납했어요 · 못 읽었어요</button>
    `;
    actionArea.querySelector("#return-read").addEventListener("click", () => {
      markReturned(bookId, true);
      onChange?.();
      render(bookId, onChange);
    });
    actionArea.querySelector("#return-unread").addEventListener("click", () => {
      markReturned(bookId, false);
      onChange?.();
      render(bookId, onChange);
    });
  } else if (status === "returned") {
    actionArea.innerHTML = `<button type="button" class="btn btn-primary btn-block" id="reborrow">또 빌렸어요</button>`;
    actionArea.querySelector("#reborrow").addEventListener("click", () => {
      reborrowBook(bookId);
      onChange?.();
      closeDetail();
    });
  }

  overlayEl.querySelector("#delete-btn").addEventListener("click", () => {
    if (confirm("이 기록을 삭제할까요?")) {
      removeBook(bookId);
      onChange?.();
      closeDetail();
    }
  });
}

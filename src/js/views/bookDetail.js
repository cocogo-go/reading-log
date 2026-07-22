import {
  getData,
  getBook,
  getDisplayStatus,
  markBorrowed,
  markReturned,
  reborrowBook,
  revertToWillBorrow,
  removeBook,
  setBookRating,
  setBookMemo,
  setManualCategory,
  updateBook,
  addBook,
} from "../store.js";
import { bookExist, usageAnalysisList, enrichKeywords, srchBooks, srchByIsbn } from "../api.js";
import { enrichBookMetadata } from "../googleBooksApi.js";
import { CATEGORIES, classifyBook } from "../kdc.js";
import { escapeHtml, statusLabel, renderCoverThumb, wireCoverFallbacks } from "./bookCard.js";
import { navigateToTab } from "../app.js";

const UNDERLINE_PROMPTS = [
  "아이가 어느 장면에서 웃었나요?",
  "읽고 나서 아이가 뭐라고 했나요?",
  "엄마 마음에 남은 한 문장은?",
  "다음에 또 빌리고 싶은 이유가 있다면?",
];

function randomPrompt() {
  return UNDERLINE_PROMPTS[Math.floor(Math.random() * UNDERLINE_PROMPTS.length)];
}

let overlayEl = null;
let pendingReturn = null; // { bookId, read }
let pendingBorrow = null; // { bookId }

function memberName(memberId) {
  return getData().members.find((m) => m.id === memberId)?.name || "";
}

export function openBookDetail(bookId, onChange) {
  closeDetail();
  pendingReturn = null;
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

function starPickerHtml(id, current) {
  return `
    <div class="star-picker" id="${id}">
      ${[1, 2, 3, 4, 5]
        .map((n) => `<button type="button" class="${n <= current ? "active" : ""}" data-star="${n}">★</button>`)
        .join("")}
    </div>
  `;
}

function wireStarPicker(container, id, onPick) {
  let value = 0;
  container.querySelectorAll(`#${id} button`).forEach((btn) => {
    if (btn.classList.contains("active")) value = Math.max(value, Number(btn.dataset.star));
  });
  container.querySelectorAll(`#${id} button`).forEach((btn) => {
    btn.addEventListener("click", () => {
      value = Number(btn.dataset.star);
      container.querySelectorAll(`#${id} button`).forEach((b) => b.classList.toggle("active", Number(b.dataset.star) <= value));
      onPick(value);
    });
  });
}

function render(bookId, onChange) {
  const book = getBook(bookId);
  if (!book) {
    closeDetail();
    return;
  }

  if (pendingReturn && pendingReturn.bookId === bookId) {
    renderReturnFlow(book, onChange);
    return;
  }

  if (pendingBorrow && pendingBorrow.bookId === bookId) {
    renderBorrowFlow(book, onChange);
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
        <div style="display:flex; gap:14px;">
          ${renderCoverThumb(book, "lg")}
          <div style="flex:1; min-width:0;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
              <div>
                <div class="serif" style="font-size:19px; font-weight:700;">${escapeHtml(book.title)}</div>
                <div class="hint" style="margin-top:4px;">${escapeHtml(book.author || "")}${book.author && book.publisher ? " · " : ""}${escapeHtml(book.publisher || "")}</div>
              </div>
              <span class="stamp ${status === "overdue" ? "stamp--out" : status === "returned" || status === "willBorrow" ? "stamp--muted" : ""}">${statusLabel(status)}</span>
            </div>
          </div>
        </div>

        <div style="margin-top:16px; font-size:14px; line-height:2;">
          <div>읽는 사람 · ${escapeHtml(memberName(book.memberId))}</div>
          ${book.libName ? `<div>도서관 · ${escapeHtml(book.libName)}</div>` : ""}
          ${book.borrowedAt ? `<div>빌린 날짜 · ${book.borrowedAt}</div>` : ""}
          ${book.dueAt ? `<div>반납 예정일 · ${book.dueAt}</div>` : ""}
          ${book.returnedAt ? `<div>반납한 날짜 · ${book.returnedAt}</div>` : ""}
          ${book.read !== null && book.status === "returned" ? `<div>완독 · ${book.read ? "다 읽었어요" : "못 읽었어요"}</div>` : ""}
        </div>

        ${(() => {
          const autoKey = classifyBook({ ...book, manualCategory: null });
          const categoryOptions = Object.keys(CATEGORIES)
            .filter((k) => k !== "etc")
            .concat("etc");
          return `
            <div style="margin-top:14px;">
              <span class="field-label" style="margin-bottom:6px; display:block;">식단표 분류</span>
              <select class="input" id="manual-category-select">
                <option value="">자동 분류 (지금은 ${escapeHtml(CATEGORIES[autoKey].label)})</option>
                ${categoryOptions
                  .map(
                    (key) =>
                      `<option value="${key}" ${book.manualCategory === key ? "selected" : ""}>${escapeHtml(CATEGORIES[key].label)}</option>`
                  )
                  .join("")}
              </select>
              <p class="hint" style="margin-top:6px;">${book.manualCategory ? "직접 지정한 분류예요. 자동 조회가 이 값을 덮어쓰지 않아요." : "자동으로 분류돼요. 다르면 여기서 직접 골라주세요."}</p>
            </div>
          `;
        })()}
      </div>

      ${
        !book.isbn13
          ? `<div class="card" style="margin-top:16px;">
              <h3 style="font-size:14px; margin-bottom:10px;">책 정보 연결하기</h3>
              <p class="hint" style="margin:0 0 10px;">정보나루에서 이 책을 찾아 연결하면 표지·대출가능여부·분류가 자동으로 채워져요. 제목이나 ISBN으로 검색할 수 있어요.</p>
              <div class="row">
                <input type="text" class="input" id="link-title-input" placeholder="제목 또는 ISBN" value="${escapeHtml(book.title)}" />
                <button type="button" class="btn btn-secondary" id="link-search-btn">검색</button>
              </div>
              <p class="hint" id="link-status" style="margin-top:8px;"></p>
              <div id="link-results" style="margin-top:8px;"></div>
            </div>`
          : ""
      }

      ${
        status === "willBorrow"
          ? `<div class="card" style="margin-top:16px;">
              <h3 style="font-size:14px; margin-bottom:10px;">도서관 대출 가능 여부</h3>
              <div id="avail-slot"><p class="hint" style="margin:0;">확인 중이에요...</p></div>
            </div>`
          : ""
      }

      ${
        book.isbn13
          ? `<div class="card" style="margin-top:16px;">
              <h3 style="font-size:14px; margin-bottom:10px;">함께 대출된 도서</h3>
              <div id="coloan-slot"><p class="hint" style="margin:0;">불러오는 중이에요...</p></div>
            </div>`
          : ""
      }

      <div class="card" style="margin-top:16px;">
        <h3 style="font-size:14px; margin-bottom:10px;">별점 · 밑줄</h3>
        ${starPickerHtml("edit-star-picker", book.rating || 0)}
        <textarea class="input" id="edit-memo-input" rows="3" style="margin-top:12px;" placeholder="${escapeHtml(randomPrompt())}">${escapeHtml(book.memo || "")}</textarea>
        <button type="button" class="btn btn-secondary btn-block" id="edit-save-btn" style="margin-top:10px;">저장하기</button>
      </div>

      <div id="action-area" style="margin-top:16px; display:flex; flex-direction:column; gap:10px;"></div>

      <button type="button" class="btn btn-secondary btn-block" id="delete-btn" style="margin-top:24px; color:var(--out); border-color:var(--out);">이 기록 삭제하기</button>
    </div>
  `;

  overlayEl.querySelector("#detail-close").addEventListener("click", () => {
    closeDetail();
  });
  wireCoverFallbacks(overlayEl);

  if (!book.isbn13) {
    wireLinkSearch(book, onChange);
  }

  overlayEl.querySelector("#manual-category-select").addEventListener("change", (e) => {
    setManualCategory(bookId, e.target.value);
    onChange?.();
    render(bookId, onChange);
  });

  if (status === "willBorrow") {
    loadAvailability(book);
  }

  if (book.isbn13) {
    loadCoLoanBooks(book, onChange);
  }

  let editRating = book.rating || 0;
  wireStarPicker(overlayEl, "edit-star-picker", (v) => (editRating = v));
  overlayEl.querySelector("#edit-save-btn").addEventListener("click", () => {
    setBookRating(bookId, editRating);
    setBookMemo(bookId, overlayEl.querySelector("#edit-memo-input").value);
    onChange?.();
    render(bookId, onChange);
  });

  const actionArea = overlayEl.querySelector("#action-area");

  if (status === "willBorrow") {
    actionArea.innerHTML = `<button type="button" class="btn btn-primary btn-block" id="mark-borrowed">대출 도장 찍기</button>`;
    actionArea.querySelector("#mark-borrowed").addEventListener("click", () => {
      pendingBorrow = { bookId };
      render(bookId, onChange);
    });
  } else if (status === "borrowed" || status === "overdue") {
    actionArea.innerHTML = `
      <button type="button" class="btn btn-primary btn-block" id="return-read">반납했어요 · 다 읽었어요</button>
      <button type="button" class="btn btn-secondary btn-block" id="return-unread">반납했어요 · 못 읽었어요</button>
      <button type="button" class="hint" id="revert-willborrow" style="text-decoration:underline; background:none; align-self:center;">실수로 등록했어요 · 빌릴 책으로 되돌리기</button>
    `;
    actionArea.querySelector("#return-read").addEventListener("click", () => {
      pendingReturn = { bookId, read: true };
      render(bookId, onChange);
    });
    actionArea.querySelector("#return-unread").addEventListener("click", () => {
      pendingReturn = { bookId, read: false };
      render(bookId, onChange);
    });
    actionArea.querySelector("#revert-willborrow").addEventListener("click", () => {
      if (!confirm("빌린 날짜와 반납 예정일을 지우고 '빌릴 책'으로 되돌릴까요?")) return;
      revertToWillBorrow(bookId);
      onChange?.();
      render(bookId, onChange);
    });
  } else if (status === "returned") {
    actionArea.innerHTML = `<button type="button" class="btn btn-primary btn-block" id="reborrow">또 빌렸어요</button>`;
    actionArea.querySelector("#reborrow").addEventListener("click", () => {
      const newBook = reborrowBook(bookId);
      enrichKeywords(book.isbn13);
      if (newBook) enrichBookMetadata(newBook);
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

function renderReturnFlow(book, onChange) {
  const bookId = book.id;
  overlayEl.innerHTML = `
    <div class="overlay-header">
      <h2 class="serif" style="font-size:18px;">반납했어요</h2>
      <button type="button" class="close-btn" id="detail-close">✕</button>
    </div>
    <div class="overlay-body">
      <div class="card">
        <div class="serif" style="font-size:17px; font-weight:700;">${escapeHtml(book.title)}</div>
        <p class="hint" style="margin:10px 0 0;">별점과 밑줄은 지금 남겨도 되고, 책장에서 나중에 채워도 돼요.</p>
      </div>

      <div class="field-group" style="margin-top:16px;">
        <span class="field-label">별점</span>
        ${starPickerHtml("return-star-picker", 0)}
      </div>
      <div class="field-group">
        <span class="field-label">밑줄 메모 (선택)</span>
        <textarea class="input" id="return-memo-input" rows="3" placeholder="${escapeHtml(randomPrompt())}"></textarea>
      </div>

      <button type="button" class="btn btn-primary btn-block" id="return-save">저장하고 마치기</button>
      <button type="button" class="btn btn-secondary btn-block" id="return-skip" style="margin-top:10px;">건너뛰기</button>
    </div>
  `;

  overlayEl.querySelector("#detail-close").addEventListener("click", closeDetail);

  let rating = 0;
  wireStarPicker(overlayEl, "return-star-picker", (v) => (rating = v));

  function finish() {
    const read = pendingReturn.read;
    pendingReturn = null;
    markReturned(bookId, read);
    onChange?.();
    render(bookId, onChange);
  }

  overlayEl.querySelector("#return-save").addEventListener("click", () => {
    if (rating) setBookRating(bookId, rating);
    const memo = overlayEl.querySelector("#return-memo-input").value;
    if (memo.trim()) setBookMemo(bookId, memo);
    finish();
  });
  overlayEl.querySelector("#return-skip").addEventListener("click", finish);
}

function renderBorrowFlow(book, onChange) {
  const bookId = book.id;
  const libraries = getData().libraries;

  overlayEl.innerHTML = `
    <div class="overlay-header">
      <h2 class="serif" style="font-size:18px;">대출 도장 찍기</h2>
      <button type="button" class="close-btn" id="detail-close">✕</button>
    </div>
    <div class="overlay-body">
      <div class="card">
        <div class="serif" style="font-size:17px; font-weight:700;">${escapeHtml(book.title)}</div>
        <p class="hint" style="margin:10px 0 0;">담아둘 때와 다른 도서관에서 빌렸다면 여기서 바꿔주세요.</p>
      </div>

      <div class="field-group" style="margin-top:16px;">
        <span class="field-label">어느 도서관에서 빌렸나요?</span>
        <select class="input" id="borrow-lib-select">
          <option value="">선택 안 함</option>
          ${libraries.map((l) => `<option value="${l.libCode}" ${l.libCode === book.libCode ? "selected" : ""}>${escapeHtml(l.libName)}</option>`).join("")}
        </select>
      </div>

      <button type="button" class="btn btn-primary btn-block" id="borrow-confirm">대출 도장 찍기</button>
      <button type="button" class="btn btn-secondary btn-block" id="borrow-cancel" style="margin-top:10px;">취소</button>
    </div>
  `;

  overlayEl.querySelector("#detail-close").addEventListener("click", closeDetail);

  function cancel() {
    pendingBorrow = null;
    render(bookId, onChange);
  }

  overlayEl.querySelector("#borrow-confirm").addEventListener("click", () => {
    const libCode = overlayEl.querySelector("#borrow-lib-select").value;
    const library = libraries.find((l) => l.libCode === libCode);
    pendingBorrow = null;
    markBorrowed(bookId, { libCode, libName: library?.libName || "" });
    onChange?.();
    render(bookId, onChange);
  });
  overlayEl.querySelector("#borrow-cancel").addEventListener("click", cancel);
}

const ISBN13_RE = /^97[89]\d{10}$/;

function wireLinkSearch(book, onChange) {
  const titleInput = overlayEl.querySelector("#link-title-input");
  const searchBtn = overlayEl.querySelector("#link-search-btn");
  const statusEl = overlayEl.querySelector("#link-status");
  const resultsEl = overlayEl.querySelector("#link-results");
  if (!titleInput || !searchBtn) return;

  searchBtn.addEventListener("click", async () => {
    const keyword = titleInput.value.trim();
    if (!keyword) return;
    statusEl.textContent = "검색 중이에요...";
    resultsEl.innerHTML = "";
    searchBtn.disabled = true;
    try {
      const isbnDigits = keyword.replace(/[^\d]/g, "");
      let results;
      if (ISBN13_RE.test(isbnDigits)) {
        const found = await srchByIsbn(isbnDigits);
        results = found ? [found] : [];
      } else {
        results = await srchBooks(keyword, 30);
      }
      if (!overlayEl) return;
      if (results.length === 0) {
        statusEl.textContent = "찾지 못했어요. 다른 검색어로 시도해보세요.";
        return;
      }
      statusEl.textContent = `${results.length}건 찾았어요.`;
      resultsEl.innerHTML = results
        .map(
          (b, i) => `
        <div class="lib-item">
          <div style="display:flex; gap:10px; min-width:0;">
            ${renderCoverThumb({ title: b.bookname, coverUrl: b.bookImageURL }, "sm")}
            <div style="min-width:0;">
              <div class="lib-name">${escapeHtml(b.bookname)}</div>
              <div class="lib-address">${escapeHtml(b.authors || "")}${b.authors && b.publisher ? " · " : ""}${escapeHtml(b.publisher || "")}</div>
            </div>
          </div>
          <button type="button" class="btn btn-secondary" data-link-idx="${i}" style="flex-shrink:0;">연결</button>
        </div>
      `
        )
        .join("");
      wireCoverFallbacks(resultsEl);
      resultsEl.querySelectorAll("[data-link-idx]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const b = results[Number(btn.dataset.linkIdx)];
          updateBook(book.id, {
            isbn13: b.isbn13 || "",
            author: book.author || b.authors || "",
            publisher: book.publisher || b.publisher || "",
            kdc: b.class_no || "",
            coverUrl: book.coverUrl || b.bookImageURL || "",
          });
          enrichKeywords(b.isbn13);
          onChange?.();
          render(book.id, onChange);
        });
      });
    } catch (err) {
      statusEl.textContent = `검색에 실패했어요: ${err.message}`;
    } finally {
      searchBtn.disabled = false;
    }
  });
}

async function loadAvailability(book) {
  const slot = overlayEl?.querySelector("#avail-slot");
  if (!slot) return;
  const libraries = getData().libraries;

  if (!book.isbn13) {
    slot.innerHTML = `<p class="hint" style="margin:0;">바코드 스캔이나 자동완성으로 등록하면 대출 가능 여부를 확인할 수 있어요.</p>`;
    return;
  }
  if (libraries.length === 0) {
    slot.innerHTML = `
      <p class="hint" style="margin:0 0 10px;">도서관을 등록하면 이 책을 지금 빌릴 수 있는지 바로 확인할 수 있어요.</p>
      <button type="button" class="btn btn-secondary" id="goto-lib-settings">나의 도서관 등록하러 가기</button>
    `;
    slot.querySelector("#goto-lib-settings").addEventListener("click", () => {
      closeDetail();
      navigateToTab("settings");
    });
    return;
  }

  try {
    const results = await Promise.all(
      libraries.map(async (lib) => ({ lib, status: await bookExist(book.isbn13, lib.libCode) }))
    );
    if (!overlayEl || !overlayEl.contains(slot)) return; // 그 사이 화면이 바뀌었으면 반영하지 않는다
    slot.innerHTML = results
      .map(({ lib, status }, i) => {
        const icon = status === "available" ? "🟢" : status === "unavailable" ? "🔴" : "⚪";
        const label = status === "available" ? "대출가능" : status === "unavailable" ? "대출중" : "미소장";
        const shelfHint = status !== "notFound" && book.kdc ? `<span class="hint" style="margin:0;">${escapeHtml(book.kdc)} 서가</span>` : "";
        const callNoBtn =
          lib.searchUrlPattern && status !== "notFound"
            ? `<button type="button" class="btn btn-secondary" data-callno="${i}" style="margin-top:6px;">청구기호 확인</button>`
            : "";
        return `
          <div class="lib-item" style="align-items:flex-start;">
            <div>
              <div class="lib-name">${icon} ${escapeHtml(lib.libName)}</div>
              ${shelfHint}
            </div>
            <div style="text-align:right;">
              <span class="hint" style="margin:0;">${label}</span>
              ${callNoBtn}
            </div>
          </div>
        `;
      })
      .join("") + `<p class="hint" style="margin:10px 0 0;">대출가능/대출중 표시는 전날 기준이라 오늘 상황과 다를 수 있어요. 확실히 하려면 청구기호 확인으로 도서관 사이트를 열어보세요.</p>`;
    slot.querySelectorAll("[data-callno]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const { lib } = results[Number(btn.dataset.callno)];
        const url = lib.searchUrlPattern.replace("{query}", encodeURIComponent(book.title));
        window.open(url, "_blank", "noopener");
      });
    });
  } catch (err) {
    if (overlayEl && overlayEl.contains(slot)) {
      slot.innerHTML = `<p class="hint" style="margin:0;">${escapeHtml(err.message || "대출 가능 여부를 불러오지 못했어요.")}</p>`;
    }
  }
}

async function loadCoLoanBooks(book, onChange) {
  const slot = overlayEl?.querySelector("#coloan-slot");
  if (!slot) return;

  try {
    const books = await usageAnalysisList(book.isbn13);
    if (!overlayEl || !overlayEl.contains(slot)) return;
    if (books.length === 0) {
      slot.innerHTML = `<p class="hint" style="margin:0;">함께 대출된 도서 정보가 없어요.</p>`;
      return;
    }
    slot.innerHTML = books
      .slice(0, 8)
      .map(
        (b, i) => `
      <div class="lib-item">
        <div style="display:flex; gap:10px; min-width:0;">
          ${renderCoverThumb({ title: b.bookname, coverUrl: b.bookImageURL }, "sm")}
          <div style="min-width:0;">
            <div class="lib-name">${escapeHtml(b.bookname)}</div>
            <div class="lib-address">${escapeHtml(b.authors || "")}${b.authors && b.publisher ? " · " : ""}${escapeHtml(b.publisher || "")}</div>
          </div>
        </div>
        <button type="button" class="btn btn-secondary" data-coloan-add="${i}" style="flex-shrink:0;">담기</button>
      </div>
    `
      )
      .join("");
    wireCoverFallbacks(slot);
    slot.querySelectorAll("[data-coloan-add]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const b = books[Number(btn.dataset.coloanAdd)];
        const newBook = addBook({
          memberId: book.memberId,
          isbn13: b.isbn13 || "",
          title: b.bookname,
          author: b.authors || "",
          publisher: b.publisher || "",
          coverUrl: b.bookImageURL || "",
          status: "willBorrow",
        });
        enrichKeywords(b.isbn13);
        enrichBookMetadata(newBook);
        onChange?.();
        btn.textContent = "담았어요";
        btn.disabled = true;
      });
    });
  } catch (err) {
    if (overlayEl && overlayEl.contains(slot)) {
      slot.innerHTML = `<p class="hint" style="margin:0;">${escapeHtml(err.message || "함께 대출된 도서를 불러오지 못했어요.")}</p>`;
    }
  }
}

import { getData, addBook, borrowCount, getAuthKey, updateBook } from "../store.js";
import { srchBooks, srchByIsbn, enrichKeywords } from "../api.js";
import { escapeHtml } from "./bookCard.js";
import { enrichForeignCategory } from "../googleBooksApi.js";
import { todayStr, addDays } from "../dateUtils.js";

const ZXING_CDN_URL = "https://esm.sh/@zxing/browser@0.1.5";
const ISBN13_RE = /^97[89]\d{10}$/;

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

let overlayEl = null;
let scanControls = null;

export function openAddFlow(onSaved) {
  closeOverlay();
  overlayEl = document.createElement("div");
  overlayEl.className = "overlay";
  document.body.appendChild(overlayEl);
  renderChoiceScreen(onSaved);
}

function closeOverlay() {
  stopScan();
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
}

function stopScan() {
  scanControls?.stop();
  scanControls = null;
}

function renderChoiceScreen(onSaved) {
  overlayEl.innerHTML = `
    <div class="overlay-header">
      <h2 class="serif" style="font-size:18px;">기록 추가</h2>
      <button type="button" class="close-btn" id="add-close">✕</button>
    </div>
    <div class="overlay-body">
      <button type="button" class="choice-btn" id="choice-barcode">
        <span class="choice-icon">📷</span>
        <span>바코드 스캔<br /><span style="font-size:12px; color:var(--muted);">책 뒤표지의 ISBN 바코드를 비춰주세요</span></span>
      </button>
      <button type="button" class="choice-btn" id="choice-manual">
        <span class="choice-icon">✏️</span>
        <span>직접 입력</span>
      </button>
    </div>
  `;
  overlayEl.querySelector("#add-close").addEventListener("click", closeOverlay);
  overlayEl.querySelector("#choice-barcode").addEventListener("click", () => renderScanScreen(onSaved));
  overlayEl.querySelector("#choice-manual").addEventListener("click", () => renderManualForm(onSaved));
}

async function renderScanScreen(onSaved) {
  overlayEl.innerHTML = `
    <div class="overlay-header">
      <h2 class="serif" style="font-size:18px;">바코드 스캔</h2>
      <button type="button" class="close-btn" id="add-close">✕</button>
    </div>
    <div class="overlay-body" style="padding:0; display:flex; flex-direction:column;">
      <div style="position:relative; background:#111; aspect-ratio:3/4; overflow:hidden;">
        <video id="scan-video" style="width:100%; height:100%; object-fit:cover;" muted playsinline></video>
        <div style="position:absolute; inset:16px; border:2px solid var(--paper); border-radius:12px; pointer-events:none; opacity:0.7;"></div>
      </div>
      <div style="padding:16px;">
        <p class="hint" id="scan-status" style="text-align:center;">책 뒤표지의 바코드를 사각형 안에 비춰주세요.</p>
        <button type="button" class="btn btn-secondary btn-block" id="scan-fallback">대신 직접 입력할게요</button>
      </div>
    </div>
  `;

  overlayEl.querySelector("#add-close").addEventListener("click", closeOverlay);
  overlayEl.querySelector("#scan-fallback").addEventListener("click", () => {
    stopScan();
    renderManualForm(onSaved);
  });

  const statusEl = overlayEl.querySelector("#scan-status");
  const videoEl = overlayEl.querySelector("#scan-video");
  let handledOnce = false;

  try {
    const { BrowserMultiFormatReader } = await import(ZXING_CDN_URL);
    const reader = new BrowserMultiFormatReader();
    scanControls = await reader.decodeFromConstraints(
      { video: { facingMode: "environment" } },
      videoEl,
      (result) => {
        if (handledOnce || !result) return;
        const text = result.getText();
        if (!ISBN13_RE.test(text)) return; // 책 ISBN 바코드(978/979)가 아니면 계속 스캔
        handledOnce = true;
        stopScan();
        handleScanned(text, onSaved);
      }
    );
  } catch (err) {
    statusEl.textContent = "카메라를 사용할 수 없어요. 아래 버튼으로 직접 입력해주세요.";
  }
}

async function handleScanned(isbn13, onSaved) {
  if (!overlayEl) return;
  overlayEl.querySelector(".overlay-body").innerHTML = `
    <div style="padding:40px 16px; text-align:center;">
      <p class="hint">책 정보를 불러오는 중이에요...</p>
    </div>
  `;
  let book = null;
  if (getAuthKey()) {
    try {
      book = await srchByIsbn(isbn13);
    } catch {
      book = null;
    }
  }
  renderManualForm(onSaved, book || { isbn13 });
}

// 등록 후 백그라운드에서 분류 정보를 보강한다 (10초 등록 원칙을 지키기 위해 등록을 막지 않음)
function enrichAfterSave(book) {
  if (!book.isbn13 || book.kdc) return; // 국내 KDC가 이미 있으면 건드리지 않는다
  enrichForeignCategory(book.isbn13).then((foreignCategory) => {
    if (foreignCategory) updateBook(book.id, { foreignCategory });
  });
}

function renderManualForm(onSaved, prefill = null) {
  const data = getData();
  const members = data.members;
  const libraries = data.libraries;

  let selectedBook = null; // { isbn13, title, author, publisher, kdc }
  let manualEntry = false;
  let status = "borrowed"; // "borrowed" | "willBorrow"
  // 바코드는 스캔했지만 정보나루 조회에 실패했을 때도 isbn13은 끝까지 들고 간다
  const scannedIsbn13 = prefill?.isbn13 && !prefill?.bookname ? prefill.isbn13 : null;

  overlayEl.innerHTML = `
    <div class="overlay-header">
      <h2 class="serif" style="font-size:18px;">직접 입력</h2>
      <button type="button" class="close-btn" id="add-close">✕</button>
    </div>
    <div class="overlay-body">
      ${
        members.length === 0
          ? `<div class="card">
              <p class="hint" style="margin:0;">먼저 설정에서 가족 구성원을 한 명 이상 등록해주세요.</p>
            </div>`
          : `<form id="book-form">
            <div class="field-group">
              <span class="field-label">언제부터 함께할까요?</span>
              <div class="status-toggle">
                <button type="button" class="active" data-status="borrowed">지금 빌렸어요</button>
                <button type="button" data-status="willBorrow">빌릴 계획이에요</button>
              </div>
            </div>

            <div class="field-group">
              <span class="field-label">책 제목</span>
              <input type="text" class="input" id="title-input" placeholder="제목을 입력해보세요" autocomplete="off" required />
              <div class="autocomplete-list" id="ac-list" hidden></div>
              <div class="selected-book" id="selected-book" hidden></div>
              <div id="dup-notice"></div>
              <button type="button" id="manual-toggle" class="hint" style="text-decoration:underline; margin-top:8px; background:none;">저자/출판사 직접 입력할래요</button>
              <div id="manual-fields" class="manual-fields" hidden>
                <input type="text" class="input" id="author-input" placeholder="지은이 (선택)" />
                <input type="text" class="input" id="publisher-input" placeholder="출판사 (선택)" />
              </div>
            </div>

            <div class="field-group">
              <span class="field-label">읽는 사람</span>
              <select class="input" id="member-select">
                ${members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("")}
              </select>
            </div>

            <div class="field-group">
              <span class="field-label">도서관 (선택)</span>
              <select class="input" id="library-select">
                <option value="">선택 안 함</option>
                ${libraries.map((l) => `<option value="${l.libCode}">${escapeHtml(l.libName)}</option>`).join("")}
              </select>
            </div>

            <div class="field-group" id="date-fields">
              <div class="row">
                <div style="flex:1;">
                  <span class="field-label">빌린 날짜</span>
                  <input type="date" class="input" id="borrowed-at-input" value="${todayStr()}" />
                </div>
                <div style="flex:1;">
                  <span class="field-label">반납 예정일</span>
                  <input type="date" class="input" id="due-at-input" value="${addDays(todayStr(), 14)}" />
                </div>
              </div>
            </div>

            <button type="submit" class="btn btn-primary btn-block" id="submit-btn">대출 도장 찍기</button>
          </form>`
      }
    </div>
  `;

  overlayEl.querySelector("#add-close").addEventListener("click", closeOverlay);
  if (members.length === 0) return;

  const form = overlayEl.querySelector("#book-form");
  const titleInput = overlayEl.querySelector("#title-input");
  const acList = overlayEl.querySelector("#ac-list");
  const selectedBookEl = overlayEl.querySelector("#selected-book");
  const dupNotice = overlayEl.querySelector("#dup-notice");
  const manualToggle = overlayEl.querySelector("#manual-toggle");
  const manualFields = overlayEl.querySelector("#manual-fields");
  const dateFields = overlayEl.querySelector("#date-fields");
  const submitBtn = overlayEl.querySelector("#submit-btn");
  const borrowedAtInput = overlayEl.querySelector("#borrowed-at-input");
  const dueAtInput = overlayEl.querySelector("#due-at-input");

  overlayEl.querySelectorAll(".status-toggle button").forEach((btn) => {
    btn.addEventListener("click", () => {
      status = btn.dataset.status;
      overlayEl.querySelectorAll(".status-toggle button").forEach((b) => b.classList.toggle("active", b === btn));
      dateFields.hidden = status === "willBorrow";
      submitBtn.textContent = status === "willBorrow" ? "빌릴 책으로 담아두기" : "대출 도장 찍기";
    });
  });

  // 빌린 날짜가 바뀌면 반납 예정일을 +14일로 다시 계산한다 (그 다음에 직접 수정도 가능)
  borrowedAtInput.addEventListener("change", () => {
    if (borrowedAtInput.value) {
      dueAtInput.value = addDays(borrowedAtInput.value, 14);
    }
  });

  manualToggle.addEventListener("click", () => {
    manualEntry = !manualEntry;
    manualFields.hidden = !manualEntry;
    manualToggle.textContent = manualEntry ? "자동완성으로 검색할래요" : "저자/출판사 직접 입력할래요";
  });

  function clearSelection() {
    selectedBook = null;
    selectedBookEl.hidden = true;
    dupNotice.innerHTML = "";
  }

  function showDupNotice(isbn13, extraMessage = "") {
    const count = borrowCount(isbn13);
    const parts = [];
    if (extraMessage) parts.push(`<div class="hint" style="margin-top:6px;">${extraMessage}</div>`);
    if (count > 0) parts.push(`<div class="hint" style="color:var(--stamp); margin-top:6px;">이미 ${count}번 빌린 책이에요!</div>`);
    dupNotice.innerHTML = parts.join("");
  }

  function pickBook(book) {
    selectedBook = {
      isbn13: book.isbn13 || "",
      title: book.bookname || book.title || titleInput.value,
      author: book.authors || "",
      publisher: book.publisher || "",
      kdc: book.class_no || "",
    };
    titleInput.value = selectedBook.title;
    acList.hidden = true;
    acList.innerHTML = "";
    selectedBookEl.hidden = false;
    selectedBookEl.innerHTML = `
      <div>
        <div style="font-weight:500; font-size:14px;">${escapeHtml(selectedBook.title)}</div>
        <div class="hint" style="margin:0;">${escapeHtml(selectedBook.author)}${selectedBook.author && selectedBook.publisher ? " · " : ""}${escapeHtml(selectedBook.publisher)}</div>
      </div>
      <button type="button" class="btn btn-secondary" id="clear-selected">다시 검색</button>
    `;
    selectedBookEl.querySelector("#clear-selected").addEventListener("click", () => {
      clearSelection();
      titleInput.value = "";
      titleInput.focus();
    });
    if (selectedBook.isbn13) showDupNotice(selectedBook.isbn13);
  }

  if (prefill?.bookname) {
    pickBook(prefill);
  } else if (scannedIsbn13) {
    showDupNotice(scannedIsbn13, `스캔했어요 (ISBN ${escapeHtml(scannedIsbn13)}) · 정보를 못 찾아서 제목을 입력해주세요`);
  }

  const runSearch = debounce(async (keyword) => {
    if (!keyword || keyword.length < 2) {
      acList.hidden = true;
      acList.innerHTML = "";
      return;
    }
    if (!getAuthKey()) return;
    try {
      const results = await srchBooks(keyword);
      if (results.length === 0) {
        acList.hidden = true;
        acList.innerHTML = "";
        return;
      }
      acList.innerHTML = results
        .slice(0, 8)
        .map(
          (b, i) => `
        <button type="button" class="autocomplete-item" data-idx="${i}">
          <div class="ac-title">${escapeHtml(b.bookname)}</div>
          <div class="ac-meta">${escapeHtml(b.authors || "")}${b.authors && b.publisher ? " · " : ""}${escapeHtml(b.publisher || "")}</div>
        </button>
      `
        )
        .join("");
      acList.hidden = false;
      acList.querySelectorAll("[data-idx]").forEach((btn) => {
        btn.addEventListener("click", () => pickBook(results[Number(btn.dataset.idx)]));
      });
    } catch {
      acList.hidden = true;
      acList.innerHTML = "";
    }
  }, 400);

  titleInput.addEventListener("input", () => {
    clearSelection();
    runSearch(titleInput.value.trim());
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) return;

    const memberId = overlayEl.querySelector("#member-select").value;
    const libCode = overlayEl.querySelector("#library-select").value;
    const library = libraries.find((l) => l.libCode === libCode);

    const book = addBook({
      memberId,
      isbn13: selectedBook?.isbn13 || scannedIsbn13 || "",
      title,
      author: selectedBook?.author || overlayEl.querySelector("#author-input")?.value.trim() || "",
      publisher: selectedBook?.publisher || overlayEl.querySelector("#publisher-input")?.value.trim() || "",
      kdc: selectedBook?.kdc || "",
      libCode,
      libName: library?.libName || "",
      status,
      borrowedAt: borrowedAtInput?.value,
      dueAt: dueAtInput?.value,
    });

    closeOverlay();
    onSaved?.(book);
    enrichAfterSave(book);
    enrichKeywords(book.isbn13);
  });
}

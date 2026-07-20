import { getData, addBook, addMember, borrowCount } from "../store.js";
import { srchBooks, srchByIsbn, enrichKeywords } from "../api.js";
import { escapeHtml } from "./bookCard.js";
import { enrichBookMetadata } from "../googleBooksApi.js";
import { todayStr, addDays } from "../dateUtils.js";

const ZXING_CDN_URL = "https://esm.sh/@zxing/browser@0.1.5";
const TESSERACT_CDN_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js";
const ISBN13_RE = /^97[89]\d{10}$/;
// 도서관/서점 페이지 캡처 속 "ISBN 9791194534426" 같은 표기에서 13자리 ISBN을 찾는다.
// 하이픈/공백이 섞여 있어도(979-11-94534-42-6) 인식하도록 넉넉하게 잡고 숫자만 남긴다.
const ISBN_IN_TEXT_RE = /97[89][\d\-\s]{10,17}/;

function extractIsbn13(text) {
  const match = text.match(ISBN_IN_TEXT_RE);
  if (!match) return null;
  const digits = match[0].replace(/[^\d]/g, "");
  return digits.length === 13 ? digits : null;
}

// 글자 길이만으로 제목을 추정하면 "< 이전목록으로  관심자료보기" 같은 메뉴/버튼
// 텍스트를 잘못 고를 수 있다. 책 제목은 실제로 큰 글씨로 나오는 경우가 대부분이라,
// OCR이 알려주는 줄별 높이(bbox)를 이용해 "가장 큰 글씨의 줄"을 제목으로 추정한다.
const OCR_META_LINE_RE = /^(ISBN|저자|출판|발행|형태|분류|표준번호|자료유형|소장|마크|isbn)/i;

function guessTitleFromLines(lines) {
  const candidates = (lines || [])
    .map((l) => ({ text: l.text.trim(), height: l.bbox.y1 - l.bbox.y0, confidence: l.confidence }))
    .filter(
      ({ text, confidence }) =>
        text.length >= 6 && // 너무 짧으면 그림/아이콘을 잘못 읽은 파편일 가능성이 크다
        confidence >= 60 && // 신뢰도가 낮으면 표지 그림 등을 오인식했을 가능성이 크다
        /[가-힣]/.test(text) &&
        !OCR_META_LINE_RE.test(text)
    );
  if (candidates.length === 0) return "";
  return candidates.reduce((tallest, line) => (line.height > tallest.height ? line : tallest)).text;
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// 같은 책이 여러 판/쇄로 검색결과에 중복으로 잡히는 경우가 있어 ISBN13 기준으로 정리한다.
// ISBN이 없는 항목은 서로 다른 책일 수 있으니 그대로 둔다.
function dedupeByIsbn13(books) {
  const seen = new Set();
  return books.filter((b) => {
    if (!b.isbn13) return true;
    if (seen.has(b.isbn13)) return false;
    seen.add(b.isbn13);
    return true;
  });
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
      <button type="button" class="choice-btn" id="choice-photo">
        <span class="choice-icon">🖼️</span>
        <span>사진으로 등록<br /><span style="font-size:12px; color:var(--muted);">도서관 페이지 캡처, 책 정보 사진에서 ISBN을 찾아요</span></span>
      </button>
      <button type="button" class="choice-btn" id="choice-manual">
        <span class="choice-icon">✏️</span>
        <span>직접 입력</span>
      </button>
    </div>
  `;
  overlayEl.querySelector("#add-close").addEventListener("click", closeOverlay);
  overlayEl.querySelector("#choice-barcode").addEventListener("click", () => renderScanScreen(onSaved));
  overlayEl.querySelector("#choice-photo").addEventListener("click", () => renderOcrScreen(onSaved));
  overlayEl.querySelector("#choice-manual").addEventListener("click", () => renderManualForm(onSaved));
}

function renderOcrScreen(onSaved) {
  overlayEl.innerHTML = `
    <div class="overlay-header">
      <h2 class="serif" style="font-size:18px;">사진으로 등록</h2>
      <button type="button" class="close-btn" id="add-close">✕</button>
    </div>
    <div class="overlay-body">
      <div class="card">
        <p class="hint" style="margin:0;">도서관 검색 결과나 책 정보가 담긴 사진(스크린샷 포함)을 선택하면, 그 안의 ISBN을 찾아서 자동으로 채워드려요.</p>
      </div>
      <input type="file" id="ocr-file-input" accept="image/*" hidden />
      <button type="button" class="btn btn-primary btn-block" id="ocr-pick-btn" style="margin-top:16px;">사진 선택하기</button>
      <p class="hint" id="ocr-status" style="margin-top:12px; text-align:center;"></p>
    </div>
  `;

  overlayEl.querySelector("#add-close").addEventListener("click", closeOverlay);

  const fileInput = overlayEl.querySelector("#ocr-file-input");
  const pickBtn = overlayEl.querySelector("#ocr-pick-btn");
  const statusEl = overlayEl.querySelector("#ocr-status");

  pickBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;

    pickBtn.disabled = true;
    statusEl.textContent = "이미지에서 글자를 읽고 있어요... (처음엔 시간이 좀 걸려요)";

    let worker;
    try {
      const TesseractModule = await import(TESSERACT_CDN_URL);
      const { createWorker } = TesseractModule.default;
      worker = await createWorker(["kor", "eng"]);
      const { data } = await worker.recognize(file);
      const isbn13 = extractIsbn13(data.text);

      if (!overlayEl) return; // 그 사이 화면을 닫았으면 여기서 끝낸다

      if (isbn13) {
        handleScanned(isbn13, onSaved);
      } else {
        const guessedTitle = guessTitleFromLines(data.lines);
        if (guessedTitle) {
          renderManualForm(onSaved, { guessedTitle });
        } else {
          statusEl.textContent = "ISBN도 제목도 찾지 못했어요. 사진이 선명한지 확인하거나 직접 입력해주세요.";
          pickBtn.disabled = false;
        }
      }
    } catch (err) {
      if (overlayEl) {
        statusEl.textContent = "이미지를 읽지 못했어요. 직접 입력해주세요.";
        pickBtn.disabled = false;
      }
    } finally {
      worker?.terminate();
    }
  });
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
  let lookupError = null;
  try {
    book = await srchByIsbn(isbn13);
  } catch (err) {
    lookupError = err.message;
  }
  renderManualForm(onSaved, book ? { ...book } : { isbn13, lookupError });
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
      <form id="book-form">
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
              ${
                members.length > 0
                  ? `<select class="input" id="member-select">
                      ${members.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("")}
                    </select>`
                  : `<input type="text" class="input" id="new-member-name-input" placeholder="예: 엄마, 첫째" required />
                    <p class="hint" style="margin-top:6px;">처음이시네요! 이름을 입력하면 바로 가족 구성원으로 등록돼요. 나중에 설정에서 더 추가할 수 있어요.</p>`
              }
            </div>

            <div class="field-group">
              <span class="field-label">도서관 (선택)</span>
              <select class="input" id="library-select">
                <option value="">선택 안 함</option>
                ${libraries.map((l) => `<option value="${l.libCode}">${escapeHtml(l.libName)}</option>`).join("")}
              </select>
              ${libraries.length === 0 ? `<p class="hint" style="margin-top:6px;">도서관을 등록해두면 대출 가능 여부도 함께 확인할 수 있어요. 지금은 건너뛰어도 괜찮아요.</p>` : ""}
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
          </form>
    </div>
  `;

  overlayEl.querySelector("#add-close").addEventListener("click", closeOverlay);

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
      coverUrl: book.bookImageURL || "",
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
    const reason = prefill?.lookupError ? prefill.lookupError : "정보를 못 찾아서 제목을 입력해주세요";
    showDupNotice(scannedIsbn13, `스캔했어요 (ISBN ${escapeHtml(scannedIsbn13)}) · ${escapeHtml(reason)}`);
  }

  const runSearch = debounce(async (keyword) => {
    if (!keyword || keyword.length < 2) {
      acList.hidden = true;
      acList.innerHTML = "";
      return;
    }
    try {
      const isbnDigits = keyword.replace(/[^\d]/g, "");
      let results;
      if (ISBN13_RE.test(isbnDigits)) {
        const found = await srchByIsbn(isbnDigits);
        results = found ? [found] : [];
      } else {
        results = await srchBooks(keyword);
      }
      results = dedupeByIsbn13(results);
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
    } catch (err) {
      acList.hidden = true;
      acList.innerHTML = "";
      dupNotice.innerHTML = `<div class="hint" style="color:var(--out); margin-top:6px;">${escapeHtml(err.message)}</div>`;
    }
  }, 400);

  titleInput.addEventListener("input", () => {
    clearSelection();
    runSearch(titleInput.value.trim());
  });

  // 사진 인식이 ISBN은 못 찾았지만 제목으로 짐작되는 줄은 찾았을 때 — 자동완성으로 이어준다
  // (사진 인식은 완벽하지 않을 수 있어서 "추정"이라는 걸 분명히 알려주고 확인을 유도한다)
  if (prefill?.guessedTitle) {
    titleInput.value = prefill.guessedTitle;
    runSearch(prefill.guessedTitle);
    dupNotice.innerHTML = `<div class="hint" style="margin-top:6px;">사진에서 제목을 추정했어요. 맞는지 확인하고, 다르면 지우고 다시 입력해주세요.</div>`;
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) return;

    let memberId;
    if (members.length > 0) {
      memberId = overlayEl.querySelector("#member-select").value;
    } else {
      const nameInput = overlayEl.querySelector("#new-member-name-input");
      const name = nameInput.value.trim();
      if (!name) {
        nameInput.focus();
        return;
      }
      memberId = addMember(name).id;
    }
    const libCode = overlayEl.querySelector("#library-select").value;
    const library = libraries.find((l) => l.libCode === libCode);

    const book = addBook({
      memberId,
      isbn13: selectedBook?.isbn13 || scannedIsbn13 || "",
      title,
      author: selectedBook?.author || overlayEl.querySelector("#author-input")?.value.trim() || "",
      publisher: selectedBook?.publisher || overlayEl.querySelector("#publisher-input")?.value.trim() || "",
      kdc: selectedBook?.kdc || "",
      coverUrl: selectedBook?.coverUrl || "",
      libCode,
      libName: library?.libName || "",
      status,
      borrowedAt: borrowedAtInput?.value,
      dueAt: dueAtInput?.value,
    });

    closeOverlay();
    onSaved?.(book);
    enrichBookMetadata(book);
    enrichKeywords(book.isbn13);
  });
}

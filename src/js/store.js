// localStorage 기반 저장소. 서버/로그인 없이 기기에만 보관한다.

import { todayStr, addDays } from "./dateUtils.js";

const STORAGE_KEY = "rl_data_v1";
const MAX_MEMBERS = 5;

// 디자인 시스템 팔레트 안에서 구성원을 구분하는 색상들
export const MEMBER_COLORS = ["#2E5944", "#3D5A98", "#B94A3A", "#D9A036", "#8A867A"];

// 도서관 통합검색 URL 패턴. {query} 자리에 책 제목이 들어간다.
// 대구 수성구립범어도서관은 기본 예시로 미리 알려진 값을 넣어준다.
export const KNOWN_SEARCH_URL_PATTERNS = {
  "127072": "https://library.daegu.go.kr/beomeo/intro/search/index.do?menu_idx=9&title={query}",
};

const DEFAULT_DATA = {
  members: [],       // { id, name, color }
  libraries: [],      // { libCode, libName, address, region }
  books: [],           // { id, memberId, isbn13, title, author, publisher, kdc, libCode, borrowedAt, dueAt, returnedAt, status, rating, read, underlineIds: [] }
  underlines: [],     // { id, bookId, memberId, text, createdAt }
  keywordsByIsbn: {}, // { [isbn13]: [{ word, weight }] } — 관심사 지도용 캐시
};

// 이 기능이 생기기 전에 이미 저장돼 있던 도서관에도 알려진 검색 URL 패턴을 채워준다.
function migrateLibrarySearchPatterns(d) {
  let changed = false;
  d.libraries.forEach((lib) => {
    if (!lib.searchUrlPattern && KNOWN_SEARCH_URL_PATTERNS[lib.libCode]) {
      lib.searchUrlPattern = KNOWN_SEARCH_URL_PATTERNS[lib.libCode];
      changed = true;
    }
  });
  return changed;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? { ...structuredClone(DEFAULT_DATA), ...JSON.parse(raw) } : structuredClone(DEFAULT_DATA);
    if (migrateLibrarySearchPatterns(parsed)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }
    return parsed;
  } catch {
    return structuredClone(DEFAULT_DATA);
  }
}

let data = load();

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getData() {
  return data;
}

export function updateData(mutator) {
  mutator(data);
  save();
}

export function exportBackup() {
  return JSON.stringify(data, null, 2);
}

export function importBackup(json) {
  const parsed = JSON.parse(json);
  data = { ...structuredClone(DEFAULT_DATA), ...parsed };
  save();
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- 가족 구성원 ----------

export function canAddMember() {
  return data.members.length < MAX_MEMBERS;
}

export function addMember(name) {
  if (!canAddMember()) throw new Error("가족 구성원은 최대 5명까지 등록할 수 있어요.");
  const color = MEMBER_COLORS[data.members.length % MEMBER_COLORS.length];
  const member = { id: makeId(), name, color };
  updateData((d) => d.members.push(member));
  return member;
}

export function removeMember(id) {
  updateData((d) => {
    d.members = d.members.filter((m) => m.id !== id);
  });
}

// ---------- 나의 도서관 ----------

export function isLibrarySaved(libCode) {
  return data.libraries.some((l) => l.libCode === libCode);
}

export function addLibrary(lib) {
  if (isLibrarySaved(lib.libCode)) return;
  const searchUrlPattern = lib.searchUrlPattern || KNOWN_SEARCH_URL_PATTERNS[lib.libCode] || "";
  updateData((d) => d.libraries.push({ ...lib, searchUrlPattern }));
}

export function removeLibrary(libCode) {
  updateData((d) => {
    d.libraries = d.libraries.filter((l) => l.libCode !== libCode);
  });
}

export function setLibrarySearchPattern(libCode, pattern) {
  updateData((d) => {
    const lib = d.libraries.find((l) => l.libCode === libCode);
    if (lib) lib.searchUrlPattern = pattern;
  });
}

// ---------- 책 ----------
// status: "willBorrow" | "borrowed" | "returned"
// 지연 여부는 저장하지 않고 dueAt으로 매번 계산한다 (getDisplayStatus 참고).

export function getDisplayStatus(book) {
  if (book.status === "returned") return "returned";
  if (book.status === "willBorrow") return "willBorrow";
  if (book.status === "borrowed") {
    if (book.dueAt && book.dueAt < todayStr()) return "overdue";
    return "borrowed";
  }
  return book.status;
}

export function dDay(dueAt) {
  const diff = Math.round((new Date(dueAt) - new Date(todayStr())) / 86400000);
  return diff;
}

// 같은 isbn13으로 가족이 이미 몇 번 빌렸는지 (재대출 포함 전체 이력)
export function borrowCount(isbn13) {
  if (!isbn13) return 0;
  return data.books.filter((b) => b.isbn13 === isbn13).length;
}

// ---------- 키워드 (관심사 지도) ----------

export function getKeywordsForIsbn(isbn13) {
  return data.keywordsByIsbn[isbn13] || null;
}

export function setKeywordsForIsbn(isbn13, keywords) {
  updateData((d) => {
    d.keywordsByIsbn[isbn13] = keywords;
  });
}

export function addBook(input) {
  const borrowedAt = input.borrowedAt || todayStr();
  const book = {
    id: makeId(),
    memberId: input.memberId,
    isbn13: input.isbn13 || "",
    title: input.title,
    author: input.author || "",
    publisher: input.publisher || "",
    kdc: input.kdc || "",
    libCode: input.libCode || "",
    libName: input.libName || "",
    borrowedAt: input.status === "willBorrow" ? "" : borrowedAt,
    dueAt: input.status === "willBorrow" ? "" : input.dueAt || addDays(borrowedAt, 14),
    returnedAt: "",
    status: input.status || "borrowed",
    rating: input.rating || 0,
    read: null,
    memo: input.memo || "",
    foreignCategory: input.foreignCategory || null, // "literature" | "nonfiction" | "general" (영어원서, KDC 없을 때만)
    coverUrl: input.coverUrl || "", // 정보나루 bookImageURL, 없으면 구글 북스로 나중에 보강
    createdAt: Date.now(),
  };
  updateData((d) => {
    d.books.push(book);
    if (book.memo) {
      d.underlines.push({
        id: makeId(),
        bookId: book.id,
        memberId: book.memberId,
        text: book.memo,
        createdAt: Date.now(),
      });
    }
  });
  return book;
}

export function getBook(id) {
  return data.books.find((b) => b.id === id);
}

export function updateBook(id, patch) {
  updateData((d) => {
    const book = d.books.find((b) => b.id === id);
    if (book) Object.assign(book, patch);
  });
}

export function removeBook(id) {
  updateData((d) => {
    d.books = d.books.filter((b) => b.id !== id);
  });
}

// ---------- 별점 / 밑줄 (등록과 분리해서 언제든 기록) ----------

export function setBookRating(id, rating) {
  updateBook(id, { rating });
}

export function getUnderlineForBook(bookId) {
  return data.underlines.find((u) => u.bookId === bookId);
}

// 책 하나에는 밑줄 메모를 하나만 유지한다. 빈 텍스트를 넣으면 삭제한다.
export function setBookMemo(bookId, text) {
  const trimmed = text.trim();
  updateData((d) => {
    const book = d.books.find((b) => b.id === bookId);
    if (book) book.memo = trimmed;

    const existing = d.underlines.find((u) => u.bookId === bookId);
    if (!trimmed) {
      d.underlines = d.underlines.filter((u) => u.bookId !== bookId);
      return;
    }
    if (existing) {
      existing.text = trimmed;
    } else {
      d.underlines.push({
        id: makeId(),
        bookId,
        memberId: book?.memberId,
        text: trimmed,
        createdAt: Date.now(),
      });
    }
  });
}

// 빌릴 책 → 대출중으로 전환
export function markBorrowed(id) {
  const borrowedAt = todayStr();
  updateBook(id, { status: "borrowed", borrowedAt, dueAt: addDays(borrowedAt, 14) });
}

// 대출중/지연으로 잘못 등록했을 때 → 빌릴 책으로 되돌리기 (빌린/반납 날짜 초기화)
export function revertToWillBorrow(id) {
  updateBook(id, { status: "willBorrow", borrowedAt: "", dueAt: "", returnedAt: "" });
}

// 대출중/지연 → 반납완료. read: true(다 읽었어요) | false(못 읽었어요)
export function markReturned(id, read) {
  updateBook(id, { status: "returned", returnedAt: todayStr(), read });
}

// 반납완료된 책을 같은 정보로 다시 대출 (새 기록 생성, 대출 횟수에 반영됨)
export function reborrowBook(id) {
  const original = getBook(id);
  if (!original) return null;
  return addBook({
    memberId: original.memberId,
    isbn13: original.isbn13,
    title: original.title,
    author: original.author,
    publisher: original.publisher,
    kdc: original.kdc,
    libCode: original.libCode,
    libName: original.libName,
    foreignCategory: original.foreignCategory,
    coverUrl: original.coverUrl,
    status: "borrowed",
  });
}

// 정보나루(class_no)에도, 구글 북스(영어원서 표지/문학·비문학 보강)에도 분류가 안 채워졌을 때
// 마지막 안전망으로 국립중앙도서관 서지정보(KDC)를 조회하고, 그래도 없으면 라틴 문자 제목만으로
// '영어원서'로 잠정 분류한다. 사용자가 수동 지정(manualCategory)했으면 어떤 단계에서도 건드리지 않는다.

import { getData, getBook, updateBook } from "./store.js";
import { srchNlSeoji } from "./api.js";
import { classifyBook } from "./kdc.js";
import { enrichBookMetadata } from "./googleBooksApi.js";

function looksLikeEnglishTitle(title) {
  const letters = ((title || "").match(/[a-zA-Z]/g) || []).length;
  const korean = ((title || "").match(/[가-힣]/g) || []).length;
  return letters >= 3 && korean === 0;
}

// 등록 직후(enrichBookMetadata 다음) 또는 소급 재분류에서 호출한다.
export async function enrichKdcFallback(bookId) {
  const book = getBook(bookId);
  if (!book || !book.isbn13 || book.manualCategory || book.kdc) return;
  // 구글 북스가 이미 문학/비문학까지 확정했으면(classifyBook에서 foreignCategory가 kdc보다 우선이라)
  // 국중 조회 결과가 분류에 반영될 일이 없으니 건너뛴다. "general"(그냥 영어원서)만 남은 경우는
  // 국중에 KDC가 있을 수 있으니 그대로 시도한다.
  if (book.foreignCategory === "literature" || book.foreignCategory === "nonfiction") return;

  try {
    const kdc = await srchNlSeoji(book.isbn13);
    const fresh = getBook(bookId);
    if (!fresh || fresh.manualCategory || fresh.kdc || fresh.foreignCategory === "literature" || fresh.foreignCategory === "nonfiction") return; // 그 사이 사용자가 직접 지정했거나 다른 경로로 채워졌으면 존중
    if (kdc) {
      updateBook(bookId, { kdc });
      return;
    }
  } catch {
    // 국중 API 실패는 조용히 넘어간다 — 등록 흐름을 절대 막지 않는다
  }

  const fresh2 = getBook(bookId);
  if (!fresh2 || fresh2.manualCategory || fresh2.kdc || fresh2.foreignCategory) return;
  if (looksLikeEnglishTitle(fresh2.title)) {
    updateBook(bookId, { foreignCategory: "general" });
  }
}

// 식단표에서 '기타'로 분류된 책 중 사용자가 직접 지정하지 않은 것만 골라 다시 분류를 시도한다.
// 반환값: 다시 시도한 책 권수 (실제로 분류가 바뀐 권수는 호출하는 쪽에서 재계산해서 비교한다).
export async function reclassifyEtcBooks() {
  const data = getData();
  const targets = data.books.filter((b) => b.isbn13 && !b.manualCategory && classifyBook(b) === "etc");

  await Promise.all(
    targets.map(async (b) => {
      await enrichBookMetadata(b);
      await enrichKdcFallback(b.id);
    })
  );

  return targets.map((b) => b.id);
}

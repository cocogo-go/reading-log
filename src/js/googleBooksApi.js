// 정보나루에 없는 정보(주로 집에 있는 영어 원서의 분류, 표지 이미지)를 보조로 채운다.
// 키 없이 쓰는 공개 API라 하루 쿼터가 낮을 수 있다 — 실패해도 등록 자체는 이미 끝난 뒤이므로 조용히 넘어간다.

import { updateBook } from "./store.js";

const BASE_URL = "https://www.googleapis.com/books/v1/volumes";

function isLiterature(categories) {
  return categories.some((c) => /fiction/i.test(c));
}

// 등록 직후 백그라운드로 호출한다. 이미 갖고 있는 정보는 건드리지 않고, 없는 것만 채운다.
export function enrichBookMetadata(book) {
  if (!book.isbn13) return;
  const needsForeignCategory = !book.kdc && !book.foreignCategory;
  const needsCover = !book.coverUrl;
  if (!needsForeignCategory && !needsCover) return;

  fetch(`${BASE_URL}?q=isbn:${book.isbn13}`)
    .then((res) => (res.ok ? res.json() : null))
    .then((json) => {
      const info = json?.items?.[0]?.volumeInfo;
      if (!info) return;
      const patch = {};

      if (needsCover) {
        const thumbnail = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail;
        if (thumbnail) patch.coverUrl = thumbnail.replace(/^http:/, "https:");
      }

      if (needsForeignCategory && info.language === "en") {
        const categories = info.categories || [];
        patch.foreignCategory = categories.length === 0 ? "general" : isLiterature(categories) ? "literature" : "nonfiction";
      }

      if (Object.keys(patch).length > 0) updateBook(book.id, patch);
    })
    .catch(() => {});
}

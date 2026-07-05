// 정보나루에 KDC 분류가 없는 책(주로 집에 있는 영어 원서)을 위한 보조 분류.
// 키 없이 쓰는 공개 API라 하루 쿼터가 낮을 수 있다 — 실패해도 등록 자체는 이미 끝난 뒤이므로 조용히 넘어간다.

const BASE_URL = "https://www.googleapis.com/books/v1/volumes";

function isLiterature(categories) {
  return categories.some((c) => /fiction/i.test(c));
}

// 반환값: "literature" | "nonfiction" | "general" | null(분류 불가/한국어책 등)
export async function enrichForeignCategory(isbn13) {
  try {
    const res = await fetch(`${BASE_URL}?q=isbn:${isbn13}`);
    if (!res.ok) return null;
    const json = await res.json();
    const info = json.items?.[0]?.volumeInfo;
    if (!info || info.language !== "en") return null;
    const categories = info.categories || [];
    if (categories.length === 0) return "general";
    return isLiterature(categories) ? "literature" : "nonfiction";
  } catch {
    return null;
  }
}

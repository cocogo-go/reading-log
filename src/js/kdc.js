// 정보나루 class_no(KDC 분류기호)를 아이 눈높이 카테고리로 단순화한다.
// KDC 첫자리 기준의 근사 분류라, 실제 API 응답을 받으면 함께 다시 검증해야 한다.

export const CATEGORIES = {
  picture: { label: "그림책", color: "#D9A036" },
  story: { label: "창작동화", color: "#2E5944" },
  science: { label: "과학·자연", color: "#3D5A98" },
  history: { label: "역사", color: "#B94A3A" },
  art: { label: "예술", color: "#8A867A" },
  humanities: { label: "인문·사회", color: "#6B7A8F" },
  en_lit: { label: "영어원서·문학", color: "#7A5C3E" },
  en_nonfic: { label: "영어원서·비문학", color: "#4A7A6B" },
  en_general: { label: "영어원서", color: "#A67F5D" },
  etc: { label: "기타", color: "#C9C4B4" },
};

// 사용자가 직접 지정한 분류(manualCategory) > 영어원서 분류(foreignCategory) > 정보나루 KDC 순으로 우선한다.
export function classifyBook(book) {
  if (book.manualCategory && CATEGORIES[book.manualCategory]) return book.manualCategory;
  if (book.foreignCategory === "literature") return "en_lit";
  if (book.foreignCategory === "nonfiction") return "en_nonfic";
  if (book.foreignCategory === "general") return "en_general";
  return classifyKdc(book.kdc);
}

export function computeCounts(books) {
  const counts = {};
  for (const key of Object.keys(CATEGORIES)) counts[key] = 0;
  books.forEach((b) => {
    counts[classifyBook(b)]++;
  });
  return counts;
}

export function buildDietComment(counts, total) {
  if (total === 0) return "";
  const entries = Object.entries(counts)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1]);
  const [topKey, topCount] = entries[0];
  const share = topCount / total;

  if (topKey === "etc" && share >= 0.5) {
    return "분류 정보가 없는 책이 많아요. 자동완성이나 바코드 스캔으로 등록하면 식단표가 더 정확해져요.";
  }
  if (entries.length === 1 || share >= 0.5) {
    return `요즘 ${CATEGORIES[topKey].label}책 편식 중이에요!`;
  }
  if (entries.length >= 3) {
    return "이번엔 골고루 잘 읽었어요.";
  }
  return "조금씩 더 다양하게 읽어볼까요?";
}

export function classifyKdc(kdc) {
  const digits = (kdc || "").replace(/[^0-9]/g, "");
  if (!digits) return "etc";
  const first = digits[0];
  switch (first) {
    case "0":
      return "picture";
    case "8":
      return "story";
    case "4":
    case "5":
      return "science";
    case "9":
      return "history";
    case "6":
    case "7":
      return "art";
    case "1":
    case "2":
    case "3":
      return "humanities";
    default:
      return "etc";
  }
}

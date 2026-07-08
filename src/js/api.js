// 정보나루(data4library.kr) API 클라이언트
//
// ⚠️ API 키는 코드에 하드코딩하지 않는다 (공개 저장소 배포 대상).
// 사용자가 설정 화면에서 입력한 키를 localStorage(store.js)에 저장해 사용한다.
// CORS는 실제 브라우저 fetch로 테스트 완료 (Access-Control-Allow-Origin: *) — 중계 서버 불필요.

import { getAuthKey, getKeywordsForIsbn, setKeywordsForIsbn } from "./store.js";

const BASE_URL = "https://data4library.kr/api";

// 시/도 지역 코드 (정보나루 region 파라미터)
export const REGIONS = [
  { code: "11", name: "서울특별시" },
  { code: "21", name: "부산광역시" },
  { code: "22", name: "대구광역시" },
  { code: "23", name: "인천광역시" },
  { code: "24", name: "광주광역시" },
  { code: "25", name: "대전광역시" },
  { code: "26", name: "울산광역시" },
  { code: "29", name: "세종특별자치시" },
  { code: "31", name: "경기도" },
  { code: "32", name: "강원특별자치도" },
  { code: "33", name: "충청북도" },
  { code: "34", name: "충청남도" },
  { code: "35", name: "전북특별자치도" },
  { code: "36", name: "전라남도" },
  { code: "37", name: "경상북도" },
  { code: "38", name: "경상남도" },
  { code: "39", name: "제주특별자치도" },
];

async function callApi(endpoint, params = {}) {
  const authKey = getAuthKey();
  const query = new URLSearchParams({
    ...params,
    authKey,
    format: "json",
  });
  const res = await fetch(`${BASE_URL}/${endpoint}?${query.toString()}`);
  if (!res.ok) {
    throw new Error(`정보나루 API 오류: ${res.status}`);
  }
  const json = await res.json();
  const err = json?.response?.error;
  if (err) {
    const e = new Error(err);
    e.code = json.response.errCode;
    throw e;
  }
  return json;
}

// 제목으로 책 검색 (자동완성/도서 검색용)
export async function srchBooks(keyword, pageSize = 30) {
  const json = await callApi("srchBooks", { keyword, pageSize });
  const docs = json?.response?.docs || [];
  return docs.map((d) => d.doc);
}

// 연령대 코드 (정보나루 loanItemSrch age 파라미터)
export const AGE_GROUPS = [
  { code: "0", name: "영유아" },
  { code: "6", name: "유아" },
  { code: "8", name: "초등" },
  { code: "14", name: "청소년" },
  { code: "20", name: "성인" },
];

// 특정 도서관의 소장/대출가능 여부. "available" | "unavailable" | "notFound"
export async function bookExist(isbn13, libCode) {
  const json = await callApi("bookExist", { isbn13, libCode });
  const result = json?.response?.result;
  if (!result || result.hasBook !== "Y") return "notFound";
  return result.loanAvailable === "Y" ? "available" : "unavailable";
}

// 연령대별 인기대출도서
export async function loanItemSrch(age) {
  const json = await callApi("loanItemSrch", { age, pageSize: 40 });
  const docs = json?.response?.docs || [];
  return docs.map((d) => d.doc);
}

// 지역(시도) 안의 도서관 목록. dtlRegion(구/군 코드)은 선택.
// dtl_region 코드 없이도 구/군 이름으로 클라이언트에서 걸러낼 수 있도록 전체 목록을 받아온다.
export async function libSrch(region, dtlRegion) {
  const params = { region, pageSize: 500 };
  if (dtlRegion) params.dtl_region = dtlRegion;
  const json = await callApi("libSrch", params);
  const libs = json?.response?.libs || [];
  return libs.map((l) => l.lib);
}

// ISBN13으로 책 상세 정보 조회 (바코드 스캔 후 자동 입력용)
export async function srchByIsbn(isbn13) {
  const json = await callApi("srchDtlList", { isbn13, loaninfoYN: "N" });
  const book = json?.response?.detail?.[0]?.book;
  if (!book) return null;
  return {
    isbn13: book.isbn13 || isbn13,
    bookname: book.bookname || "",
    authors: book.authors || "",
    publisher: book.publisher || "",
    class_no: book.class_no || "",
    bookImageURL: book.bookImageURL || "",
  };
}

// ISBN13의 핵심 키워드 + 가중치 (관심사 지도용)
export async function keywordList(isbn13) {
  const json = await callApi("keywordList", { isbn13, additionalYN: "N" });
  const items = json?.response?.items || [];
  return items.map((i) => ({ word: i.item.word, weight: Number(i.item.weight) || 0 }));
}

// 캐시에 없을 때만 백그라운드로 키워드를 가져와 저장한다. 실패해도 조용히 넘어간다
// (등록/재대출/담기 같은 흐름을 절대 막지 않는다).
export function enrichKeywords(isbn13) {
  if (!isbn13 || getKeywordsForIsbn(isbn13)) return;
  keywordList(isbn13)
    .then((keywords) => setKeywordsForIsbn(isbn13, keywords))
    .catch(() => {});
}

// 검색일자를 포함한 최근 3일간의 대출 급상승 도서 (일자별 최대 5권)
export async function hotTrend(searchDt) {
  const json = await callApi("hotTrend", { searchDt });
  const results = json?.response?.results || [];
  return results.map((r) => ({
    date: r.result.date,
    docs: (r.result.docs || []).map((d) => d.doc),
  }));
}

// 도서관별 신착도서 (등록일 기준 최신 도서)
export async function newArrivalBook(libCode) {
  const json = await callApi("newArrivalBook", { libCode });
  const docs = json?.response?.docs || [];
  return docs.map((d) => d.doc);
}

// 이 책과 함께 대출된 도서 목록
export async function usageAnalysisList(isbn13) {
  const json = await callApi("usageAnalysisList", { isbn13 });
  const books = json?.response?.coLoanBooks || [];
  return books.map((b) => ({
    isbn13: b.book.isbn13 || "",
    bookname: b.book.bookname || "",
    authors: b.book.authors || "",
    publisher: b.book.publisher || "",
    bookImageURL: b.book.bookImageURL || "",
  }));
}

export { callApi, getAuthKey };

// 정보나루(data4library.kr) API 클라이언트.
//
// 실제 인증키는 클라이언트에 두지 않는다. Cloudflare Worker(cloudflare-worker/reading-log-proxy.js)가
// 서버 쪽 비밀로 키를 주입해 정보나루에 대신 요청해주므로, 사용자는 키 없이 바로 앱을 쓸 수 있다.

import { getKeywordsForIsbn, setKeywordsForIsbn } from "./store.js";

const PROXY_BASE_URL = "https://reading-log-proxy.gojihyego.workers.dev";

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

// data4library.kr이 돌려주는 에러 메시지를 그대로 보여주면 사용자가 이해하기 어려워서
// (한도 초과, 서버 점검 등) 상황에 맞는 안내 문구로 바꿔준다.
function friendlyApiError(message) {
  const msg = message || "";
  if (/트래픽|한도|초과|제한/.test(msg)) {
    return "오늘 도서관 정보 이용 한도를 넘었어요. 내일 다시 시도해주세요.";
  }
  if (/데이터 제공이 불가|도서관 코드를 확인/.test(msg)) {
    return "이 지역/도서관은 정보나루에서 현재 데이터를 제공하지 않아요. 잠시 후 다시 확인하거나 다른 도서관으로 등록해보세요.";
  }
  return "도서관 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.";
}

async function callApi(endpoint, params = {}) {
  const query = new URLSearchParams(params);
  let res;
  try {
    res = await fetch(`${PROXY_BASE_URL}/api/${endpoint}?${query.toString()}`);
  } catch {
    throw new Error("도서관 서버에 연결하지 못했어요. 인터넷 연결을 확인해주세요.");
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error("도서관 서버 응답을 이해하지 못했어요. 잠시 후 다시 시도해주세요.");
  }

  if (!res.ok) {
    throw new Error(friendlyApiError(json?.error));
  }
  const err = json?.response?.error;
  if (err) {
    const e = new Error(friendlyApiError(err));
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

export { callApi };

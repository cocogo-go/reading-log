// 정보나루(data4library.kr) API 클라이언트
//
// ⚠️ API 키는 코드에 하드코딩하지 않는다 (공개 저장소 배포 대상).
// 사용자가 설정 화면에서 입력한 키를 localStorage(store.js)에 저장해 사용한다.
// CORS는 실제 브라우저 fetch로 테스트 완료 (Access-Control-Allow-Origin: *) — 중계 서버 불필요.

import { getAuthKey } from "./store.js";

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

// 제목으로 책 검색 (자동완성용)
export async function srchBooks(keyword) {
  const json = await callApi("srchBooks", { keyword, pageSize: 10 });
  const docs = json?.response?.docs || [];
  return docs.map((d) => d.doc);
}

// 특정 도서관들의 소장/대출가능 여부
export function bookExist(isbn13, libCode) {
  return callApi("bookExist", { isbn13, libCode });
}

// 지역(시도) 안의 도서관 목록. dtlRegion(구/군 코드)은 선택.
export async function libSrch(region, dtlRegion) {
  const params = { region };
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
  };
}

export { callApi, getAuthKey };

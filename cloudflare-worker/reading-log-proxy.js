// 정보나루(data4library.kr) + 국립중앙도서관 서지정보(SEOJI) API 중계 Worker.
//
// 클라이언트(reading-log 앱)는 이 Worker를 통해서만 두 API를 호출한다.
// 실제 인증키(authKey / cert_key)는 여기서만 쓰는 서버 쪽 비밀
// (env.DATA4LIBRARY_KEY / env.NL_SEOJI_KEY)이며, 클라이언트 코드나 응답에는
// 절대 노출하지 않는다.
//
// 배포: Cloudflare 대시보드 > Workers & Pages > 이 스크립트를 붙여넣고,
// Settings > Variables에 DATA4LIBRARY_KEY, NL_SEOJI_KEY를 각각 Secret으로 등록한다.
//
// 호출 형식:
//   정보나루: GET /api/<endpoint>?<정보나루 파라미터, authKey/format 제외>
//     예: /api/srchBooks?keyword=역사&pageSize=30
//   국립중앙도서관 서지정보: GET /api/nl-seoji?isbn=9788936434267
//     (cert_key/result_style/page_no/page_size는 서버가 채운다)

const ALLOWED_ENDPOINTS = new Set([
  "srchBooks",
  "loanItemSrch",
  "bookExist",
  "libSrch",
  "srchDtlList",
  "keywordList",
  "usageAnalysisList",
  "hotTrend",
  "newArrivalBook",
]);

// 여러 origin(로컬 개발 서버 포함)을 허용해야 하면 여기 배열에 추가한다.
const ALLOWED_ORIGINS = new Set([
  "https://cocogo-go.github.io",
  "http://localhost:8777",
  "http://127.0.0.1:8777",
]);

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://cocogo-go.github.io",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) },
  });
}

async function handleData4Library(endpoint, url, env, origin) {
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return jsonResponse({ error: "지원하지 않는 요청이에요." }, 404, origin);
  }
  if (!env.DATA4LIBRARY_KEY) {
    return jsonResponse({ error: "서버에 정보나루 키가 설정되어 있지 않아요." }, 500, origin);
  }

  const upstream = new URL(`https://data4library.kr/api/${endpoint}`);
  for (const [key, value] of url.searchParams) {
    if (key === "authKey" || key === "format") continue; // 서버 쪽 값만 신뢰한다
    upstream.searchParams.set(key, value);
  }
  upstream.searchParams.set("authKey", env.DATA4LIBRARY_KEY);
  upstream.searchParams.set("format", "json");

  try {
    const upstreamRes = await fetch(upstream.toString());
    const bodyText = await upstreamRes.text();
    return new Response(bodyText, {
      status: upstreamRes.status,
      headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) },
    });
  } catch {
    return jsonResponse({ error: "정보나루 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요." }, 502, origin);
  }
}

async function handleNlSeoji(url, env, origin) {
  if (!env.NL_SEOJI_KEY) {
    return jsonResponse({ error: "서버에 국립중앙도서관 키가 설정되어 있지 않아요." }, 500, origin);
  }

  const upstream = new URL("https://www.nl.go.kr/seoji/SearchApi.do");
  for (const [key, value] of url.searchParams) {
    if (key === "cert_key" || key === "result_style" || key === "page_no" || key === "page_size") continue; // 서버 쪽 값만 신뢰한다
    upstream.searchParams.set(key, value);
  }
  upstream.searchParams.set("cert_key", env.NL_SEOJI_KEY);
  upstream.searchParams.set("result_style", "json");
  upstream.searchParams.set("page_no", "1");
  upstream.searchParams.set("page_size", "5");

  try {
    const upstreamRes = await fetch(upstream.toString());
    const bodyText = await upstreamRes.text();
    return new Response(bodyText, {
      status: upstreamRes.status,
      headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin) },
    });
  } catch {
    return jsonResponse({ error: "국립중앙도서관 서버에 연결하지 못했어요. 잠시 후 다시 시도해주세요." }, 502, origin);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    if (request.method !== "GET") {
      return jsonResponse({ error: "GET 요청만 지원해요." }, 405, origin);
    }

    const url = new URL(request.url);

    if (url.pathname === "/api/nl-seoji") {
      return handleNlSeoji(url, env, origin);
    }

    const match = url.pathname.match(/^\/api\/([a-zA-Z]+)$/);
    if (!match) {
      return jsonResponse({ error: "지원하지 않는 요청이에요." }, 404, origin);
    }
    return handleData4Library(match[1], url, env, origin);
  },
};

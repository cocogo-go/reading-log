import {
  getData,
  canAddMember,
  addMember,
  removeMember,
  addLibrary,
  removeLibrary,
  isLibrarySaved,
  setLibrarySearchPattern,
  exportBackup,
  importBackup,
} from "../store.js";
import { REGIONS, libSrch } from "../api.js";
import { todayStr } from "../dateUtils.js";

let lastSearchResults = [];

const FAQ_ITEMS = [
  {
    q: "회원가입이 필요한가요?",
    a: "아니요. 가입도 로그인도 없어요. 열자마자 바로 기록할 수 있어요.",
  },
  {
    q: "우리 가족 기록은 어디에 저장되나요?",
    a: "지금 쓰고 계신 폰에만 저장돼요. 서버로 전송되지 않아서 다른 사람은 볼 수 없어요. 대신 폰을 바꾸실 때는 설정의 '내보내기'로 기록을 옮겨주세요.",
  },
  {
    q: "무료인가요? 광고가 있나요?",
    a: "네, 무료이고 광고도 없어요. 도서관 다니는 한 엄마가 우리 가족 쓰려고 만든 앱이에요.",
  },
  {
    q: "대출 가능 여부는 어떻게 알아요?",
    a: "국립중앙도서관이 운영하는 공공데이터(도서관 정보나루)로 확인해요. 전국 공공도서관이 대상이라, 설정에서 자주 가는 도서관을 등록하면 돼요.",
  },
  {
    q: "왜 홈 화면에 추가하라고 하나요?",
    a: "카카오톡 안에서 열면 기록이 사라질 수 있어요. 사파리나 크롬으로 연 다음 '홈 화면에 추가'를 하면 앱처럼 쓸 수 있고 기록도 안전하게 보관돼요.",
  },
  {
    q: "도서관 앱이랑 뭐가 다른가요?",
    a: "도서관 앱은 '대출 관리'를, 이 앱은 '우리 가족의 독서 기록'을 남겨요. 누가 뭘 좋아했는지, 어떤 책을 몇 번이나 빌렸는지, 아이의 관심사가 어떻게 변해가는지가 쌓여요.",
  },
];

function memberInitial(name) {
  return name.trim().slice(0, 1) || "?";
}

function renderMembers() {
  const data = getData();
  if (data.members.length === 0) {
    return `<p class="empty-state" style="padding:12px 0;">아직 등록된 구성원이 없어요.</p>`;
  }
  return `
    <div class="member-list">
      ${data.members
        .map(
          (m) => `
        <span class="member-chip">
          <span class="member-badge" style="background:${m.color}">${memberInitial(m.name)}</span>
          ${escapeHtml(m.name)}
          <button type="button" class="remove" data-remove-member="${m.id}" aria-label="삭제">✕</button>
        </span>
      `
        )
        .join("")}
    </div>
  `;
}

function renderSavedLibraries() {
  const data = getData();
  if (data.libraries.length === 0) {
    return `<p class="empty-state" style="padding:12px 0;">등록한 도서관이 없어요.</p>`;
  }
  return data.libraries
    .map(
      (l) => `
    <div class="lib-item" style="flex-direction:column; align-items:stretch; gap:8px;">
      <div style="display:flex; justify-content:space-between;">
        <div>
          <div class="lib-name">${escapeHtml(l.libName)}</div>
          <div class="lib-address">${escapeHtml(l.address || "")}</div>
        </div>
        <button type="button" class="btn btn-secondary" data-remove-lib="${l.libCode}">삭제</button>
      </div>
      <div class="row">
        <input
          type="text"
          class="input"
          data-search-pattern-input="${l.libCode}"
          placeholder="청구기호 검색 URL (예: https://.../search?title={query})"
          value="${escapeHtml(l.searchUrlPattern || "")}"
        />
        <button type="button" class="btn btn-secondary" data-search-pattern-save="${l.libCode}">저장</button>
      </div>
    </div>
  `
    )
    .join("");
}

function wireLibrarySearchPatterns(container) {
  container.querySelectorAll("[data-search-pattern-save]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const libCode = btn.dataset.searchPatternSave;
      const input = container.querySelector(`[data-search-pattern-input="${libCode}"]`);
      setLibrarySearchPattern(libCode, input.value.trim());
      const original = btn.textContent;
      btn.textContent = "저장됨";
      setTimeout(() => (btn.textContent = original), 1200);
    });
  });
}

function renderSearchResults() {
  if (lastSearchResults.length === 0) return "";
  return lastSearchResults
    .map((lib) => {
      const saved = isLibrarySaved(lib.libCode);
      return `
      <div class="lib-item">
        <div>
          <div class="lib-name">${escapeHtml(lib.libName)}</div>
          <div class="lib-address">${escapeHtml(lib.address || "")}</div>
        </div>
        <button type="button" class="btn ${saved ? "btn-secondary" : "btn-primary"}" data-add-lib="${lib.libCode}" ${saved ? "disabled" : ""}>
          ${saved ? "추가됨" : "추가"}
        </button>
      </div>
    `;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

export function renderSettingsView(container) {
  container.innerHTML = `
    <h2 class="screen-title serif">설정</h2>

    <div class="card">
      <h3>가족 구성원</h3>
      <div id="member-list-slot">${renderMembers()}</div>
      <form id="member-form" class="row">
        <input type="text" class="input" id="member-name-input" placeholder="이름 (예: 엄마, 준서)" maxlength="8" ${canAddMember() ? "" : "disabled"} />
        <button type="submit" class="btn btn-primary" ${canAddMember() ? "" : "disabled"}>추가</button>
      </form>
      <p class="hint" style="margin-top:8px;">최대 5명까지 등록할 수 있어요. (${getData().members.length}/5)</p>
    </div>

    <div class="card">
      <h3>나의 도서관</h3>
      <div id="saved-lib-slot">${renderSavedLibraries()}</div>

      <p class="field-label" style="margin-top:16px;">도서관 검색</p>
      <div class="row" style="margin-bottom:8px;">
        <select class="input" id="region-select">
          <option value="">시/도 선택</option>
          ${REGIONS.map((r) => `<option value="${r.code}">${r.name}</option>`).join("")}
        </select>
      </div>
      <div class="row">
        <input type="text" class="input" id="dtl-region-input" placeholder="구/군 이름으로 좁혀보기 (예: 수성구립범어도서관)" />
        <button type="button" class="btn btn-secondary" id="lib-search-btn">검색</button>
      </div>
      <p class="hint" id="lib-search-status" style="margin-top:8px;"></p>
      <div id="lib-search-results">${renderSearchResults()}</div>
    </div>

    <div class="card">
      <h3>데이터 백업</h3>
      <p class="hint">기록은 이 기기(이 앱)에만 저장돼요. 사파리와 홈 화면 앱은 저장 공간이 서로 달라서, 옮기고 싶을 땐 내보내기 → 가져오기를 이용해주세요.</p>
      <div class="row">
        <button type="button" class="btn btn-secondary" style="flex:1;" id="export-btn">내보내기</button>
        <button type="button" class="btn btn-secondary" style="flex:1;" id="import-btn">가져오기</button>
      </div>
      <input type="file" id="import-file-input" accept="application/json" hidden />
      <p class="hint" id="backup-status" style="margin-top:8px;"></p>
    </div>

    <div class="card">
      <h3>자주 묻는 질문</h3>
      <div class="faq-list">
        ${FAQ_ITEMS.map(
          (item, i) => `
          <div class="faq-item">
            <button type="button" class="faq-question" data-faq-toggle="${i}">
              <span>${escapeHtml(item.q)}</span>
              <span class="faq-arrow">›</span>
            </button>
            <p class="faq-answer" id="faq-answer-${i}" hidden>${escapeHtml(item.a)}</p>
          </div>
        `
        ).join("")}
      </div>
    </div>
  `;

  container.querySelector("#member-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = container.querySelector("#member-name-input");
    const name = input.value.trim();
    if (!name) return;
    try {
      addMember(name);
      renderSettingsView(container);
    } catch (err) {
      alert(err.message);
    }
  });

  container.querySelectorAll("[data-remove-member]").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeMember(btn.dataset.removeMember);
      renderSettingsView(container);
    });
  });

  container.querySelectorAll("[data-remove-lib]").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeLibrary(btn.dataset.removeLib);
      renderSettingsView(container);
    });
  });
  wireLibrarySearchPatterns(container);

  const searchBtn = container.querySelector("#lib-search-btn");
  searchBtn.addEventListener("click", async () => {
    const region = container.querySelector("#region-select").value;
    const keyword = container.querySelector("#dtl-region-input").value.trim();
    const statusEl = container.querySelector("#lib-search-status");

    if (!region) {
      statusEl.textContent = "시/도를 선택해주세요.";
      return;
    }

    statusEl.textContent = "검색 중이에요...";
    searchBtn.disabled = true;
    try {
      const libs = await libSrch(region);
      lastSearchResults = keyword
        ? libs.filter((l) => `${l.libName}${l.address}`.includes(keyword))
        : libs;
      statusEl.textContent = `${lastSearchResults.length}곳을 찾았어요.`;
      container.querySelector("#lib-search-results").innerHTML = renderSearchResults();
      wireAddLibButtons(container);
    } catch (err) {
      statusEl.textContent = err.message || "검색에 실패했어요. 잠시 후 다시 시도해주세요.";
    } finally {
      searchBtn.disabled = false;
    }
  });

  wireAddLibButtons(container);

  container.querySelectorAll("[data-faq-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const answer = container.querySelector(`#faq-answer-${btn.dataset.faqToggle}`);
      const open = !answer.hidden;
      answer.hidden = open;
      btn.classList.toggle("open", !open);
    });
  });

  const backupStatus = container.querySelector("#backup-status");

  container.querySelector("#export-btn").addEventListener("click", () => {
    const json = exportBackup();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `우리가족대출카드-백업-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    backupStatus.textContent = "내보냈어요. 옮기려는 기기/앱의 '가져오기'에서 이 파일을 선택해주세요.";
  });

  const fileInput = container.querySelector("#import-file-input");
  container.querySelector("#import-btn").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!confirm("가져오면 지금 이 기기에 있는 기록은 백업 파일 내용으로 덮어써져요. 계속할까요?")) {
      fileInput.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importBackup(reader.result);
        alert("가져왔어요. 화면을 새로고침할게요.");
        location.reload();
      } catch {
        backupStatus.textContent = "파일을 읽지 못했어요. 이 앱에서 내보낸 백업 파일이 맞는지 확인해주세요.";
      }
    };
    reader.readAsText(file);
  });
}

function wireAddLibButtons(container) {
  container.querySelectorAll("[data-add-lib]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lib = lastSearchResults.find((l) => l.libCode === btn.dataset.addLib);
      if (!lib) return;
      addLibrary({ libCode: lib.libCode, libName: lib.libName, address: lib.address });
      container.querySelector("#saved-lib-slot").innerHTML = renderSavedLibraries();
      container.querySelectorAll("[data-remove-lib]").forEach((b) => {
        b.addEventListener("click", () => {
          removeLibrary(b.dataset.removeLib);
          renderSettingsView(container);
        });
      });
      wireLibrarySearchPatterns(container);
      container.querySelector("#lib-search-results").innerHTML = renderSearchResults();
      wireAddLibButtons(container);
    });
  });
}

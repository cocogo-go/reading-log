import {
  getData,
  canAddMember,
  addMember,
  removeMember,
  getAuthKey,
  setAuthKey,
  addLibrary,
  removeLibrary,
  isLibrarySaved,
  exportBackup,
  importBackup,
} from "../store.js";
import { REGIONS, libSrch } from "../api.js";
import { todayStr } from "../dateUtils.js";

let lastSearchResults = [];

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
    <div class="lib-item">
      <div>
        <div class="lib-name">${escapeHtml(l.libName)}</div>
        <div class="lib-address">${escapeHtml(l.address || "")}</div>
      </div>
      <button type="button" class="btn btn-secondary" data-remove-lib="${l.libCode}">삭제</button>
    </div>
  `
    )
    .join("");
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
  const authKey = getAuthKey();

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
      <h3>정보나루 API 키</h3>
      <p class="hint">data4library.kr에서 발급받은 인증키를 입력하면 도서관 검색과 책 자동완성을 쓸 수 있어요.</p>
      <div class="row">
        <input type="password" class="input" id="authkey-input" placeholder="API 키" value="${escapeHtml(authKey)}" />
        <button type="button" class="btn btn-secondary" id="authkey-save-btn">저장</button>
      </div>
      <p class="hint" id="authkey-status" style="margin-top:8px;">${authKey ? "저장된 키가 있어요." : "아직 입력한 키가 없어요."}</p>
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

  container.querySelector("#authkey-save-btn").addEventListener("click", () => {
    const value = container.querySelector("#authkey-input").value.trim();
    setAuthKey(value);
    container.querySelector("#authkey-status").textContent = value
      ? "저장했어요. 이제 도서관 검색을 사용할 수 있어요."
      : "아직 입력한 키가 없어요.";
  });

  container.querySelectorAll("[data-remove-lib]").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeLibrary(btn.dataset.removeLib);
      renderSettingsView(container);
    });
  });

  const searchBtn = container.querySelector("#lib-search-btn");
  searchBtn.addEventListener("click", async () => {
    const region = container.querySelector("#region-select").value;
    const keyword = container.querySelector("#dtl-region-input").value.trim();
    const statusEl = container.querySelector("#lib-search-status");

    if (!getAuthKey()) {
      statusEl.textContent = "먼저 위에서 정보나루 API 키를 저장해주세요.";
      return;
    }
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
      if (err.code === "vitalizationErr") {
        statusEl.textContent = "아직 승인 대기 중인 키예요. 정보나루에서 승인되면 다시 시도해주세요.";
      } else if (err.code === "authErr") {
        statusEl.textContent = "키가 정확하지 않아요. 위에서 다시 확인해주세요.";
      } else {
        statusEl.textContent = `검색에 실패했어요: ${err.message}`;
      }
    } finally {
      searchBtn.disabled = false;
    }
  });

  wireAddLibButtons(container);

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
      container.querySelector("#lib-search-results").innerHTML = renderSearchResults();
      wireAddLibButtons(container);
    });
  });
}

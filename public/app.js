const tabs = document.querySelectorAll("#view-tabs .tab");
const panels = {
  contributions: document.getElementById("contributions-view"),
  month: document.getElementById("month-view"),
  list: document.getElementById("list-view"),
};

const contributionsCalendarEl = document.getElementById("contributions-calendar");
const contributionsMonthsEl = document.getElementById("contributions-months");
const monthCalendarEl = document.getElementById("month-calendar");
const monthLabelEl = document.getElementById("month-label");
const listContainerEl = document.getElementById("list-container");
const selectedDateTitleEl = document.getElementById("selected-date-title");
const daySummaryEl = document.getElementById("day-summary");
const entriesContainerEl = document.getElementById("entries-container");
const entryFormEl = document.getElementById("entry-form");
const totalScoreInput = entryFormEl.elements.totalScore;
const totalScoreHintEl = document.getElementById("total-score-hint");
const scoreInputNames = ["listeningScore", "readingScore", "writingScore", "speakingScore"];
const skillScoreInputs = scoreInputNames.map((name) => entryFormEl.elements.namedItem(name));

let selectedDate = toDateKey(new Date());
let monthCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let entriesByDate = {};
let manualTotalScore = false;

function toDateKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateZh(dateKey) {
  const [y, m, d] = dateKey.split("-");
  return `${y}年${m}月${d}日`;
}

function getEntriesForDate(dateKey) {
  return entriesByDate[dateKey] || [];
}

function getDailyMinutes(dateKey) {
  return getEntriesForDate(dateKey).reduce((sum, e) => sum + (Number(e.durationMinutes) || 0), 0);
}

function formatBandScore(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "";
  }

  return Number(value).toFixed(1);
}

function readBandInput(input) {
  if (!input) return null;
  const value = input.value.trim();
  if (value === "") return null;

  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function calculateBandFromSkills() {
  const values = skillScoreInputs.map((input) => readBandInput(input));
  if (values.some((value) => value === null)) {
    return null;
  }

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(average * 2) / 2;
}

function syncAutoTotalScore() {
  const calculated = calculateBandFromSkills();

  if (calculated === null) {
    if (!manualTotalScore) {
      totalScoreInput.value = "";
      totalScoreInput.dataset.autoCalculated = "true";
    }
    totalScoreHintEl.textContent = "填写听力、阅读、写作、口语后，会自动算出总分";
    return;
  }

  const formatted = formatBandScore(calculated);
  totalScoreHintEl.textContent = `根据四项自动计算：${formatted}`;

  if (!manualTotalScore || totalScoreInput.value.trim() === "" || totalScoreInput.dataset.autoCalculated === "true") {
    totalScoreInput.value = formatted;
    totalScoreInput.dataset.autoCalculated = "true";
  }
}

function markTotalAsManual() {
  manualTotalScore = totalScoreInput.value.trim() !== "";
  if (manualTotalScore) {
    delete totalScoreInput.dataset.autoCalculated;
  }
}

function getIntensityLevel(minutes) {
  if (minutes <= 0) return 0;
  if (minutes <= 30) return 1;
  if (minutes <= 60) return 2;
  if (minutes <= 120) return 3;
  return 4;
}

function renderEntryCards(dateKey) {
  const entries = getEntriesForDate(dateKey);
  if (entries.length === 0) {
    entriesContainerEl.innerHTML = '<div class="entry-card">暂无记录</div>';
    return;
  }

  entriesContainerEl.innerHTML = entries
    .map((entry) => {
      const rows = [];
      if (entry.title) rows.push(`<div class="entry-meta">标题：${entry.title}</div>`);
      if (entry.section) rows.push(`<div class="entry-meta">部分：${entry.section}</div>`);
      if (entry.source) rows.push(`<div class="entry-meta">来源：${entry.source}</div>`);
      if (entry.durationMinutes !== null && entry.durationMinutes !== undefined) rows.push(`<div class="entry-meta">用时：${entry.durationMinutes} 分钟</div>`);
      if (entry.totalScore !== null && entry.totalScore !== undefined) rows.push(`<div class="entry-meta">总分：${formatBandScore(entry.totalScore)}</div>`);
      const skillScores = [
        ["听", entry.listeningScore],
        ["读", entry.readingScore],
        ["写", entry.writingScore],
        ["说", entry.speakingScore],
      ]
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => `${k}:${formatBandScore(v)}`)
        .join(" / ");
      if (skillScores) rows.push(`<div class="entry-meta">分项：${skillScores}</div>`);
      if (entry.note) rows.push(`<div class="entry-meta">备注：${entry.note}</div>`);

      return `
        <article class="entry-card">
          <div class="entry-header">
            <strong>${entry.entryType === "mock" ? "模考/真题" : "训练"}</strong>
            <button data-delete-id="${entry.id}" class="small-btn">删除</button>
          </div>
          ${rows.join("") || '<div class="entry-meta">（该记录字段均为空）</div>'}
        </article>
      `;
    })
    .join("");

  entriesContainerEl.querySelectorAll("[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await fetch(`/api/entries/${selectedDate}/${btn.dataset.deleteId}`, { method: "DELETE" });
      await refreshData();
      openDayPanel(selectedDate);
    });
  });
}

function openDayPanel(dateKey) {
  selectedDate = dateKey;
  selectedDateTitleEl.textContent = formatDateZh(dateKey);
  const entries = getEntriesForDate(dateKey);
  daySummaryEl.textContent = `记录 ${entries.length} 条，总训练 ${getDailyMinutes(dateKey)} 分钟`;
  renderEntryCards(dateKey);
}

function showPanel(viewMode) {
  Object.entries(panels).forEach(([key, el]) => {
    el.classList.toggle("hidden", key !== viewMode);
  });
  tabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === viewMode);
  });
}

async function persistViewMode(viewMode) {
  await fetch("/api/meta", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lastViewMode: viewMode }),
  });
}

function renderContributions() {
  contributionsCalendarEl.innerHTML = "";
  contributionsMonthsEl.innerHTML = "";
  const today = new Date();

  const start = new Date(today);
  start.setDate(start.getDate() - 364);

  // Align with Sunday-start week columns.
  start.setDate(start.getDate() - start.getDay());

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let lastMonthLabel = "";

  for (let w = 0; w < 53; w += 1) {
    let monthForLabel = null;
    for (let d = 0; d < 7; d += 1) {
      const probeDate = new Date(start);
      probeDate.setDate(start.getDate() + w * 7 + d);
      if (probeDate.getDate() === 1) {
        monthForLabel = monthNames[probeDate.getMonth()];
        break;
      }
    }

    if (w === 0 && !monthForLabel) {
      const firstCellDate = new Date(start);
      monthForLabel = monthNames[firstCellDate.getMonth()];
    }

    if (monthForLabel && monthForLabel !== lastMonthLabel) {
      const label = document.createElement("span");
      label.className = "month-label";
      label.textContent = monthForLabel;
      label.style.gridColumnStart = `${w + 1}`;
      contributionsMonthsEl.appendChild(label);
      lastMonthLabel = monthForLabel;
    }
  }

  for (let w = 0; w < 53; w += 1) {
    const col = document.createElement("div");
    col.className = "week-column";
    for (let d = 0; d < 7; d += 1) {
      const cellDate = new Date(start);
      cellDate.setDate(start.getDate() + w * 7 + d);
      const key = toDateKey(cellDate);

      const cell = document.createElement("button");
      cell.className = `day-cell level-${getIntensityLevel(getDailyMinutes(key))}`;
      cell.title = `${formatDateZh(key)} - ${getDailyMinutes(key)} 分钟`;
      cell.addEventListener("click", () => openDayPanel(key));

      const diff = (today - cellDate) / (1000 * 60 * 60 * 24);
      if (diff < 0) {
        cell.classList.add("empty");
        cell.disabled = true;
      }

      col.appendChild(cell);
    }
    contributionsCalendarEl.appendChild(col);
  }
}

function renderMonthCalendar() {
  monthCalendarEl.innerHTML = "";
  monthLabelEl.textContent = `${monthCursor.getFullYear()}年${monthCursor.getMonth() + 1}月`;

  const firstDay = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1);
  const startOffset = firstDay.getDay();
  const startDate = new Date(firstDay);
  startDate.setDate(1 - startOffset);

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    const dateKey = toDateKey(date);
    const inCurrentMonth = date.getMonth() === monthCursor.getMonth();

    const cell = document.createElement("div");
    cell.className = "month-cell";
    if (!inCurrentMonth) cell.classList.add("outside");
    if (dateKey === selectedDate) cell.classList.add("selected");
    cell.addEventListener("click", () => {
      openDayPanel(dateKey);
      renderMonthCalendar();
    });

    const minutes = getDailyMinutes(dateKey);
    cell.innerHTML = `
      <div class="date-num">${date.getDate()}</div>
      <div class="minutes">${minutes > 0 ? `${minutes} 分钟` : ""}</div>
    `;

    monthCalendarEl.appendChild(cell);
  }
}

function renderListView() {
  listContainerEl.innerHTML = "";
  const today = new Date();
  const groups = [];

  for (let i = 0; i < 30; i += 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = toDateKey(d);
    const entries = getEntriesForDate(key);
    if (entries.length > 0) {
      groups.push({ key, entries });
    }
  }

  if (groups.length === 0) {
    listContainerEl.innerHTML = '<div class="entry-card">最近 30 天暂无记录</div>';
    return;
  }

  listContainerEl.innerHTML = groups
    .map((group) => {
      const items = group.entries
        .map((entry) => {
          const bits = [];
          if (entry.title) bits.push(entry.title);
          if (entry.section) bits.push(entry.section);
              if (entry.durationMinutes !== null && entry.durationMinutes !== undefined) bits.push(`${entry.durationMinutes} 分钟`);
              if (entry.totalScore !== null && entry.totalScore !== undefined) bits.push(`总分 ${formatBandScore(entry.totalScore)}`);
          return `<li>${entry.entryType === "mock" ? "模考" : "训练"} - ${bits.join(" / ") || "空记录"}</li>`;
        })
        .join("");

      return `
        <section class="list-group">
          <h4>${formatDateZh(group.key)}（${getDailyMinutes(group.key)} 分钟）</h4>
          <ul>${items}</ul>
          <button data-open-date="${group.key}" class="small-btn">在右侧查看</button>
        </section>
      `;
    })
    .join("");

  listContainerEl.querySelectorAll("[data-open-date]").forEach((btn) => {
    btn.addEventListener("click", () => openDayPanel(btn.dataset.openDate));
  });
}

async function refreshData() {
  const response = await fetch("/api/entries");
  entriesByDate = await response.json();
  renderContributions();
  renderMonthCalendar();
  renderListView();
}

async function initViewMode() {
  const response = await fetch("/api/meta");
  const meta = await response.json();
  showPanel(meta.lastViewMode || "contributions");
}

entryFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(entryFormEl);
  const payload = {
    date: selectedDate,
    entryType: formData.get("entryType"),
    title: formData.get("title") || null,
    section: formData.get("section") || null,
    source: formData.get("source") || null,
    durationMinutes: formData.get("durationMinutes") || null,
    totalScore: formData.get("totalScore") || null,
    listeningScore: formData.get("listeningScore") || null,
    readingScore: formData.get("readingScore") || null,
    writingScore: formData.get("writingScore") || null,
    speakingScore: formData.get("speakingScore") || null,
    note: formData.get("note") || null,
  };

  await fetch("/api/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  entryFormEl.reset();
  manualTotalScore = false;
  delete totalScoreInput.dataset.autoCalculated;
  syncAutoTotalScore();
  await refreshData();
  openDayPanel(selectedDate);
});

skillScoreInputs.forEach((input) => {
  input.addEventListener("input", () => {
    syncAutoTotalScore();
  });
});

totalScoreInput.addEventListener("input", markTotalAsManual);

Array.from(tabs).forEach((tab) => {
  tab.addEventListener("click", async () => {
    const mode = tab.dataset.view;
    showPanel(mode);
    await persistViewMode(mode);
  });
});

document.getElementById("prev-month").addEventListener("click", () => {
  monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1);
  renderMonthCalendar();
});

document.getElementById("next-month").addEventListener("click", () => {
  monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);
  renderMonthCalendar();
});

(async function bootstrap() {
  await initViewMode();
  await refreshData();
  openDayPanel(selectedDate);
  syncAutoTotalScore();
})();


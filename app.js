const MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
const CALENDAR_24 = Array.from({ length: 24 }, (_, index) => {
  const year = 2026 + Math.floor(index / 12);
  return `${MONTHS[index % 12]} ${String(year).slice(2)}`;
});
const LOCAL_STORAGE_KEY = "cohort-economics-planner-state";

const DEFAULT_FUNNELS = [
  {
    id: "core",
    label: "Воронка 19.89",
    note: "Модель 19.89 с upsell ARPU и отдельной retention-кривой.",
    name: "$19.89 funnel",
    budgetStart: 250000,
    budgetEnd: 860000,
    cac: 27,
    avgCheck: 22,
    subscriptionPrice: 19.89,
    trialConversion: 69,
    month1Conversion: 50,
    stripeFee: 5.5,
    refundRate: 23,
    authorRate: 2,
    horizonMonths: 24,
    retentionConversions: [56, 65, 79, 80, 85, 85, 85, 85, 85],
  },
  {
    id: "upsell",
    label: "Воронка $1 -> $39",
    note: "Вход в продукт через $1 с последующей подпиской $39.",
    name: "$1 -> $39 funnel",
    budgetStart: 500000,
    budgetEnd: 3000000,
    cac: 14,
    avgCheck: 1,
    subscriptionPrice: 39,
    trialConversion: 100,
    month1Conversion: 40,
    stripeFee: 5.5,
    refundRate: 15,
    authorRate: 1,
    horizonMonths: 24,
    retentionConversions: [63, 70, 80, 80, 85, 85, 90, 90, 90],
  },
];

const DEFAULT_STATE = {
  selectedProfileId: "pavel",
  profiles: [
    { id: "pavel", name: "Павел", funnels: structuredClone(DEFAULT_FUNNELS) },
    { id: "darya", name: "Дарья", funnels: structuredClone(DEFAULT_FUNNELS) },
  ],
};

const uiState = {
  screen: "dashboard",
  selectedFunnelId: "core",
};

const state = structuredClone(DEFAULT_STATE);

const dashboardScreen = document.querySelector("#dashboard-screen");
const settingsScreen = document.querySelector("#settings-screen");
const heroHorizon = document.querySelector("#hero-horizon");
const saveStatus = document.querySelector("#save-status");
const saveMeta = document.querySelector("#save-meta");
const saveNowButton = document.querySelector("#save-now");
const screenTabs = document.querySelector("#screen-tabs");
const profileSelect = document.querySelector("#profile-select");
const addProfileButton = document.querySelector("#add-profile");
const deleteProfileButton = document.querySelector("#delete-profile");

let isBootstrapping = true;
let pendingSaveTimer = null;
let latestSaveRequestId = 0;
let latestAppliedSaveId = 0;

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMoneyPrecise(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value) {
  return `${Number(value).toFixed(1)}%`;
}

function formatThousands(value) {
  const sign = value < 0 ? "-" : "";
  return `${sign}${Math.round(Math.abs(value) / 1000)}K`;
}

function formatMillions(value) {
  return `${(value / 1000000).toFixed(1)}M`;
}

function formatTimestamp(value) {
  if (!value) {
    return "Изменения будут доступны всей команде по этой ссылке.";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Изменения сохранены в общей базе.";
  }

  return `Последнее сохранение: ${date.toLocaleString("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  })}`;
}

function setSaveUi(status, detail) {
  saveStatus.textContent = status;
  saveMeta.textContent = detail;
}

function loadLocalState() {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

function saveLocalState() {
  try {
    window.localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(serializeState()));
  } catch (error) {
    console.error(error);
  }
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function clampPositive(value) {
  return Math.max(0, Number(value) || 0);
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function interpolateBudget(start, end, index) {
  if (index === 0) return start;
  if (index === 11) return end;
  const step = (end - start) / 11;
  return start + step * index;
}

function buildMonthlyBudgets(funnel) {
  const start = clampPositive(funnel.budgetStart);
  const end = clampPositive(funnel.budgetEnd);
  return Array.from({ length: 24 }, (_, index) => (index < 12 ? interpolateBudget(start, end, index) : end));
}

function normalizeRetention(values, fallbackValues) {
  return fallbackValues.map((fallback, index) => {
    const candidate = Array.isArray(values) ? values[index] : fallback;
    return clampPercent(candidate ?? fallback);
  });
}

function sanitizeFunnel(candidate, fallback) {
  return {
    id: fallback.id,
    label: fallback.label,
    note: fallback.note,
    name: typeof candidate?.name === "string" && candidate.name.trim() ? candidate.name.trim() : fallback.name,
    budgetStart: clampPositive(candidate?.budgetStart ?? fallback.budgetStart),
    budgetEnd: clampPositive(candidate?.budgetEnd ?? fallback.budgetEnd),
    cac: clampPositive(candidate?.cac ?? fallback.cac),
    avgCheck: clampPositive(candidate?.avgCheck ?? fallback.avgCheck),
    subscriptionPrice: clampPositive(candidate?.subscriptionPrice ?? fallback.subscriptionPrice),
    trialConversion: clampPercent(candidate?.trialConversion ?? fallback.trialConversion),
    month1Conversion: clampPercent(candidate?.month1Conversion ?? fallback.month1Conversion),
    stripeFee: clampPercent(candidate?.stripeFee ?? fallback.stripeFee),
    refundRate: clampPercent(candidate?.refundRate ?? fallback.refundRate),
    authorRate: clampPercent(candidate?.authorRate ?? fallback.authorRate),
    horizonMonths: Math.max(12, Math.min(60, Math.round(Number(candidate?.horizonMonths ?? fallback.horizonMonths) || fallback.horizonMonths))),
    retentionConversions: normalizeRetention(candidate?.retentionConversions, fallback.retentionConversions),
  };
}

function sanitizeFunnels(candidateFunnels) {
  return DEFAULT_FUNNELS.map((fallback, index) => sanitizeFunnel(candidateFunnels?.[index], fallback));
}

function makeProfileId(name) {
  const base = String(name || "profile")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\wа-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20) || "profile";

  const used = new Set(state.profiles.map((profile) => profile.id));
  let nextId = base;
  let counter = 2;
  while (used.has(nextId)) {
    nextId = `${base}-${counter}`;
    counter += 1;
  }
  return nextId;
}

function sanitizeProfile(candidate, fallbackName = "Новый профиль") {
  const name = typeof candidate?.name === "string" && candidate.name.trim() ? candidate.name.trim() : fallbackName;
  return {
    id: typeof candidate?.id === "string" && candidate.id.trim() ? candidate.id.trim() : makeProfileId(name),
    name,
    funnels: sanitizeFunnels(candidate?.funnels),
  };
}

function normalizeLegacyPayload(candidate) {
  if (Array.isArray(candidate?.funnels) && candidate.funnels.length === 2) {
    return {
      selectedProfileId: "pavel",
      profiles: [
        { id: "pavel", name: "Павел", funnels: sanitizeFunnels(candidate.funnels) },
        { id: "darya", name: "Дарья", funnels: structuredClone(DEFAULT_FUNNELS) },
      ],
    };
  }

  return candidate;
}

function sanitizeState(candidate) {
  const normalized = normalizeLegacyPayload(candidate);
  const incomingProfiles = Array.isArray(normalized?.profiles) && normalized.profiles.length > 0
    ? normalized.profiles.map((profile, index) => sanitizeProfile(profile, DEFAULT_STATE.profiles[index]?.name ?? `Профиль ${index + 1}`))
    : structuredClone(DEFAULT_STATE.profiles);

  const selectedProfileId = incomingProfiles.some((profile) => profile.id === normalized?.selectedProfileId)
    ? normalized.selectedProfileId
    : incomingProfiles[0].id;

  return { selectedProfileId, profiles: incomingProfiles };
}

function applyState(nextState) {
  const sanitized = sanitizeState(nextState);
  state.selectedProfileId = sanitized.selectedProfileId;
  state.profiles = sanitized.profiles;
}

function serializeState() {
  return {
    selectedProfileId: state.selectedProfileId,
    profiles: state.profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      funnels: profile.funnels.map((funnel) => ({
        id: funnel.id,
        name: funnel.name,
        budgetStart: funnel.budgetStart,
        budgetEnd: funnel.budgetEnd,
        cac: funnel.cac,
        avgCheck: funnel.avgCheck,
        subscriptionPrice: funnel.subscriptionPrice,
        trialConversion: funnel.trialConversion,
        month1Conversion: funnel.month1Conversion,
        stripeFee: funnel.stripeFee,
        refundRate: funnel.refundRate,
        authorRate: funnel.authorRate,
        horizonMonths: funnel.horizonMonths,
        retentionConversions: [...funnel.retentionConversions],
      })),
    })),
  };
}

function getCurrentProfile() {
  return state.profiles.find((profile) => profile.id === state.selectedProfileId) ?? state.profiles[0];
}

function getCurrentFunnels() {
  return getCurrentProfile().funnels;
}

function retentionForAge(funnel, ageIndex) {
  const monthOffset = ageIndex - 2;
  return clampPercent(funnel.retentionConversions[Math.min(monthOffset, funnel.retentionConversions.length - 1)]) / 100;
}

function firstNetPerPayment(funnel) {
  return funnel.avgCheck * Math.max(0, 1 - funnel.stripeFee / 100 - funnel.refundRate / 100 - funnel.authorRate / 100);
}

function recurringNetPerPayment(funnel) {
  return funnel.subscriptionPrice * Math.max(0, 1 - funnel.stripeFee / 100);
}

function calculateFunnel(funnel) {
  const calendarRevenue24 = Array(24).fill(0);
  const monthlyBudgets = buildMonthlyBudgets(funnel);
  const cohortPaymentMatrix = Array.from({ length: 24 }, () => Array(24).fill(0));
  const cohortRows = [];
  const horizon = Math.max(12, Math.min(60, Math.round(funnel.horizonMonths)));
  const firstNet = firstNetPerPayment(funnel);
  const recurringNet = recurringNetPerPayment(funnel);

  for (let cohortIndex = 0; cohortIndex < 24; cohortIndex += 1) {
    const budget = monthlyBudgets[cohortIndex];
    const acquisitions = funnel.cac > 0 ? budget / funnel.cac : 0;
    const trialCount = acquisitions * (clampPercent(funnel.trialConversion) / 100);
    const firstPayments = trialCount * (clampPercent(funnel.month1Conversion) / 100);
    let activePaid = firstPayments;

    const income0 = firstPayments * firstNet;
    let income01 = income0;
    let income012 = income0;
    let incomeYear = income0;
    let lifetimeRevenue = income0;
    let revenue2026 = income0;
    calendarRevenue24[cohortIndex] += income0;
    cohortPaymentMatrix[cohortIndex][cohortIndex] = firstPayments;

    for (let age = 2; age <= horizon; age += 1) {
      activePaid *= retentionForAge(funnel, age);
      const revenue = activePaid * recurringNet;
      lifetimeRevenue += revenue;

      if (age === 2) {
        income01 += revenue;
        income012 += revenue;
      } else if (age === 3) {
        income012 += revenue;
      }

      if (age <= 12) {
        incomeYear += revenue;
      }

      const calendarMonth = cohortIndex + age - 1;
      if (calendarMonth < 24) {
        calendarRevenue24[calendarMonth] += revenue;
        cohortPaymentMatrix[cohortIndex][calendarMonth] = activePaid;
        if (calendarMonth < 12) {
          revenue2026 += revenue;
        }
      }
    }

    cohortRows.push({
      cohortLabel: CALENDAR_24[cohortIndex],
      budget,
      acquisitions,
      trialCount,
      firstPayments,
      income0,
      income01,
      income012,
      incomeYear,
      lifetimeRevenue,
      revenue2026,
      profit: revenue2026 - budget,
    });
  }

  const totalRevenue2026 = calendarRevenue24.slice(0, 12).reduce((sum, value) => sum + value, 0);
  const totalBudget = monthlyBudgets.reduce((sum, value) => sum + value, 0);
  const totalLifetimeRevenue = cohortRows.reduce((sum, row) => sum + row.lifetimeRevenue, 0);
  const totalFirstPayments = cohortRows.reduce((sum, row) => sum + row.firstPayments, 0);
  const monthlyBudget24 = Array.from({ length: 24 }, (_, index) => monthlyBudgets[index] ?? 0);
  const monthlyProfit24 = calendarRevenue24.map((revenue, index) => revenue - monthlyBudget24[index]);

  return {
    horizon,
    monthlyBudgets,
    cohortPaymentMatrix,
    cohortRows,
    calendarRevenue24,
    monthlyBudget24,
    monthlyProfit24,
    totalRevenue2026,
    totalBudget,
    totalLifetimeRevenue,
    totalProfit2026: totalRevenue2026 - totalBudget,
    totalFirstPayments,
    avgCAC: totalFirstPayments > 0 ? totalBudget / totalFirstPayments : 0,
    incomeYearTotal: cohortRows.reduce((sum, row) => sum + row.incomeYear, 0),
  };
}

function renderMetricCards(container, metrics) {
  container.innerHTML = metrics
    .map(({ label, value, tone }) => {
      const className = tone ? `metric-card ${tone}` : "metric-card";
      return `<article class="${className}"><span>${label}</span><strong>${value}</strong></article>`;
    })
    .join("");
}

function buildLineChart(values, color, fillColor) {
  const width = 760;
  const height = 360;
  const padding = { top: 18, right: 22, bottom: 42, left: 62 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...values, 1);
  const ticks = 4;
  const gradientId = `area-${Math.random().toString(36).slice(2, 10)}`;

  const x = (index) => padding.left + (innerWidth / Math.max(values.length - 1, 1)) * index;
  const y = (value) => padding.top + innerHeight - (value / maxValue) * innerHeight;

  const linePath = values.map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`).join(" ");
  const areaPath = `${linePath} L ${x(values.length - 1)} ${padding.top + innerHeight} L ${x(0)} ${padding.top + innerHeight} Z`;
  const grid = Array.from({ length: ticks + 1 }, (_, index) => {
    const ratio = index / ticks;
    return {
      value: maxValue * (1 - ratio),
      position: padding.top + innerHeight * ratio,
    };
  });

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Line chart">
      <defs>
        <linearGradient id="${gradientId}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="${fillColor}" />
          <stop offset="100%" stop-color="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      ${grid.map((tick) => `
        <line x1="${padding.left}" x2="${width - padding.right}" y1="${tick.position}" y2="${tick.position}" stroke="rgba(12,13,24,0.08)" stroke-width="1" />
        <text x="${padding.left - 10}" y="${tick.position + 4}" text-anchor="end" fill="#5d6073" font-size="11">${formatThousands(tick.value)}</text>
      `).join("")}
      ${CALENDAR_24.map((month, index) => index % 2 === 0 ? `<text x="${x(index)}" y="${height - 14}" text-anchor="middle" fill="#5d6073" font-size="10">${month}</text>` : "").join("")}
      <path d="${areaPath}" fill="url(#${gradientId})"></path>
      <path d="${linePath}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
      ${values.map((value, index) => `
        <circle cx="${x(index)}" cy="${y(value)}" r="4.5" fill="${color}" />
        <text x="${x(index)}" y="${y(value) - 12}" text-anchor="middle" fill="${color}" font-size="10" font-weight="700">${formatMillions(value)}</text>
      `).join("")}
    </svg>
  `;
}

function buildBarChart(values) {
  const width = 760;
  const height = 360;
  const padding = { top: 18, right: 22, bottom: 42, left: 62 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 0, 1);
  const range = maxValue - minValue || 1;
  const zeroY = padding.top + ((maxValue - 0) / range) * innerHeight;
  const barWidth = innerWidth / values.length - 12;
  const gridTicks = 4;

  const y = (value) => padding.top + ((maxValue - value) / range) * innerHeight;
  const x = (index) => padding.left + (innerWidth / values.length) * index + 6;

  const grid = Array.from({ length: gridTicks + 1 }, (_, index) => {
    const ratio = index / gridTicks;
    return {
      value: maxValue - range * ratio,
      position: padding.top + innerHeight * ratio,
    };
  });

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Bar chart">
      ${grid.map((tick) => `
        <line x1="${padding.left}" x2="${width - padding.right}" y1="${tick.position}" y2="${tick.position}" stroke="rgba(12,13,24,0.08)" stroke-width="1" />
        <text x="${padding.left - 10}" y="${tick.position + 4}" text-anchor="end" fill="#5d6073" font-size="11">${formatThousands(tick.value)}</text>
      `).join("")}
      <line x1="${padding.left}" x2="${width - padding.right}" y1="${zeroY}" y2="${zeroY}" stroke="rgba(12,13,24,0.18)" stroke-width="1.2" />
      ${values.map((value, index) => {
        const currentY = y(Math.max(value, 0));
        const heightValue = Math.abs(y(value) - zeroY);
        const barY = value >= 0 ? currentY : zeroY;
        const fill = value >= 0 ? "rgba(111, 76, 255, 0.92)" : "rgba(239, 68, 68, 0.92)";
        return `
          <rect x="${x(index)}" y="${barY}" width="${Math.max(barWidth, 8)}" height="${Math.max(heightValue, 2)}" rx="10" fill="${fill}" />
          <text x="${x(index) + Math.max(barWidth, 8) / 2}" y="${height - 14}" text-anchor="middle" fill="#5d6073" font-size="10">${index % 2 === 0 ? CALENDAR_24[index] : ""}</text>
          <text x="${x(index) + Math.max(barWidth, 8) / 2}" y="${value >= 0 ? barY - 8 : barY + Math.max(heightValue, 2) + 12}" text-anchor="middle" fill="${fill}" font-size="10" font-weight="700">${formatMillions(value)}</text>
        `;
      }).join("")}
    </svg>
  `;
}

function renderCohortRows(tbody, calculation) {
  tbody.innerHTML = calculation.cohortRows
    .map((row) => `
      <tr>
        <td>${row.cohortLabel}</td>
        <td>${formatMoney(row.budget)}</td>
        <td>${formatNumber(row.acquisitions)}</td>
        <td>${formatNumber(row.firstPayments)}</td>
        <td>${formatMoney(row.income0)}</td>
        <td>${formatMoney(row.income01)}</td>
        <td>${formatMoney(row.income012)}</td>
        <td>${formatMoney(row.incomeYear)}</td>
        <td>${formatMoney(row.lifetimeRevenue)}</td>
        <td>${formatMoney(row.revenue2026)}</td>
        <td class="${row.profit >= 0 ? "value-positive" : "value-negative"}">${formatMoney(row.profit)}</td>
      </tr>
    `)
    .join("");
}

function renderMonthPlanRows(calculation, funnel, tbody) {
  tbody.innerHTML = CALENDAR_24.map((month, monthIndex) => {
    const budget = calculation.monthlyBudgets[monthIndex];
    const acquisitions = funnel.cac > 0 ? budget / funnel.cac : 0;
    const trial = acquisitions * (clampPercent(funnel.trialConversion) / 100);
    const firstPayments = trial * (clampPercent(funnel.month1Conversion) / 100);

    return `
      <tr>
        <td>${month}</td>
        <td>${formatMoney(budget)}</td>
        <td>${formatNumber(acquisitions)}</td>
        <td>${formatNumber(trial)}</td>
        <td>${formatNumber(firstPayments)}</td>
      </tr>
    `;
  }).join("");
}

function buildCohortMatrix(calculation) {
  return `
    <div class="subpanel">
      <div class="subpanel-heading">
        <div>
          <h3>Матрица когорт по месяцам</h3>
          <p>Строки — когорты запуска, столбцы — календарные месяцы. В ячейках число оплат этой когорты в конкретный месяц.</p>
        </div>
      </div>
      <div class="table-wrap compact-matrix">
        <table class="compact-table">
          <thead>
            <tr>
              <th>Когорта</th>
              ${CALENDAR_24.map((month) => `<th>${month}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${calculation.cohortRows.map((row, rowIndex) => `
              <tr>
                <td>${row.cohortLabel}</td>
                ${calculation.cohortPaymentMatrix[rowIndex].map((value, columnIndex) => `
                  <td>${columnIndex < rowIndex || value <= 0 ? "—" : formatNumber(value)}</td>
                `).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderRetentionFields(funnelIndex, funnels, container) {
  container.innerHTML = Array.from({ length: 9 }, (_, offset) => {
    const monthNumber = offset + 2;
    return `
      <label>
        <span>Конверсия в ${monthNumber}-й платеж, %</span>
        <input
          data-action="retention"
          data-funnel-index="${funnelIndex}"
          data-retention-index="${offset}"
          type="number"
          min="0"
          max="100"
          step="0.1"
          value="${funnels[funnelIndex].retentionConversions[offset]}"
        />
      </label>
    `;
  }).join("");
}

function renderDashboard(calculations) {
  const profile = getCurrentProfile();
  const totalRevenue = calculations.reduce((sum, item) => sum + item.calendarRevenue24.reduce((a, b) => a + b, 0), 0);
  const totalBudget = calculations.reduce((sum, item) => sum + item.monthlyBudget24.reduce((a, b) => a + b, 0), 0);
  const totalProfit = totalRevenue - totalBudget;
  const horizon = Math.max(...calculations.map((item) => item.horizon));

  const combinedRevenue = Array.from({ length: 24 }, (_, index) => calculations.reduce((sum, item) => sum + item.calendarRevenue24[index], 0));
  const combinedProfit = Array.from({ length: 24 }, (_, index) => calculations.reduce((sum, item) => sum + item.monthlyProfit24[index], 0));
  const combinedAdCost = Array.from({ length: 24 }, (_, index) => calculations.reduce((sum, item) => sum + item.monthlyBudget24[index], 0));

  heroHorizon.textContent = `${horizon} мес`;

  dashboardScreen.innerHTML = `
    <div class="dashboard-layout">
      <div class="dashboard-header"></div>
      <div class="charts-grid">
        <article class="chart-card">
          <div class="chart-header">
            <div>
              <p class="panel-kicker">Main chart</p>
              <h2>Оборот по месяцам</h2>
            <p>Профиль ${profile.name}. Чистая выручка по календарным месяцам на 24 месяца вперед.</p>
            </div>
            <div class="chart-total">
              <span>Итого за 24 мес</span>
              <strong>${formatMoney(totalRevenue)}</strong>
            </div>
          </div>
          <div class="chart-shell">${buildLineChart(combinedRevenue, "#6f4cff", "rgba(111,76,255,0.28)")}</div>
          <div class="chart-legend">
            <div class="chart-legend-item"><span class="chart-legend-swatch" style="background:#6f4cff"></span>Оборот</div>
          </div>
        </article>

        <article class="chart-card">
          <div class="chart-header">
            <div>
              <p class="panel-kicker">Profit chart</p>
              <h2>Прибыль по месяцам</h2>
            <p>Оборот минус рекламный бюджет по календарным месяцам на 24 месяца.</p>
            </div>
            <div class="chart-total">
              <span>Итого за 24 мес</span>
              <strong class="${totalProfit >= 0 ? "value-positive" : "value-negative"}">${formatMoney(totalProfit)}</strong>
            </div>
          </div>
          <div class="chart-shell">${buildBarChart(combinedProfit)}</div>
          <div class="chart-legend">
            <div class="chart-legend-item"><span class="chart-legend-swatch" style="background:#6f4cff"></span>Плюсовые месяцы</div>
            <div class="chart-legend-item"><span class="chart-legend-swatch" style="background:#ef4444"></span>Минусовые месяцы</div>
          </div>
        </article>
      </div>

      <div class="dashboard-tables">
        <section class="panel">
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Summary</p>
              <h2>Итоговые метрики</h2>
            </div>
            <p class="panel-note">Сводка по текущему профилю и двум воронкам.</p>
          </div>
          <div class="summary-grid"></div>
        </section>

        <section class="panel">
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Monthly table</p>
              <h2>Помесячный итог</h2>
            </div>
            <p class="panel-note">Чистый оборот, прибыль и рекламный кост по календарным месяцам.</p>
          </div>
          <div class="table-wrap compact-table">
            <table class="compact-table">
              <thead>
                <tr>
                  <th>Месяц</th>
                  <th>Оборот, $</th>
                  <th>Прибыль, $</th>
                  <th>Рекламный кост, $</th>
                </tr>
              </thead>
              <tbody>
                ${combinedRevenue.map((revenue, index) => `
                  <tr>
                    <td>${CALENDAR_24[index]}</td>
                    <td>${formatMoney(revenue)}</td>
                    <td class="${combinedProfit[index] >= 0 ? "value-positive" : "value-negative"}">${formatMoney(combinedProfit[index])}</td>
                    <td>${formatMoney(combinedAdCost[index])}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  `;

  renderMetricCards(dashboardScreen.querySelector(".dashboard-header"), [
    { label: "Оборот 24 мес", value: formatMoney(totalRevenue) },
    { label: "Бюджет 24 мес", value: formatMoney(totalBudget) },
    { label: "Прибыль 24 мес", value: formatMoney(totalProfit), tone: totalProfit >= 0 ? "positive" : "negative" },
    { label: "Профиль", value: profile.name },
  ]);

  renderMetricCards(dashboardScreen.querySelector(".summary-grid"), [
    { label: "Воронка 19.89", value: formatMoney(calculations[0].calendarRevenue24.reduce((a, b) => a + b, 0)) },
    { label: "Воронка $1 -> $39", value: formatMoney(calculations[1].calendarRevenue24.reduce((a, b) => a + b, 0)) },
    { label: "Income год", value: formatMoney(calculations[0].incomeYearTotal + calculations[1].incomeYearTotal) },
    { label: "Horizon", value: `${horizon} мес` },
  ]);
}

function renderSettings(calculations) {
  const funnels = getCurrentFunnels();

  settingsScreen.innerHTML = `
    <div class="settings-shell">
      <div class="funnel-tabs">
        ${funnels.map((funnel) => `
          <button class="funnel-switch ${uiState.selectedFunnelId === funnel.id ? "is-active" : ""}" data-funnel-tab="${funnel.id}" type="button">
            ${funnel.label}
          </button>
        `).join("")}
      </div>
      <div id="funnel-screens"></div>
    </div>
  `;

  const screens = settingsScreen.querySelector("#funnel-screens");
  const template = document.querySelector("#funnel-template");

  funnels.forEach((funnel, index) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const calculation = calculations[index];

    node.classList.add("funnel-screen");
    if (uiState.selectedFunnelId !== funnel.id) {
      node.classList.add("hidden");
    }

    node.querySelector(".panel-kicker").textContent = funnel.label;
    node.querySelector("h2").textContent = funnel.name;
    node.querySelector(".panel-note").textContent = funnel.note;

    node.querySelectorAll("[data-field]").forEach((input) => {
      const field = input.dataset.field;
      input.value = funnel[field];
      input.dataset.funnelIndex = index;
    });

    renderMonthPlanRows(calculation, funnel, node.querySelector("[data-month-plan]"));
    renderRetentionFields(index, funnels, node.querySelector("[data-retention-grid]"));

    renderMetricCards(node.querySelector("[data-funnel-metrics]"), [
      { label: "Income0", value: formatMoney(calculation.cohortRows[0]?.income0 ?? 0) },
      { label: "Income01", value: formatMoney(calculation.cohortRows[0]?.income01 ?? 0) },
      { label: "Income012", value: formatMoney(calculation.cohortRows[0]?.income012 ?? 0) },
      { label: "Income год", value: formatMoney(calculation.cohortRows[0]?.incomeYear ?? 0) },
      { label: "Выручка 24 мес", value: formatMoney(calculation.calendarRevenue24.reduce((a, b) => a + b, 0)) },
      { label: "Бюджет 24 мес", value: formatMoney(calculation.monthlyBudget24.reduce((a, b) => a + b, 0)) },
      {
        label: "Прибыль 24 мес",
        value: formatMoney(
          calculation.calendarRevenue24.reduce((a, b) => a + b, 0) -
          calculation.monthlyBudget24.reduce((a, b) => a + b, 0),
        ),
        tone:
          calculation.calendarRevenue24.reduce((a, b) => a + b, 0) -
            calculation.monthlyBudget24.reduce((a, b) => a + b, 0) >=
          0
            ? "positive"
            : "negative",
      },
      { label: "CAC / первая оплата", value: formatMoneyPrecise(calculation.avgCAC) },
    ]);

    renderCohortRows(node.querySelector("[data-cohort-results]"), calculation);
    node.insertAdjacentHTML("beforeend", buildCohortMatrix(calculation));
    screens.appendChild(node);
  });
}

function syncScreenState() {
  dashboardScreen.classList.toggle("hidden", uiState.screen !== "dashboard");
  settingsScreen.classList.toggle("hidden", uiState.screen !== "settings");
  screenTabs.querySelectorAll("[data-screen]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.screen === uiState.screen);
  });
}

function renderProfileControls() {
  profileSelect.innerHTML = state.profiles
    .map((profile) => `<option value="${profile.id}" ${profile.id === state.selectedProfileId ? "selected" : ""}>${profile.name}</option>`)
    .join("");
  deleteProfileButton.disabled = state.profiles.length <= 1;
}

function render() {
  const calculations = getCurrentFunnels().map((funnel) => calculateFunnel(funnel));
  renderProfileControls();
  renderDashboard(calculations);
  renderSettings(calculations);
  syncScreenState();
}

function updateField(funnelIndex, field, value) {
  const funnel = getCurrentFunnels()[funnelIndex];
  if (!funnel) {
    return;
  }

  if (field === "name") {
    funnel.name = value;
    return;
  }

  const numericFields = [
    "budgetStart",
    "budgetEnd",
    "cac",
    "avgCheck",
    "subscriptionPrice",
    "trialConversion",
    "month1Conversion",
    "stripeFee",
    "refundRate",
    "authorRate",
    "horizonMonths",
  ];

  if (numericFields.includes(field)) {
    funnel[field] = Number(value) || 0;
  }
}

function addProfile() {
  const name = window.prompt("Имя нового профиля", `Профиль ${state.profiles.length + 1}`);
  if (!name || !name.trim()) return;

  const currentProfile = getCurrentProfile();
  const profile = {
    id: makeProfileId(name.trim()),
    name: name.trim(),
    funnels: structuredClone(currentProfile.funnels),
  };

  state.profiles.push(profile);
  state.selectedProfileId = profile.id;
  render();
  saveLocalState();
  scheduleSave();
}

function deleteCurrentProfile() {
  if (state.profiles.length <= 1) return;
  const profile = getCurrentProfile();
  if (!window.confirm(`Удалить профиль "${profile.name}"?`)) return;

  state.profiles = state.profiles.filter((item) => item.id !== profile.id);
  state.selectedProfileId = state.profiles[0].id;
  render();
  saveLocalState();
  scheduleSave();
}

async function fetchSharedState() {
  const response = await fetch("/api/config", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Load failed: ${response.status}`);
  return response.json();
}

async function persistSharedState(reason = "autosave") {
  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }

  latestSaveRequestId += 1;
  const requestId = latestSaveRequestId;
  saveNowButton.disabled = true;
  setSaveUi("Сохранение…", reason === "manual" ? "Отправляю изменения в общую базу." : "Изменения автоматически сохраняются для всей команды.");

  try {
    const response = await fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: serializeState() }),
    });
    if (!response.ok) throw new Error(`Save failed: ${response.status}`);

    const result = await response.json();
    if (requestId < latestAppliedSaveId) return;
    latestAppliedSaveId = requestId;
    saveLocalState();
    setSaveUi("Сохранено", formatTimestamp(result.updatedAt));
  } catch (error) {
    console.error(error);
    saveLocalState();
    setSaveUi("Сохранено локально", "На localhost данные и графики обновляются сразу по выбранному профилю.");
  } finally {
    saveNowButton.disabled = false;
  }
}

function scheduleSave() {
  if (isBootstrapping) return;
  if (pendingSaveTimer) clearTimeout(pendingSaveTimer);

  saveNowButton.disabled = false;
  setSaveUi("Есть несохраненные изменения", "Через секунду обновлю общую базу данных.");
  pendingSaveTimer = setTimeout(() => {
    void persistSharedState("autosave");
  }, 900);
}

document.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;

  if (target.dataset.field) {
    updateField(Number(target.dataset.funnelIndex), target.dataset.field, target.value);
    render();
    scheduleSave();
    return;
  }

  const funnelIndex = Number(target.dataset.funnelIndex);
  const retentionIndex = Number(target.dataset.retentionIndex);
  const funnel = getCurrentFunnels()[funnelIndex];
  if (!funnel) return;

  if (target.dataset.action === "retention") {
    funnel.retentionConversions[retentionIndex] = clampPercent(target.value);
    render();
    scheduleSave();
  }
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const screenButton = target.closest("[data-screen]");
  if (screenButton instanceof HTMLButtonElement) {
    uiState.screen = screenButton.dataset.screen;
    syncScreenState();
    return;
  }

  const funnelButton = target.closest("[data-funnel-tab]");
  if (funnelButton instanceof HTMLButtonElement) {
    uiState.selectedFunnelId = funnelButton.dataset.funnelTab;
    render();
  }
});

profileSelect.addEventListener("change", () => {
  state.selectedProfileId = profileSelect.value;
  render();
  saveLocalState();
  scheduleSave();
});

addProfileButton.addEventListener("click", addProfile);
deleteProfileButton.addEventListener("click", deleteCurrentProfile);
saveNowButton.addEventListener("click", () => { void persistSharedState("manual"); });

async function bootstrap() {
  render();
  saveNowButton.disabled = true;
  setSaveUi("Загрузка…", "Подтягиваю сохраненные настройки из общей базы.");

  try {
    const result = await fetchSharedState();
    if (result?.payload) {
      applyState(result.payload);
      render();
      saveLocalState();
      setSaveUi("Синхронизировано", formatTimestamp(result.updatedAt));
    } else {
      setSaveUi("База пуста", "Пока загружены стартовые значения. Первое изменение создаст общую запись.");
    }
  } catch (error) {
    console.error(error);
    const localState = loadLocalState();
    if (localState) {
      applyState(localState);
      render();
      setSaveUi("Локальный режим", "Загружены локально сохраненные профили. Переключение профиля сразу обновляет графики.");
    } else {
      setSaveUi("Локальный режим", "Сервер сохранения недоступен. Профили и графики будут сохраняться только в этом браузере.");
    }
  } finally {
    isBootstrapping = false;
    saveNowButton.disabled = false;
  }
}

void bootstrap();

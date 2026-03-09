const MONTHS = [
  "Янв",
  "Фев",
  "Мар",
  "Апр",
  "Май",
  "Июн",
  "Июл",
  "Авг",
  "Сен",
  "Окт",
  "Ноя",
  "Дек",
];

const DEFAULT_STATE = {
  funnels: [
    {
      id: "core",
      label: "Воронка 19.89",
      note: "Базовая подписка с первым платежом 19.89 и тем же recurring ARPU.",
      name: "19.89 offer",
      firstPrice: 19.89,
      recurringPrice: 19.89,
      trialConversion: 42,
      month1Conversion: 68,
      horizonMonths: 24,
      monthlyVolume: [140000, 148000, 156000, 164000, 172000, 180000, 190000, 202000, 216000, 232000, 248000, 264000],
      monthlyBudget: [250000, 290000, 330000, 380000, 430000, 470000, 520000, 580000, 650000, 720000, 790000, 860000],
      retentionConversions: [84, 81, 78, 76, 74, 72, 70, 69, 68],
    },
    {
      id: "upsell",
      label: "Воронка $1 -> $39",
      note: "Первый платеж 1 доллар, затем 39 долларов в recurring.",
      name: "$1 -> $39",
      firstPrice: 1,
      recurringPrice: 39,
      trialConversion: 37,
      month1Conversion: 61,
      horizonMonths: 24,
      monthlyVolume: [120000, 128000, 136000, 145000, 154000, 166000, 178000, 191000, 204000, 218000, 232000, 246000],
      monthlyBudget: [500000, 730000, 960000, 1180000, 1400000, 1620000, 1850000, 2080000, 2310000, 2540000, 2770000, 3000000],
      retentionConversions: [88, 84, 81, 79, 77, 75, 74, 73, 72],
    },
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
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
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

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function clampPositive(value) {
  return Math.max(0, Number(value) || 0);
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeArray(values, fallbackValues) {
  return fallbackValues.map((fallback, index) => {
    const candidate = Array.isArray(values) ? values[index] : fallback;
    return clampPositive(candidate ?? fallback);
  });
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
    name: typeof candidate?.name === "string" && candidate.name.trim()
      ? candidate.name.trim()
      : fallback.name,
    firstPrice: clampPositive(candidate?.firstPrice ?? fallback.firstPrice),
    recurringPrice: clampPositive(candidate?.recurringPrice ?? fallback.recurringPrice),
    trialConversion: clampPercent(candidate?.trialConversion ?? fallback.trialConversion),
    month1Conversion: clampPercent(candidate?.month1Conversion ?? fallback.month1Conversion),
    horizonMonths: Math.max(
      12,
      Math.min(60, Math.round(Number(candidate?.horizonMonths ?? fallback.horizonMonths) || fallback.horizonMonths)),
    ),
    monthlyVolume: normalizeArray(candidate?.monthlyVolume, fallback.monthlyVolume),
    monthlyBudget: normalizeArray(candidate?.monthlyBudget, fallback.monthlyBudget),
    retentionConversions: normalizeRetention(
      candidate?.retentionConversions,
      fallback.retentionConversions,
    ),
  };
}

function sanitizeState(candidate) {
  return {
    funnels: DEFAULT_STATE.funnels.map((fallback, index) =>
      sanitizeFunnel(candidate?.funnels?.[index], fallback),
    ),
  };
}

function applyState(nextState) {
  const sanitized = sanitizeState(nextState);
  state.funnels = sanitized.funnels;
}

function serializeState() {
  return {
    funnels: state.funnels.map((funnel) => ({
      id: funnel.id,
      name: funnel.name,
      firstPrice: funnel.firstPrice,
      recurringPrice: funnel.recurringPrice,
      trialConversion: funnel.trialConversion,
      month1Conversion: funnel.month1Conversion,
      horizonMonths: funnel.horizonMonths,
      monthlyVolume: [...funnel.monthlyVolume],
      monthlyBudget: [...funnel.monthlyBudget],
      retentionConversions: [...funnel.retentionConversions],
    })),
  };
}

function getRetentionForAge(funnel, ageIndex) {
  if (ageIndex <= 1) {
    return 1;
  }

  const monthOffset = ageIndex - 2;
  return funnel.retentionConversions[
    Math.min(monthOffset, funnel.retentionConversions.length - 1)
  ] / 100;
}

function calculateFunnel(funnel) {
  const calendarRevenue = Array(12).fill(0);
  const cohortRows = [];
  const horizon = Math.max(12, Math.min(60, Math.round(funnel.horizonMonths)));

  for (let cohortIndex = 0; cohortIndex < 12; cohortIndex += 1) {
    const incoming = clampPositive(funnel.monthlyVolume[cohortIndex]);
    const budget = clampPositive(funnel.monthlyBudget[cohortIndex]);
    const trialCount = incoming * (clampPercent(funnel.trialConversion) / 100);
    const firstPayments = trialCount * (clampPercent(funnel.month1Conversion) / 100);
    let activePaid = firstPayments;
    let lifetimeRevenue = activePaid * funnel.firstPrice;
    let revenue2026 = activePaid * funnel.firstPrice;

    calendarRevenue[cohortIndex] += activePaid * funnel.firstPrice;

    for (let age = 2; age <= horizon; age += 1) {
      activePaid *= getRetentionForAge(funnel, age);
      const revenue = activePaid * funnel.recurringPrice;
      lifetimeRevenue += revenue;
      const calendarMonth = cohortIndex + age - 1;
      if (calendarMonth < 12) {
        calendarRevenue[calendarMonth] += revenue;
        revenue2026 += revenue;
      }
    }

    cohortRows.push({
      cohortLabel: MONTHS[cohortIndex],
      incoming,
      trialCount,
      firstPayments,
      lifetimeRevenue,
      revenue2026,
      budget,
      profit: revenue2026 - budget,
    });
  }

  const totalRevenue2026 = calendarRevenue.reduce((sum, value) => sum + value, 0);
  const totalBudget = funnel.monthlyBudget.reduce((sum, value) => sum + clampPositive(value), 0);
  const totalLifetimeRevenue = cohortRows.reduce((sum, row) => sum + row.lifetimeRevenue, 0);
  const totalFirstPayments = cohortRows.reduce((sum, row) => sum + row.firstPayments, 0);
  const monthlyProfit = calendarRevenue.map((revenue, index) => revenue - clampPositive(funnel.monthlyBudget[index]));

  return {
    horizon,
    cohortRows,
    calendarRevenue,
    monthlyProfit,
    totalRevenue2026,
    totalBudget,
    totalLifetimeRevenue,
    totalProfit2026: totalRevenue2026 - totalBudget,
    totalFirstPayments,
    avgCAC: totalFirstPayments > 0 ? totalBudget / totalFirstPayments : 0,
    avgRevenuePerPayment:
      totalFirstPayments > 0 ? totalLifetimeRevenue / totalFirstPayments : 0,
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

  const x = (index) =>
    padding.left + (innerWidth / Math.max(values.length - 1, 1)) * index;
  const y = (value) =>
    padding.top + innerHeight - (value / maxValue) * innerHeight;

  const linePath = values
    .map((value, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(value)}`)
    .join(" ");

  const areaPath = `${linePath} L ${x(values.length - 1)} ${padding.top + innerHeight} L ${x(0)} ${padding.top + innerHeight} Z`;

  const grid = Array.from({ length: ticks + 1 }, (_, index) => {
    const ratio = index / ticks;
    const value = maxValue * (1 - ratio);
    const position = padding.top + innerHeight * ratio;
    return {
      value,
      position,
    };
  });

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Line chart">
      <defs>
        <linearGradient id="area-${color.replace(/[^a-z0-9]/gi, "")}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="${fillColor}" />
          <stop offset="100%" stop-color="rgba(255,255,255,0)" />
        </linearGradient>
      </defs>
      ${grid
        .map(
          (tick) => `
            <line x1="${padding.left}" x2="${width - padding.right}" y1="${tick.position}" y2="${tick.position}" stroke="rgba(12,13,24,0.08)" stroke-width="1" />
            <text x="${padding.left - 10}" y="${tick.position + 4}" text-anchor="end" fill="#5d6073" font-size="11">${formatMoney(tick.value)}</text>
          `,
        )
        .join("")}
      ${MONTHS.map(
        (month, index) => `
          <text x="${x(index)}" y="${height - 14}" text-anchor="middle" fill="#5d6073" font-size="11">${month}</text>
        `,
      ).join("")}
      <path d="${areaPath}" fill="url(#area-${color.replace(/[^a-z0-9]/gi, "")})"></path>
      <path d="${linePath}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
      ${values
        .map(
          (value, index) => `
            <circle cx="${x(index)}" cy="${y(value)}" r="4.5" fill="${color}" />
          `,
        )
        .join("")}
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
    const value = maxValue - range * ratio;
    const position = padding.top + innerHeight * ratio;
    return { value, position };
  });

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Bar chart">
      ${grid
        .map(
          (tick) => `
            <line x1="${padding.left}" x2="${width - padding.right}" y1="${tick.position}" y2="${tick.position}" stroke="rgba(12,13,24,0.08)" stroke-width="1" />
            <text x="${padding.left - 10}" y="${tick.position + 4}" text-anchor="end" fill="#5d6073" font-size="11">${formatMoney(tick.value)}</text>
          `,
        )
        .join("")}
      <line x1="${padding.left}" x2="${width - padding.right}" y1="${zeroY}" y2="${zeroY}" stroke="rgba(12,13,24,0.18)" stroke-width="1.2" />
      ${values
        .map((value, index) => {
          const currentY = y(Math.max(value, 0));
          const heightValue = Math.abs(y(value) - zeroY);
          const barY = value >= 0 ? currentY : zeroY;
          const fill = value >= 0 ? "rgba(111, 76, 255, 0.92)" : "rgba(239, 68, 68, 0.92)";
          return `
            <rect x="${x(index)}" y="${barY}" width="${Math.max(barWidth, 8)}" height="${Math.max(heightValue, 2)}" rx="10" fill="${fill}" />
            <text x="${x(index) + Math.max(barWidth, 8) / 2}" y="${height - 14}" text-anchor="middle" fill="#5d6073" font-size="11">${MONTHS[index]}</text>
          `;
        })
        .join("")}
    </svg>
  `;
}

function renderCohortRows(tbody, calculation) {
  tbody.innerHTML = calculation.cohortRows
    .map(
      (row) => `
      <tr>
        <td>${row.cohortLabel}</td>
        <td>${formatNumber(row.incoming)}</td>
        <td>${formatNumber(row.trialCount)}</td>
        <td>${formatNumber(row.firstPayments)}</td>
        <td>${formatMoney(row.lifetimeRevenue)}</td>
        <td>${formatMoney(row.revenue2026)}</td>
        <td>${formatMoney(row.budget)}</td>
        <td class="${row.profit >= 0 ? "value-positive" : "value-negative"}">${formatMoney(row.profit)}</td>
      </tr>
    `,
    )
    .join("");
}

function renderMonthPlanRows(funnelIndex, tbody) {
  tbody.innerHTML = MONTHS.map(
    (month, monthIndex) => `
      <tr>
        <td>${month}</td>
        <td>
          <input
            data-action="volume"
            data-funnel-index="${funnelIndex}"
            data-month-index="${monthIndex}"
            type="number"
            min="0"
            step="1"
            value="${state.funnels[funnelIndex].monthlyVolume[monthIndex]}"
          />
        </td>
        <td>
          <input
            data-action="budget"
            data-funnel-index="${funnelIndex}"
            data-month-index="${monthIndex}"
            type="number"
            min="0"
            step="1000"
            value="${state.funnels[funnelIndex].monthlyBudget[monthIndex]}"
          />
        </td>
      </tr>
    `,
  ).join("");
}

function renderRetentionFields(funnelIndex, container) {
  container.innerHTML = Array.from({ length: 9 }, (_, offset) => {
    const monthNumber = offset + 2;
    return `
      <label>
        <span>Оплата в ${monthNumber}-й месяц, %</span>
        <input
          data-action="retention"
          data-funnel-index="${funnelIndex}"
          data-retention-index="${offset}"
          type="number"
          min="0"
          max="100"
          step="0.1"
          value="${state.funnels[funnelIndex].retentionConversions[offset]}"
        />
      </label>
    `;
  }).join("");
}

function renderDashboard(calculations) {
  const totalRevenue = calculations.reduce((sum, item) => sum + item.totalRevenue2026, 0);
  const totalBudget = calculations.reduce((sum, item) => sum + item.totalBudget, 0);
  const totalProfit = totalRevenue - totalBudget;
  const totalLifetimeRevenue = calculations.reduce((sum, item) => sum + item.totalLifetimeRevenue, 0);
  const horizon = Math.max(...calculations.map((item) => item.horizon));

  const combinedRevenue = Array.from({ length: 12 }, (_, index) =>
    calculations.reduce((sum, item) => sum + item.calendarRevenue[index], 0),
  );
  const combinedProfit = Array.from({ length: 12 }, (_, index) =>
    calculations.reduce((sum, item) => sum + item.monthlyProfit[index], 0),
  );

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
              <p>Календарная выручка двух воронок в рамках 2026 года.</p>
            </div>
            <div class="chart-total">
              <span>Итого за 2026</span>
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
              <p>Оборот минус рекламный кост по календарным месяцам.</p>
            </div>
            <div class="chart-total">
              <span>Итого за 2026</span>
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
            <p class="panel-note">Главная сводка по двум воронкам и общему горизонту модели.</p>
          </div>
          <div class="summary-grid"></div>
        </section>

        <section class="panel">
          <div class="panel-heading">
            <div>
              <p class="panel-kicker">Monthly table</p>
              <h2>Помесячный итог</h2>
            </div>
            <p class="panel-note">Оборот и прибыль по календарным месяцам.</p>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Месяц</th>
                  <th>Оборот, $</th>
                  <th>Прибыль, $</th>
                </tr>
              </thead>
              <tbody>
                ${combinedRevenue
                  .map(
                    (revenue, index) => `
                      <tr>
                        <td>${MONTHS[index]}</td>
                        <td>${formatMoney(revenue)}</td>
                        <td class="${combinedProfit[index] >= 0 ? "value-positive" : "value-negative"}">${formatMoney(combinedProfit[index])}</td>
                      </tr>
                    `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  `;

  renderMetricCards(dashboardScreen.querySelector(".dashboard-header"), [
    { label: "Оборот 2026", value: formatMoney(totalRevenue) },
    { label: "Рекламный бюджет", value: formatMoney(totalBudget) },
    {
      label: "Прибыль после рекламы",
      value: formatMoney(totalProfit),
      tone: totalProfit >= 0 ? "positive" : "negative",
    },
    { label: "Lifetime revenue", value: formatMoney(totalLifetimeRevenue) },
  ]);

  renderMetricCards(dashboardScreen.querySelector(".summary-grid"), [
    {
      label: "Воронка 19.89",
      value: formatMoney(calculations[0].totalRevenue2026),
    },
    {
      label: "Воронка $1 -> $39",
      value: formatMoney(calculations[1].totalRevenue2026),
    },
    {
      label: "Общая прибыль",
      value: formatMoney(totalProfit),
      tone: totalProfit >= 0 ? "positive" : "negative",
    },
    {
      label: "Горизонт",
      value: `${horizon} мес`,
    },
  ]);
}

function renderSettings(calculations) {
  settingsScreen.innerHTML = `
    <div class="settings-shell">
      <div class="funnel-tabs">
        ${state.funnels
          .map(
            (funnel) => `
              <button
                class="funnel-switch ${uiState.selectedFunnelId === funnel.id ? "is-active" : ""}"
                data-funnel-tab="${funnel.id}"
                type="button"
              >
                ${funnel.label}
              </button>
            `,
          )
          .join("")}
      </div>
      <div id="funnel-screens"></div>
    </div>
  `;

  const screens = settingsScreen.querySelector("#funnel-screens");
  const template = document.querySelector("#funnel-template");

  state.funnels.forEach((funnel, index) => {
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

    renderMonthPlanRows(index, node.querySelector("[data-month-plan]"));
    renderRetentionFields(index, node.querySelector("[data-retention-grid]"));

    renderMetricCards(node.querySelector("[data-funnel-metrics]"), [
      { label: "Выручка 2026", value: formatMoney(calculation.totalRevenue2026) },
      { label: "Бюджет", value: formatMoney(calculation.totalBudget) },
      {
        label: "Прибыль",
        value: formatMoney(calculation.totalProfit2026),
        tone: calculation.totalProfit2026 >= 0 ? "positive" : "negative",
      },
      { label: "CAC / первая оплата", value: formatMoneyPrecise(calculation.avgCAC) },
      { label: "Lifetime revenue", value: formatMoney(calculation.totalLifetimeRevenue) },
      { label: "Первые оплаты", value: formatNumber(calculation.totalFirstPayments) },
      { label: "LTV / первая оплата", value: formatMoneyPrecise(calculation.avgRevenuePerPayment) },
      { label: "Retention 2-10 среднее", value: formatPercent(average(funnel.retentionConversions)) },
    ]);

    renderCohortRows(node.querySelector("[data-cohort-results]"), calculation);
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

function render() {
  const calculations = state.funnels.map((funnel) => calculateFunnel(funnel));
  renderDashboard(calculations);
  renderSettings(calculations);
  syncScreenState();
}

function updateField(funnelIndex, field, value) {
  const funnel = state.funnels[funnelIndex];
  if (!funnel) {
    return;
  }

  if (field === "name") {
    funnel.name = value;
    return;
  }

  const numericFields = [
    "firstPrice",
    "recurringPrice",
    "trialConversion",
    "month1Conversion",
    "horizonMonths",
  ];

  if (numericFields.includes(field)) {
    funnel[field] = Number(value) || 0;
  }
}

async function fetchSharedState() {
  const response = await fetch("/api/config", {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Load failed: ${response.status}`);
  }

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
  setSaveUi(
    "Сохранение…",
    reason === "manual"
      ? "Отправляю изменения в общую базу."
      : "Изменения автоматически сохраняются для всей команды.",
  );

  try {
    const response = await fetch("/api/config", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payload: serializeState(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Save failed: ${response.status}`);
    }

    const result = await response.json();
    if (requestId < latestAppliedSaveId) {
      return;
    }

    latestAppliedSaveId = requestId;
    setSaveUi("Сохранено", formatTimestamp(result.updatedAt));
  } catch (error) {
    console.error(error);
    setSaveUi("Ошибка сохранения", "Проверь подключение к интернету или настройки Cloudflare.");
  } finally {
    saveNowButton.disabled = false;
  }
}

function scheduleSave() {
  if (isBootstrapping) {
    return;
  }

  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer);
  }

  saveNowButton.disabled = false;
  setSaveUi("Есть несохраненные изменения", "Через секунду обновлю общую базу данных.");
  pendingSaveTimer = setTimeout(() => {
    void persistSharedState("autosave");
  }, 900);
}

document.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  if (target.dataset.field) {
    updateField(Number(target.dataset.funnelIndex), target.dataset.field, target.value);
    render();
    scheduleSave();
    return;
  }

  const funnelIndex = Number(target.dataset.funnelIndex);
  const monthIndex = Number(target.dataset.monthIndex);
  const retentionIndex = Number(target.dataset.retentionIndex);
  const funnel = state.funnels[funnelIndex];

  if (!funnel) {
    return;
  }

  switch (target.dataset.action) {
    case "volume":
      funnel.monthlyVolume[monthIndex] = clampPositive(target.value);
      break;
    case "budget":
      funnel.monthlyBudget[monthIndex] = clampPositive(target.value);
      break;
    case "retention":
      funnel.retentionConversions[retentionIndex] = clampPercent(target.value);
      break;
    default:
      return;
  }

  render();
  scheduleSave();
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

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

saveNowButton.addEventListener("click", () => {
  void persistSharedState("manual");
});

async function bootstrap() {
  render();
  saveNowButton.disabled = true;
  setSaveUi("Загрузка…", "Подтягиваю сохраненные настройки из общей базы.");

  try {
    const result = await fetchSharedState();
    if (result?.payload) {
      applyState(result.payload);
      render();
      setSaveUi("Синхронизировано", formatTimestamp(result.updatedAt));
    } else {
      setSaveUi("База пуста", "Пока загружены стартовые значения. Первое изменение создаст общую запись.");
    }
  } catch (error) {
    console.error(error);
    setSaveUi("Локальный режим", "Сервер сохранения недоступен. Сейчас значения не шарятся между участниками.");
  } finally {
    isBootstrapping = false;
    saveNowButton.disabled = false;
  }
}

void bootstrap();

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

const state = {
  funnels: [
    {
      id: "core",
      label: "Воронка A",
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
      label: "Воронка B",
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

const app = document.querySelector("#app");
const heroHorizon = document.querySelector("#hero-horizon");

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

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getRetentionForAge(funnel, ageIndex) {
  if (ageIndex <= 1) {
    return 1;
  }

  const monthOffset = ageIndex - 2;
  const value =
    funnel.retentionConversions[
      Math.min(monthOffset, funnel.retentionConversions.length - 1)
    ] / 100;

  return value;
}

function calculateFunnel(funnel) {
  const calendarRevenue = Array(12).fill(0);
  const cohortRows = [];
  const horizon = Math.max(12, Math.min(60, Math.round(funnel.horizonMonths)));

  for (let cohortIndex = 0; cohortIndex < 12; cohortIndex += 1) {
    const incoming = Math.max(0, Number(funnel.monthlyVolume[cohortIndex]) || 0);
    const budget = Math.max(0, Number(funnel.monthlyBudget[cohortIndex]) || 0);
    const trialCount = incoming * (clampPercent(funnel.trialConversion) / 100);
    let activePaid = trialCount * (clampPercent(funnel.month1Conversion) / 100);
    let lifetimeRevenue = activePaid * funnel.firstPrice;
    let revenue2026 = cohortIndex < 12 ? activePaid * funnel.firstPrice : 0;

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
      firstPayments: trialCount * (clampPercent(funnel.month1Conversion) / 100),
      lifetimeRevenue,
      revenue2026,
      budget,
      profit: revenue2026 - budget,
    });
  }

  const totalRevenue2026 = calendarRevenue.reduce((sum, value) => sum + value, 0);
  const totalBudget = funnel.monthlyBudget.reduce(
    (sum, value) => sum + (Number(value) || 0),
    0,
  );
  const totalLifetimeRevenue = cohortRows.reduce(
    (sum, row) => sum + row.lifetimeRevenue,
    0,
  );
  const totalFirstPayments = cohortRows.reduce(
    (sum, row) => sum + row.firstPayments,
    0,
  );

  return {
    horizon,
    cohortRows,
    calendarRevenue,
    totalRevenue2026,
    totalBudget,
    totalLifetimeRevenue,
    totalProfit2026: totalRevenue2026 - totalBudget,
    totalFirstPayments,
    avgCAC:
      totalFirstPayments > 0 ? totalBudget / totalFirstPayments : 0,
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

function renderMonthPlanRows(funnelIndex, tbody) {
  tbody.innerHTML = MONTHS.map(
    (month, monthIndex) => `
      <tr>
        <td>${month}</td>
        <td>
          <input
            class="month-input"
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
            class="budget-input"
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
          class="retention-input"
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
        <td class="${row.profit >= 0 ? "positive" : "negative"}">${formatMoney(row.profit)}</td>
      </tr>
    `,
    )
    .join("");
}

function buildSummaryPanel(calculations) {
  const totalRevenue = calculations.reduce(
    (sum, item) => sum + item.totalRevenue2026,
    0,
  );
  const totalBudget = calculations.reduce((sum, item) => sum + item.totalBudget, 0);
  const totalProfit = totalRevenue - totalBudget;
  const totalLifetimeRevenue = calculations.reduce(
    (sum, item) => sum + item.totalLifetimeRevenue,
    0,
  );
  const horizon = Math.max(...calculations.map((item) => item.horizon));

  heroHorizon.textContent = `${horizon} месяца`;

  const combinedCalendar = Array.from({ length: 12 }, (_, index) =>
    calculations.reduce((sum, item) => sum + item.calendarRevenue[index], 0),
  );

  const combinedAverageRevenue = average(combinedCalendar);

  const section = document.createElement("section");
  section.className = "panel summary-panel";
  section.innerHTML = `
    <div class="panel-heading">
      <div>
        <p class="panel-kicker">Итог</p>
        <h2>Сводка по двум воронкам</h2>
      </div>
      <p class="panel-note">
        Календарная выручка считается только в рамках 2026 года, а lifetime revenue
        показывает полный эффект когорт на выбранном горизонте.
      </p>
    </div>

    <div class="summary-grid"></div>

    <div class="subpanel">
      <div class="subpanel-heading">
        <div>
          <h3>Календарная выручка 2026</h3>
          <p>Выручка в каждом месяце складывается из всех активных когорт двух воронок.</p>
        </div>
      </div>
      <div class="table-wrap">
        <table class="calendar-table">
          <thead>
            <tr>
              <th>Месяц</th>
              <th>Выручка, $</th>
              <th>Среднее отклонение</th>
            </tr>
          </thead>
          <tbody>
            ${combinedCalendar
              .map((value, index) => {
                const delta = value - combinedAverageRevenue;
                return `
                  <tr>
                    <td>${MONTHS[index]}</td>
                    <td>${formatMoney(value)}</td>
                    <td class="${delta >= 0 ? "positive" : "negative"}">${formatMoney(delta)}</td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
    </div>

    <p class="footer-note">
      Логика модели: входящий объем → trial → первая оплата → retention по месяцам 2-10 →
      статичная конверсия после 10-го месяца. При необходимости можно использовать входящий
      объем как уже готовые продажи, установив первые две конверсии в 100%.
    </p>
  `;

  renderMetricCards(section.querySelector(".summary-grid"), [
    {
      label: "Суммарная выручка 2026",
      value: formatMoney(totalRevenue),
    },
    {
      label: "Суммарный бюджет 2026",
      value: formatMoney(totalBudget),
    },
    {
      label: "Прибыль после бюджета",
      value: formatMoney(totalProfit),
      tone: totalProfit >= 0 ? "positive" : "negative",
    },
    {
      label: "Lifetime revenue когорт",
      value: formatMoney(totalLifetimeRevenue),
    },
  ]);

  return section;
}

function render() {
  app.innerHTML = "";
  const template = document.querySelector("#funnel-template");
  const calculations = state.funnels.map((funnel) => calculateFunnel(funnel));

  state.funnels.forEach((funnel, index) => {
    const node = template.content.firstElementChild.cloneNode(true);
    const calculation = calculations[index];

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
      {
        label: "Выручка 2026",
        value: formatMoney(calculation.totalRevenue2026),
      },
      {
        label: "Бюджет",
        value: formatMoney(calculation.totalBudget),
      },
      {
        label: "Прибыль",
        value: formatMoney(calculation.totalProfit2026),
        tone: calculation.totalProfit2026 >= 0 ? "positive" : "negative",
      },
      {
        label: "CAC / первая оплата",
        value: formatMoneyPrecise(calculation.avgCAC),
      },
      {
        label: "Lifetime revenue",
        value: formatMoney(calculation.totalLifetimeRevenue),
      },
      {
        label: "Первые оплаты",
        value: formatNumber(calculation.totalFirstPayments),
      },
      {
        label: "LTV / первая оплата",
        value: formatMoneyPrecise(calculation.avgRevenuePerPayment),
      },
      {
        label: "Retention 2-10 среднее",
        value: formatPercent(average(funnel.retentionConversions)),
      },
    ]);

    renderCohortRows(node.querySelector("[data-cohort-results]"), calculation);
    app.appendChild(node);
  });

  app.appendChild(buildSummaryPanel(calculations));
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

document.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  if (target.dataset.field) {
    updateField(Number(target.dataset.funnelIndex), target.dataset.field, target.value);
    render();
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
      funnel.monthlyVolume[monthIndex] = Math.max(0, Number(target.value) || 0);
      break;
    case "budget":
      funnel.monthlyBudget[monthIndex] = Math.max(0, Number(target.value) || 0);
      break;
    case "retention":
      funnel.retentionConversions[retentionIndex] = clampPercent(target.value);
      break;
    default:
      return;
  }

  render();
});

render();

// ─── DOM Binding & Live Update ──────────────────────────────────
(function () {
  'use strict';

  // ── State ──
  let printerRowCount = 0;

  // ── DOM refs ──
  const printerRowsContainer = document.getElementById('printer-rows');
  const addPrinterBtn = document.getElementById('add-printer-btn');
  const measuredWasteInput = document.getElementById('measured-waste');
  const resultsSection = document.getElementById('results');

  // Coefficient sliders
  const discardSlider = document.getElementById('discard-slider');
  const discardValue = document.getElementById('discard-value');
  const supportSlider = document.getElementById('support-slider');
  const supportValue = document.getElementById('support-value');
  const rateSlider = document.getElementById('rate-slider');
  const rateValue = document.getElementById('rate-value');

  // Advanced inputs (recycling economics only)
  const advShredEnergy = document.getElementById('adv-shred-energy');
  const advExtrudeEnergy = document.getElementById('adv-extrude-energy');
  const advElectricityCost = document.getElementById('adv-electricity-cost');
  const advMaterialCost = document.getElementById('adv-material-cost');
  const advRecycleLoss = document.getElementById('adv-recycle-loss');

  // ── Printer Row Template ──
  function createPrinterRow(defaults = {}) {
    const id = printerRowCount++;
    const div = document.createElement('div');
    div.className = 'printer-row';
    div.dataset.rowId = id;

    const profileOptions = Object.entries(PRINTER_PROFILES)
      .map(([key, p]) => {
        const selected = key === (defaults.profileKey || 'bambu-p1s') ? 'selected' : '';
        return `<option value="${key}" ${selected}>${p.name}</option>`;
      })
      .join('');

    div.innerHTML = `
      <div class="printer-row-fields">
        <div class="field">
          <label for="profile-${id}">Printer Model</label>
          <select id="profile-${id}" class="profile-select" data-row="${id}">
            ${profileOptions}
          </select>
        </div>
        <div class="field">
          <label for="hours-${id}">Print Hours</label>
          <input type="number" id="hours-${id}" class="hours-input" data-row="${id}"
                 value="${defaults.hours ?? ''}" min="0" step="1" placeholder="e.g. 635">
        </div>
        <div class="field">
          <label for="num-${id}">Qty</label>
          <input type="number" id="num-${id}" class="num-input" data-row="${id}"
                 value="${defaults.numPrinters ?? 1}" min="1" step="1">
        </div>
        <div class="field rate-field">
          <label for="rate-${id}">g/h <span class="rate-hint">(auto)</span></label>
          <input type="number" id="rate-${id}" class="rate-input" data-row="${id}"
                 min="1" step="0.5" placeholder="auto">
        </div>
        <button class="remove-row-btn" data-row="${id}" title="Remove printer">&times;</button>
      </div>
    `;

    // Set auto rate placeholder (adjusted for current multiplier slider)
    const profileKey = defaults.profileKey || 'bambu-p1s';
    const rateInput = div.querySelector('.rate-input');
    const mult = parseInt(rateSlider.value) / 100;
    rateInput.placeholder = (PRINTER_PROFILES[profileKey].consumptionRateGPerHour * mult).toFixed(1);

    return div;
  }

  function addPrinterRow(defaults = {}) {
    const row = createPrinterRow(defaults);
    printerRowsContainer.appendChild(row);
    bindRowEvents(row);
    recalculate();
  }

  function bindRowEvents(rowEl) {
    rowEl.querySelector('.profile-select').addEventListener('change', (e) => {
      const rateInput = rowEl.querySelector('.rate-input');
      const profile = PRINTER_PROFILES[e.target.value];
      const mult = parseInt(rateSlider.value) / 100;
      rateInput.placeholder = (profile.consumptionRateGPerHour * mult).toFixed(1);
      rateInput.value = '';
      recalculate();
    });

    rowEl.querySelector('.hours-input').addEventListener('input', recalculate);
    rowEl.querySelector('.num-input').addEventListener('input', recalculate);
    rowEl.querySelector('.rate-input').addEventListener('input', recalculate);

    rowEl.querySelector('.remove-row-btn').addEventListener('click', () => {
      rowEl.remove();
      recalculate();
    });
  }

  // ── Gather Inputs ──
  function gatherPrinterRows() {
    const rows = [];
    printerRowsContainer.querySelectorAll('.printer-row').forEach((el) => {
      const profileKey = el.querySelector('.profile-select').value;
      const hours = parseFloat(el.querySelector('.hours-input').value) || 0;
      const numPrinters = parseInt(el.querySelector('.num-input').value) || 1;
      const rateVal = el.querySelector('.rate-input').value;
      const customRate = rateVal ? parseFloat(rateVal) : null;
      rows.push({ profileKey, hours, numPrinters, customRate });
    });
    return rows;
  }

  function gatherOverrides() {
    const overrides = {};
    if (advShredEnergy.value) overrides.shredEnergy = parseFloat(advShredEnergy.value);
    if (advExtrudeEnergy.value) overrides.extrudeEnergy = parseFloat(advExtrudeEnergy.value);
    if (advElectricityCost.value) overrides.electricityCost = parseFloat(advElectricityCost.value);
    if (advMaterialCost.value) overrides.materialCostPerKg = parseFloat(advMaterialCost.value);
    if (advRecycleLoss.value) overrides.recyclabilityLoss = parseFloat(advRecycleLoss.value) / 100;
    return overrides;
  }

  // ── Slider Helpers ──
  function getCoefficients() {
    return {
      failureRate: parseInt(discardSlider.value) / 100,
      supportRatio: parseInt(supportSlider.value) / 100,
      rateMultiplier: parseInt(rateSlider.value) / 100,
    };
  }

  function updateSliderDisplays() {
    discardValue.textContent = `${discardSlider.value}%`;
    supportValue.textContent = `${supportSlider.value}%`;
    rateValue.textContent = `×${(parseInt(rateSlider.value) / 100).toFixed(2)}`;
  }

  function updateRatePlaceholders() {
    const mult = parseInt(rateSlider.value) / 100;
    printerRowsContainer.querySelectorAll('.printer-row').forEach((el) => {
      const profileKey = el.querySelector('.profile-select').value;
      const baseRate = PRINTER_PROFILES[profileKey].consumptionRateGPerHour;
      el.querySelector('.rate-input').placeholder = (baseRate * mult).toFixed(1);
    });
  }

  // ── Render Results ──
  function renderResults(r) {
    if (!r || r.totalMaterialG === 0) {
      resultsSection.innerHTML = '<p class="empty-state">Enter printer hours to see results.</p>';
      return;
    }

    const fmt = (n, d = 1) => n.toFixed(d);
    const fmtG = (g) => (g >= 1000 ? `${fmt(g / 1000, 2)} kg` : `${fmt(g, 0)} g`);
    const fmtEur = (e) => `€${fmt(e, 2)}`;

    // Printer breakdown
    const printerBreakdown = r.printerResults
      .filter((p) => p.materialG > 0)
      .map(
        (p) =>
          `<tr>
            <td>${p.name}</td>
            <td>${p.hours}h × ${p.numPrinters}</td>
            <td>${fmt(p.rateGPerH, 1)} g/h</td>
            <td>${fmtG(p.materialG)}</td>
          </tr>`
      )
      .join('');

    // Waste breakdown detail
    let wasteDetail = '';
    if (r.mode === 'estimated' && r.failedG !== null) {
      wasteDetail = `
        <div class="detail-row">
          <span>Discarded prints (failures + iterations)</span><span>${fmtG(r.failedG)}</span>
        </div>
        <div class="detail-row">
          <span>Supports / rafts / brims</span><span>${fmtG(r.supportG)}</span>
        </div>
        <div class="detail-row">
          <span>Purge (nozzle prime per print)</span><span>${fmtG(r.purgeG)}</span>
        </div>`;
    }
    if (r.mode === 'measured') {
      wasteDetail = `<div class="detail-note">Using your measured waste value.</div>`;
    }

    resultsSection.innerHTML = `
      <div class="results-grid">
        <!-- Material Overview -->
        <div class="result-card overview-card">
          <h3>Material Overview</h3>
          <div class="big-number">${fmtG(r.totalMaterialG)}</div>
          <div class="big-label">total material consumed (est.)</div>

          <div class="bar-container">
            <div class="bar-fill in-use-bar" style="width: ${Math.max(0, r.percentInUse)}%"></div>
            <div class="bar-fill waste-bar" style="width: ${Math.min(100, r.percentWaste)}%"></div>
          </div>
          <div class="bar-legend">
            <span class="legend-in-use">■ In use: ${fmtG(r.inUseG)} (${fmt(r.percentInUse, 1)}%)</span>
            <span class="legend-waste">■ Waste: ${fmtG(r.wasteG)} (${fmt(r.percentWaste, 1)}%)</span>
          </div>

          ${wasteDetail}
        </div>

        <!-- Recycling Economics -->
        <div class="result-card recycling-card">
          <h3>Recycling Potential</h3>
          <div class="detail-row">
            <span>Recyclable waste</span><span>${fmtG(r.wasteG)}</span>
          </div>
          <div class="detail-row">
            <span>Reclaimed filament</span><span>${fmt(r.recycling.reclaimedFilamentKg, 2)} kg</span>
          </div>
          <div class="detail-row">
            <span>Filament value (at retail)</span><span>${fmtEur(r.recycling.reclaimedValueEur)}</span>
          </div>
          <div class="detail-row separator">
            <span>Shredding + extrusion energy</span><span>${fmt(r.recycling.recyclingEnergyKwh, 3)} kWh</span>
          </div>
          <div class="detail-row">
            <span>Energy cost</span><span>${fmtEur(r.recycling.recyclingCostEur)}</span>
          </div>
          <div class="detail-row net-savings ${r.recycling.netSavingsEur >= 0 ? 'positive' : 'negative'}">
            <span>Scrap Value</span><span>${fmtEur(r.recycling.netSavingsEur)}</span>
          </div>
        </div>

        <!-- Printer Breakdown -->
        ${printerBreakdown ? `
        <div class="result-card breakdown-card">
          <h3>Printer Breakdown</h3>
          <table>
            <thead><tr><th>Printer</th><th>Usage</th><th>Rate</th><th>Material</th></tr></thead>
            <tbody>${printerBreakdown}</tbody>
          </table>
        </div>` : ''}
      </div>
    `;
  }

  // ── Main Recalculate ──
  function recalculate() {
    const rows = gatherPrinterRows();
    const coefficients = getCoefficients();
    const measuredVal = measuredWasteInput.value.trim();
    const measuredWasteG = measuredVal ? parseFloat(measuredVal) * 1000 : null; // input in kg
    const overrides = gatherOverrides();

    const results = calculate(rows, coefficients, measuredWasteG, overrides);
    renderResults(results);
  }

  // ── Event Bindings ──
  [discardSlider, supportSlider, rateSlider].forEach((slider) => {
    slider.addEventListener('input', () => {
      updateSliderDisplays();
      if (slider === rateSlider) updateRatePlaceholders();
      recalculate();
    });
  });

  measuredWasteInput.addEventListener('input', recalculate);
  addPrinterBtn.addEventListener('click', () => addPrinterRow());

  // Advanced input changes
  [advShredEnergy, advExtrudeEnergy,
   advElectricityCost, advMaterialCost, advRecycleLoss].forEach((el) => {
    el.addEventListener('input', recalculate);
  });

  // ── Initialize ──
  updateSliderDisplays();
  // Add two default rows matching user's printers
  addPrinterRow({ profileKey: 'bambu-p1s', hours: 635, numPrinters: 1 });
  addPrinterRow({ profileKey: 'bambu-a1-mini', hours: 239, numPrinters: 1 });
})();

// ─── Pure Calculation Functions ─────────────────────────────────
// No DOM access — testable standalone

/**
 * Estimate total material consumed by one printer group.
 * @param {number} hours – total print hours
 * @param {number} consumptionRate – g/h
 * @param {number} numPrinters – number of identical printers
 * @returns {number} grams
 */
function estimateMaterialConsumed(hours, consumptionRate, numPrinters) {
  return hours * consumptionRate * numPrinters;
}

/**
 * Estimate waste from total material, discard rate, and support ratio.
 * Discard rate = prints that become waste (failures + discarded iterations/prototypes)
 * waste = discarded prints + supports from kept prints
 * @returns {{ wasteG: number, failedG: number, supportG: number, inUseG: number }}
 */
function estimateWaste(totalMaterialG, failureRate, supportRatio) {
  const failedG = totalMaterialG * failureRate;
  const successfulG = totalMaterialG * (1 - failureRate);
  const supportG = successfulG * supportRatio;
  const wasteG = failedG + supportG;
  const inUseG = successfulG - supportG;
  return { wasteG, failedG, supportG, inUseG };
}

/**
 * Given measured waste and total material, back-calculate the in-use percentage.
 */
function backCalculateFromMeasuredWaste(totalMaterialG, measuredWasteG) {
  if (totalMaterialG <= 0) return { percentInUse: 0, percentWaste: 0 };
  const percentWaste = (measuredWasteG / totalMaterialG) * 100;
  const percentInUse = 100 - percentWaste;
  return {
    percentInUse: Math.max(0, percentInUse),
    percentWaste: Math.min(100, percentWaste),
  };
}

/**
 * Calculate recycling economics.
 * @param {number} wasteKg – recyclable waste in kg
 * @param {object} recyclingParams – { shredEnergy, extrudeEnergy, electricityCost, materialCostPerKg, recyclabilityLoss }
 * @returns {{ recyclingEnergyKwh, recyclingCostEur, reclaimedFilamentKg, reclaimedValueEur, netSavingsEur }}
 */
function calculateRecyclingEconomics(wasteKg, recyclingParams) {
  const {
    shredEnergy,
    extrudeEnergy,
    electricityCost,
    materialCostPerKg,
    recyclabilityLoss,
  } = recyclingParams;

  const totalEnergyPerKg = shredEnergy + extrudeEnergy;
  const recyclingEnergyKwh = wasteKg * totalEnergyPerKg;
  const recyclingCostEur = recyclingEnergyKwh * electricityCost;

  const reclaimedFilamentKg = wasteKg * (1 - recyclabilityLoss);
  const reclaimedValueEur = reclaimedFilamentKg * materialCostPerKg;

  const netSavingsEur = reclaimedValueEur - recyclingCostEur;

  return {
    recyclingEnergyKwh,
    recyclingCostEur,
    reclaimedFilamentKg,
    reclaimedValueEur,
    netSavingsEur,
  };
}

/**
 * Main entry point: run the full calculation from UI inputs.
 * @param {Array} printerRows – [{ profileKey, hours, numPrinters, customRate? }]
 * @param {object} coefficients – { failureRate, supportRatio, rateMultiplier } from sliders
 * @param {number|null} measuredWasteG – optional measured waste override in grams
 * @param {object} overrides – optional overrides from advanced settings { shredEnergy, ... }
 * @returns {object} full results
 */
function calculate(printerRows, coefficients, measuredWasteG, overrides = {}) {
  const { failureRate, supportRatio, rateMultiplier } = coefficients;

  // 1. Calculate total material per printer and overall
  const printerResults = printerRows.map((row) => {
    const profile = PRINTER_PROFILES[row.profileKey];
    const baseRate = profile.consumptionRateGPerHour;
    const rate = row.customRate ?? (baseRate * rateMultiplier);
    const materialG = estimateMaterialConsumed(row.hours, rate, row.numPrinters);
    // Purge: estimate print starts from job duration (scales with rate ratio)
    // Lower effective g/h → smaller parts → shorter jobs → more starts → more purge
    const jobDurationH = AVG_PRINT_DURATION_H * (rate / baseRate);
    const numStarts = (row.hours * row.numPrinters) / jobDurationH;
    const purgeG = numStarts * PURGE_PER_START_G;
    return {
      name: profile.name,
      hours: row.hours,
      numPrinters: row.numPrinters,
      rateGPerH: rate,
      materialG,
      purgeG,
    };
  });

  const totalMaterialG = printerResults.reduce((sum, p) => sum + p.materialG, 0);
  const totalPurgeG = printerResults.reduce((sum, p) => sum + p.purgeG, 0);

  // 2. Waste calculation — two modes
  let wasteG, failedG, supportG, inUseG, percentInUse, percentWaste, mode;

  if (measuredWasteG !== null && measuredWasteG > 0) {
    // Mode B: user provided measured waste
    mode = 'measured';
    wasteG = measuredWasteG;
    const backCalc = backCalculateFromMeasuredWaste(totalMaterialG + totalPurgeG, measuredWasteG);
    percentInUse = backCalc.percentInUse;
    percentWaste = backCalc.percentWaste;
    inUseG = (totalMaterialG + totalPurgeG) - wasteG;
    failedG = null;
    supportG = null;
  } else {
    // Mode A: estimate from coefficients
    mode = 'estimated';
    const est = estimateWaste(totalMaterialG, failureRate, supportRatio);
    wasteG = est.wasteG + totalPurgeG; // purge is always waste
    failedG = est.failedG;
    supportG = est.supportG;
    inUseG = est.inUseG;
    const grandTotal = totalMaterialG + totalPurgeG;
    percentInUse = grandTotal > 0 ? (inUseG / grandTotal) * 100 : 0;
    percentWaste = grandTotal > 0 ? (wasteG / grandTotal) * 100 : 0;
  }

  // 3. Recycling economics
  const wasteKg = wasteG / 1000;
  const material = MATERIAL_PROFILES.pla;
  const recycling = calculateRecyclingEconomics(wasteKg, {
    shredEnergy: overrides.shredEnergy ?? RECYCLING_DEFAULTS.shredEnergyKwhPerKg,
    extrudeEnergy: overrides.extrudeEnergy ?? RECYCLING_DEFAULTS.extrudeEnergyKwhPerKg,
    electricityCost: overrides.electricityCost ?? RECYCLING_DEFAULTS.electricityCostEurPerKwh,
    materialCostPerKg: overrides.materialCostPerKg ?? material.costPerKgEur,
    recyclabilityLoss: overrides.recyclabilityLoss ?? material.recyclabilityLoss,
  });

  return {
    mode,
    printerResults,
    totalMaterialG: totalMaterialG + totalPurgeG,
    totalMaterialKg: (totalMaterialG + totalPurgeG) / 1000,
    wasteG,
    wasteKg: wasteG / 1000,
    failedG,
    supportG,
    purgeG: totalPurgeG,
    inUseG,
    inUseKg: inUseG / 1000,
    percentInUse,
    percentWaste,
    coefficients: { failureRate, supportRatio },
    recycling,
  };
}

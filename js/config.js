// ─── Printer Profiles ───────────────────────────────────────────
const PRINTER_PROFILES = {
  'bambu-p1s': {
    name: 'Bambu Lab P1S',
    consumptionRateGPerHour: 10, // g/h effective avg incl. warmup/calibration overhead
    buildVolume: '256×256×256 mm',
  },
  'bambu-a1-mini': {
    name: 'Bambu Lab A1 Mini',
    consumptionRateGPerHour: 8, // g/h effective avg (smaller build vol, similar overhead)
    buildVolume: '180×180×180 mm',
  },
  'generic-fast': {
    name: 'Generic Fast (Bambu/Prusa class)',
    consumptionRateGPerHour: 9,
    buildVolume: 'varies',
  },
  'generic-standard': {
    name: 'Generic Standard (Ender class)',
    consumptionRateGPerHour: 6,
    buildVolume: 'varies',
  },
  'custom': {
    name: 'Custom',
    consumptionRateGPerHour: 8,
    buildVolume: 'user-defined',
  },
};

// ─── Material Profile (PLA only for MVP) ────────────────────────
const MATERIAL_PROFILES = {
  pla: {
    name: 'PLA',
    densityGPerCm3: 1.24,
    costPerKgEur: 22,       // retail price per kg spool
    recyclabilityLoss: 0.05, // 5% material loss per recycling pass
  },
};

// ─── Recycling Energy Defaults ──────────────────────────────────
// Sources: Recyclebot study (Appropedia), Felfil Evo, 3devo specs
const RECYCLING_DEFAULTS = {
  shredEnergyKwhPerKg: 0.17,   // desktop shredder energy
  extrudeEnergyKwhPerKg: 0.24, // desktop extruder energy (Recyclebot: 0.24 kWh/kg @ 0.4 kg/h)
  electricityCostEurPerKwh: 0.30, // EU average residential
};

// ─── Purge Waste ────────────────────────────────────────────────
// Purge line deposited at print start. Lower g/h → smaller parts → more
// print starts per hour → more purge. Formula: hours × PURGE_FACTOR / g_per_h
// Calibrated so 623h at ~5 g/h ≈ 3 g purge.
const PURGE_FACTOR = 0.024;

// ─── Default Slider Values ─────────────────────────────────────
// These are the initial slider positions (also used as reference defaults)
const SLIDER_DEFAULTS = {
  discardRate: 43,       // % (0–100)
  supportRatio: 8,       // % (0–30)
  rateMultiplier: 100,   // stored as percentage: 100 = ×1.00 (range 30–300)
};

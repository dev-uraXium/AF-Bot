// utils/helpers.js — business logic (no rendering — see components.js for that)
const { PermissionFlagsBits } = require("discord.js");
const { db }   = require("../data/db");
const config   = require("../config");

// ── Fleet ─────────────────────────────────────────────────────
const FLEET = {
  "B773": { label: "Boeing 777-300ER", payMultiplier: 1.4 },
  "B789": { label: "Boeing 787-9",     payMultiplier: 1.2 },
  "A350": { label: "Airbus A350",      payMultiplier: 1.3 },
  "A320": { label: "Airbus A320",      payMultiplier: 1.0 },
  "A220": { label: "Airbus A220",      payMultiplier: 1.0 },
};
const FLEET_KEYS = Object.keys(FLEET);
const FLEET_CHOICES = [
  { name: "Boeing 777-300ER", value: "B773" },
  { name: "Boeing 787-9",     value: "B789" },
  { name: "Airbus A350",      value: "A350" },
  { name: "Airbus A320",      value: "A320" },
  { name: "Airbus A220",      value: "A220" },
];
function isValidAircraft(str) { return FLEET_KEYS.some(k => str.toUpperCase().includes(k)); }
function normalizeAircraft(str) { return FLEET_KEYS.find(k => str.toUpperCase().includes(k)) ?? str; }

// ── Airports ──────────────────────────────────────────────────
const AIRPORTS = {
  LCLK: { name: "Larnaca",       country: "🇨🇾 Cyprus"         },
  LCPH: { name: "Paphos",        country: "🇨🇾 Cyprus"         },
  MDST: { name: "Cibao",         country: "🇩🇴 Dominican Rep." },
  MDPC: { name: "Punta Cana",    country: "🇩🇴 Dominican Rep." },
  EFKT: { name: "Kittilä",       country: "🇫🇮 Finland"        },
  MTCA: { name: "Antoine-Simon", country: "🇭🇹 Haiti"          },
  GCLP: { name: "Gran Canaria",  country: "🇪🇸 Spain"          },
  LEMH: { name: "Menorca",       country: "🇪🇸 Spain"          },
  EGKK: { name: "Gatwick",       country: "🇬🇧 United Kingdom" },
  EGHI: { name: "Southampton",   country: "🇬🇧 United Kingdom" },
};
const AIRPORT_KEYS = Object.keys(AIRPORTS);
const AIRPORT_CHOICES = [
  { name: "Larnaca (LCLK) 🇨🇾",      value: "LCLK" },
  { name: "Paphos (LCPH) 🇨🇾",        value: "LCPH" },
  { name: "Cibao (MDST) 🇩🇴",         value: "MDST" },
  { name: "Punta Cana (MDPC) 🇩🇴",    value: "MDPC" },
  { name: "Kittilä (EFKT) 🇫🇮",       value: "EFKT" },
  { name: "Antoine-Simon (MTCA) 🇭🇹", value: "MTCA" },
  { name: "Gran Canaria (GCLP) 🇪🇸",  value: "GCLP" },
  { name: "Menorca (LEMH) 🇪🇸",       value: "LEMH" },
  { name: "Gatwick (EGKK) 🇬🇧",       value: "EGKK" },
  { name: "Southampton (EGHI) 🇬🇧",   value: "EGHI" },
];
function airportLabel(icao) {
  const a = AIRPORTS[icao];
  return a ? `${a.name} (${icao}) ${a.country}` : icao;
}

// ── Ranks ─────────────────────────────────────────────────────
const RANKS = [
  { name: "Senior Captain",       min: 200, color: 0xe0115f },
  { name: "Captain",              min: 100, color: 0xffd700 },
  { name: "Senior First Officer", min:  50, color: 0x00cfff },
  { name: "First Officer",        min:  25, color: 0xc0c0c0 },
  { name: "Second Officer",       min:  10, color: 0xcd7f32 },
  { name: "Trainee Pilot",        min:   0, color: 0x7289da },
];
function league(n) { return RANKS.find(r => n >= r.min) ?? RANKS.at(-1); }

// ── Tier system ───────────────────────────────────────────────
const TIERS = [
  { key: "PRESTIGE",  name: "Le Prestige",  price: 40_000,  color: 0xcd7f32, requires: null,       emoji: "🥉", description: "Entry-level elite tier. Unlocks exclusive Prestige contracts." },
  { key: "SIGNATURE", name: "Le Signature", price: 100_000, color: 0xc0c0c0, requires: "PRESTIGE",  emoji: "🥈", description: "Mid-tier prestige. Harder, higher-reward Signature contracts." },
  { key: "APOGEE",    name: "L'Apogée",     price: 250_000, color: 0xffd700, requires: "SIGNATURE", emoji: "🥇", description: "High-prestige tier. Exclusive Apogée contracts, elite rewards." },
  { key: "PREMIERE",  name: "La Première",  price: 500_000, color: 0xe0115f, requires: "APOGEE",    emoji: "💎", description: "The pinnacle. La Première contracts with the highest payouts." },
];
function getTierByKey(key) { return TIERS.find(t => t.key === key); }
function getMemberTier(member) {
  for (const tier of [...TIERS].reverse()) {
    const roleId = config.TIER_ROLES?.[tier.key];
    if (roleId && member.roles.cache.has(roleId)) return tier;
  }
  return null;
}
function hasTier(member, key) {
  const roleId = config.TIER_ROLES?.[key];
  if (!roleId) return false;
  return member.roles.cache.has(roleId);
}

// ── DB helpers ────────────────────────────────────────────────
function getFlights(userId) { if (!db.flights[userId]) db.flights[userId] = []; return db.flights[userId]; }
function getStrikes(userId) { return db.strikes[userId] ?? 0; }
function getWarns(userId)   { if (!db.warns[userId])   db.warns[userId]   = []; return db.warns[userId]; }

// ── Permissions ───────────────────────────────────────────────
function isStaff(member) {
  return (
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    (config.STAFF_ROLE && member.roles.cache.has(config.STAFF_ROLE))
  );
}

// ── Stats ─────────────────────────────────────────────────────
function favRoute(userId) {
  const map = {};
  getFlights(userId).forEach(f => {
    const key = `${f.departure}→${f.arrival}`;
    map[key] = (map[key] || 0) + 1;
  });
  const top = Object.entries(map).sort((a, b) => b[1] - a[1])[0];
  return top ? `${top[0]} (×${top[1]})` : "N/A";
}

// ── Economy ───────────────────────────────────────────────────
const CURRENCY      = config.CURRENCY      ?? "EUR";
const CURRENCY_ICON = config.CURRENCY_ICON ?? "€";

function getBalance(userId) {
  if (db.balances[userId] === undefined) db.balances[userId] = 0;
  return db.balances[userId];
}
function addBalance(userId, amount) {
  if (db.balances[userId] === undefined) db.balances[userId] = 0;
  db.balances[userId] = Math.round((db.balances[userId] + amount) * 100) / 100;
  return db.balances[userId];
}
function deductBalance(userId, amount) {
  if (db.balances[userId] === undefined) db.balances[userId] = 0;
  db.balances[userId] = Math.max(0, Math.round((db.balances[userId] - amount) * 100) / 100);
  return db.balances[userId];
}
function logTx(userId, type, amount, reason, by = null) {
  if (!db.txHistory[userId]) db.txHistory[userId] = [];
  db.txHistory[userId].push({ type, amount, reason, by, timestamp: new Date().toISOString() });
  if (db.txHistory[userId].length > 50) db.txHistory[userId] = db.txHistory[userId].slice(-50);
}
function money(amount) { return `${Number(amount).toLocaleString()} ${CURRENCY}`; }
function flightPay(aircraftKey) {
  const mult = FLEET[aircraftKey]?.payMultiplier ?? 1.0;
  return Math.round((config.FLIGHT_BASE_PAY ?? 500) * mult);
}

// ── Contracts ─────────────────────────────────────────────────
function genId() {
  return Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}
function contractMatchesFlight(contract, flight) {
  const dep = contract.departure === "ANY" || contract.departure === flight.departure;
  const arr = contract.arrival   === "ANY" || contract.arrival   === flight.arrival;
  const ac  = !contract.aircraft || contract.aircraft.includes("ANY") || contract.aircraft.includes(normalizeAircraft(flight.aircraft));
  return dep && arr && ac;
}

module.exports = {
  FLEET, FLEET_KEYS, FLEET_CHOICES, isValidAircraft, normalizeAircraft,
  AIRPORTS, AIRPORT_KEYS, AIRPORT_CHOICES, airportLabel,
  league, RANKS,
  TIERS, getTierByKey, getMemberTier, hasTier,
  getFlights, getStrikes, getWarns, isStaff,
  favRoute,
  CURRENCY, CURRENCY_ICON, getBalance, addBalance, deductBalance, logTx, money, flightPay,
  genId, contractMatchesFlight,
};
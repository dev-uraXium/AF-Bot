// utils/helpers.js — Shared utilities
const { PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { db }  = require("../data/db");
const config  = require("../config");

// ── Custom emoji helpers ──────────────────────────────────────
// Returns <:name:id> string for use in text/embed descriptions
function e(key) {
  const em = config[key];
  if (!em || em.id.includes("HERE")) return "";          // fallback to nothing if not configured
  return `<:${em.name}:${em.id}>`;
}
// Returns emoji object for ButtonBuilder / component emoji
function eObj(key) {
  const em = config[key];
  if (!em || em.id.includes("HERE")) return null;
  return { id: em.id, name: em.name };
}

// ── Fleet ─────────────────────────────────────────────────────
const FLEET = {
  A350: { label: "Airbus A350",    payMultiplier: 1.4 },
  A320: { label: "Airbus A320",    payMultiplier: 1.0 },
  A220: { label: "Airbus A220",    payMultiplier: 1.0 },
  B777: { label: "Boeing 777",     payMultiplier: 1.3 },
  B787: { label: "Boeing 787",     payMultiplier: 1.2 },
};
const FLEET_KEYS = Object.keys(FLEET);

function isValidAircraft(str) {
  return FLEET_KEYS.some(k => str.toUpperCase().includes(k));
}
function normalizeAircraft(str) {
  return FLEET_KEYS.find(k => str.toUpperCase().includes(k)) ?? str;
}

// ── League ────────────────────────────────────────────────────
const LEAGUES = [
  { name: "💎 Ruby",    min: 200, color: 0xe0115f },
  { name: "💠 Diamond", min: 100, color: 0x00cfff },
  { name: "🥇 Gold",    min:  50, color: 0xffd700 },
  { name: "🥈 Silver",  min:  25, color: 0xc0c0c0 },
  { name: "🥉 Bronze",  min:  10, color: 0xcd7f32 },
  { name: "🛡️ Cadet",   min:   0, color: 0x7289da },
];
function league(n) { return LEAGUES.find(l => n >= l.min) ?? LEAGUES.at(-1); }

// ── DB helpers ────────────────────────────────────────────────
function getFlights(userId)  { if (!db.flights[userId])  db.flights[userId]  = []; return db.flights[userId]; }
function getStrikes(userId)  { return db.strikes[userId] ?? 0; }
function getWarns(userId)    { if (!db.warns[userId])    db.warns[userId]    = []; return db.warns[userId]; }

// ── Permissions ───────────────────────────────────────────────
function isStaff(member) {
  return (
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    (config.STAFF_ROLE && member.roles.cache.has(config.STAFF_ROLE))
  );
}

// ── Embeds ────────────────────────────────────────────────────
function errorEmbed(msg) {
  return new EmbedBuilder().setColor(0xff4444).setDescription(`❌ ${msg}`);
}
function successEmbed(msg) {
  return new EmbedBuilder().setColor(0x57f287).setDescription(`✅ ${msg}`);
}
function star(n) { return "⭐".repeat(n); }

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
const CURRENCY      = config.CURRENCY      ?? "KD";
const CURRENCY_ICON = config.CURRENCY_ICON ?? "💰";

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
function formatKD(amount) {
  return `${CURRENCY_ICON} **${Number(amount).toLocaleString()} ${CURRENCY}**`;
}

// Base flight pay: basePay × aircraft multiplier
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

// ── NOTAMs ────────────────────────────────────────────────────
const NOTAM_COLORS = { INFO: 0x5865f2, CAUTION: 0xffd700, WARNING: 0xff8c00, CRITICAL: 0xff0000 };
const NOTAM_ICONS  = { INFO: "ℹ️",     CAUTION: "⚠️",     WARNING: "🚧",     CRITICAL: "🚨"    };

function buildNotamEmbed(notam) {
  const color = NOTAM_COLORS[notam.severity] ?? 0x5865f2;
  const icon  = NOTAM_ICONS[notam.severity]  ?? "📢";
  const exp   = notam.expiresAt
    ? `<t:${Math.floor(new Date(notam.expiresAt).getTime() / 1000)}:R>`
    : "No expiry";
  return new EmbedBuilder()
    .setTitle(`${icon} NOTAM — ${notam.title}`)
    .setColor(color)
    .setDescription(notam.body)
    .addFields(
      { name: "🆔 ID",       value: `\`${notam.id}\``, inline: true },
      { name: "⚡ Severity", value: notam.severity,    inline: true },
      { name: "⏳ Expires",  value: exp,               inline: true },
    )
    .setFooter({ text: `Issued by ${notam.authorTag ?? "Staff"} • AFBot NOTAMs` })
    .setTimestamp(new Date(notam.createdAt));
}

module.exports = {
  e, eObj,
  FLEET, FLEET_KEYS, isValidAircraft, normalizeAircraft,
  league,
  getFlights, getStrikes, getWarns, isStaff,
  errorEmbed, successEmbed, star, favRoute,
  CURRENCY, CURRENCY_ICON, getBalance, addBalance, deductBalance, logTx, formatKD, flightPay,
  genId, contractMatchesFlight,
  NOTAM_COLORS, NOTAM_ICONS, buildNotamEmbed,
};
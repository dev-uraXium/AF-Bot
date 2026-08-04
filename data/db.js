// data/db.js — JSON-backed persistent store
const fs   = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "store.json");

const defaults = {
  flights:        {},  // userId → [{ callsign, aircraft, departure, arrival, route, proofUrl, timestamp, approved }]
  pendingFlights: {},  // submissionId → { userId, callsign, aircraft, departure, arrival, route, proofUrl, timestamp }
  reviews:        [],
  strikes:        {},
  warns:          {},
  tickets:        {},
  balances:       {},
  txHistory:      {},
  contracts:      [],
  notams:         [],
};

function load() {
  if (!fs.existsSync(FILE)) return JSON.parse(JSON.stringify(defaults));
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    for (const k of Object.keys(defaults)) {
      if (raw[k] === undefined) raw[k] = JSON.parse(JSON.stringify(defaults[k]));
    }
    return raw;
  } catch { return JSON.parse(JSON.stringify(defaults)); }
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

const db = load();

setInterval(() => save(db), 30_000);
process.on("exit",    () => save(db));
process.on("SIGINT",  () => { save(db); process.exit(); });
process.on("SIGTERM", () => { save(db); process.exit(); });

module.exports = { db, save };
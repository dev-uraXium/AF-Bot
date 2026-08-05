// tasks/notamScheduler.js — 6-hour NOTAM scheduler, deletes previous, Components v2
const { db, save } = require("../data/db");
const { genId }     = require("../utils/helpers");
const config         = require("../config");
const { COLORS, text, separator, container, mediaGallery, componentsPayload } = require("../utils/components");

function zTime(date = new Date()) {
  const p = (n, l = 2) => String(n).padStart(l, "0");
  return `${date.getUTCFullYear()}${p(date.getUTCMonth()+1)}${p(date.getUTCDate())}T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`;
}

const NOTAM_POOL = [
  {
    substance: "ARPT ADVISORIES, OPERATIONAL ADJUSTMENTS",
    advisories: [
      "ALL CREW MEMBERS ARE REMINDED TO FILE COMPLETE FLIGHT PLANS BEFORE DEPARTURE. INCOMPLETE OR MISSING FLIGHT PLANS WILL RESULT IN LOG REJECTION BY DISPATCH.",
      "PILOTS ARE ADVISED TO CROSS-CHECK AIRCRAFT TYPE PRIOR TO LOGGING. ONLY AUTHORISED FLEET TYPES (A220, A320, A350, B787-9, B777-300ER) ARE ACCEPTED FOR FLIGHT CREDIT.",
    ],
    validity: "THIS NOTAM REMAINS EFFECTIVE UNTIL THE NEXT SCHEDULED ISSUANCE OR UNTIL FORMALLY CANCELLED BY FLIGHT OPERATIONS DEPARTMENT.",
  },
  {
    substance: "NETWORK ADVISORIES, CONTRACT OPERATIONS",
    advisories: [
      "DISPATCH ADVISES ALL CREW TO REVIEW ACTIVE CONTRACTS PRIOR TO FLIGHT. CONTRACT REWARDS ARE ISSUED AUTOMATICALLY UPON APPROVED FLIGHT LOG SUBMISSION MATCHING THE CONTRACTED ROUTE.",
      "FLIGHT OPERATIONS REMINDS ALL PILOTS THAT PROOF OF FLIGHT (SCREENSHOT) IS MANDATORY FOR ALL LOG SUBMISSIONS. LOGS WITHOUT VALID PROOF WILL BE REVOKED BY DISPATCH.",
    ],
    validity: "FLIGHT CREWS OPERATING WITHIN THE NETWORK MUST ACKNOWLEDGE THIS NOTAM BEFORE FLIGHT. THE DIRECTIVE REMAINS IN EFFECT UNTIL THE NEXT ISSUANCE OR UNTIL FORMALLY CANCELLED BY FLIGHT OPERATIONS DEPARTMENT.",
  },
  {
    substance: "CREW BRIEFING, OPERATIONAL ADVISORIES",
    advisories: [
      "PILOT ACTIVITY LEVELS ARE BEING MONITORED BY FLIGHT OPERATIONS. ALL ACTIVE PILOTS ARE ENCOURAGED TO LOG A MINIMUM OF ONE FLIGHT PER WEEK TO MAINTAIN ACTIVE STATUS.",
      "NEW CONTRACTS HAVE BEEN ISSUED AND ARE AVAILABLE FOR CLAIMING. CONTRACTS ARE SINGLE-CLAIM ONLY — FIRST COME FIRST SERVED.",
    ],
    validity: "AUTHORISED BY FLIGHT OPERATIONS DISPATCH. CLARIFICATION AVAILABLE VIA SUPPORT TICKET. THE DIRECTIVE REMAINS IN EFFECT UNTIL THE NEXT SCHEDULED NOTAM ISSUANCE.",
  },
  {
    substance: "ARPT RESTRICTIONS, ROUTE ADVISORIES",
    advisories: [
      "OPERATIONS BETWEEN LCLK/LCPH AND EGKK/EGHI ARE SUBJECT TO INCREASED ATC ACTIVITY. CREWS ARE ADVISED TO PLAN ADDITIONAL FUEL AND BRIEF FOR HOLDING PROCEDURES.",
      "FLIGHTS TO EFKT (KITTILÄ) ARE SUBJECT TO SEASONAL WEATHER RESTRICTIONS. MANDATORY DE-ICING PROCEDURES REQUIRED. CREWS MUST BRIEF FOR CONTAMINATED RUNWAY CONDITIONS.",
    ],
    validity: "OPERATIONAL NOTAM AUTHORISED BY DISPATCH. FLIGHT CREWS MUST ACKNOWLEDGE THIS NOTAM BEFORE OPERATING TO AFFECTED AIRPORTS. THE DIRECTIVE REMAINS IN EFFECT UNTIL FORMALLY CANCELLED.",
  },
  {
    substance: "AIRLINE ADVISORIES, CREW COMPLIANCE",
    advisories: [
      "ALL PILOTS HOLDING THREE OR MORE STRIKES ARE HEREBY NOTIFIED THAT THEIR ACCOUNTS ARE UNDER REVIEW. AFFECTED CREW ARE ADVISED TO OPEN A SUPPORT TICKET IMMEDIATELY.",
      "DISPATCH CONFIRMS THAT RANK PROMOTIONS ARE BASED ON TOTAL APPROVED FLIGHT COUNT. PENDING LOGS DO NOT QUALIFY.",
    ],
    validity: "THIS NOTAM IS ISSUED BY FLIGHT OPERATIONS AUTHORITY. ALL ACTIVE CREW MUST COMPLY. THE DIRECTIVE REMAINS EFFECTIVE UNTIL THE NEXT SCHEDULED ISSUANCE.",
  },
  {
    substance: "CARIBBEAN ROUTE ADVISORIES, MDPC/MDST/MTCA OPERATIONS",
    advisories: [
      "CREWS OPERATING TO CARIBBEAN DESTINATIONS (MDPC, MDST, MTCA) ARE ADVISED THAT EXTENDED OVER-WATER SEGMENTS REQUIRE ETOPS COMPLIANCE.",
      "CATERING AND HANDLING DISRUPTIONS REPORTED AT PUNTA CANA (MDPC). FUEL PLANNING SHOULD ACCOUNT FOR EXTENDED GROUND TIMES.",
    ],
    validity: "AUTHORISED BY FLIGHT OPERATIONS. CREWS MUST BRIEF THIS NOTAM BEFORE OPERATING TO CARIBBEAN DESTINATIONS. VALID UNTIL NEXT SCHEDULED ISSUANCE OR FORMAL CANCELLATION.",
  },
];

let poolIndex = 0;

function buildScheduledPanel(issuedAt, expiresAt, content) {
  const emoji = config.EMOJI;
  const name  = (config.AIRLINE_NAME ?? "VIRTUAL HQ").toUpperCase();

  const panel = container(COLORS.RED)
    .addTextDisplayComponents(text(`${emoji.WARNING.tag} **${name} — OPERATIONAL NOTAMS**`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(
      `**ISSUED AT**: ${zTime(issuedAt)}\n` +
      `**PERIOD OF VALIDITY**: ${zTime(issuedAt)} - ${zTime(expiresAt)}\n` +
      `**SUBSTANCE**: ${content.substance}.`
    ))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(
      `**ACTIVE AIRLINE ADVISORIES**\n\n` + content.advisories.map(a => `> ${a}`).join("\n\n")
    ))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`**AUTHORISATION / VALIDITY**\n${content.validity}`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`**END OF NOTICE**`));

  if (config.NOTAM_BANNER) {
    panel.addSeparatorComponents(separator()).addMediaGalleryComponents(mediaGallery(config.NOTAM_BANNER));
  }

  panel.addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`-# Issued and authorised by ${name} Flight Operations Department.`));

  return panel;
}

async function postScheduledNotam(client) {
  if (!config.NOTAM_CHANNEL) return;
  const ch = await client.channels.fetch(config.NOTAM_CHANNEL).catch(() => null);
  if (!ch) return;

  const prev = db.notams.find(n => n.scheduled && n.active && n.messageId);
  if (prev?.messageId) {
    try { await (await ch.messages.fetch(prev.messageId)).delete(); } catch {}
    prev.active = false;
  }

  const now       = new Date();
  const expiresAt = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const content   = NOTAM_POOL[poolIndex % NOTAM_POOL.length];
  poolIndex++;

  const notam = {
    id: genId(), title: "Operational NOTAM",
    body: content.advisories.join(" | "),
    severity: "INFO", authorTag: client.user.tag,
    createdAt: now.toISOString(), expiresAt: expiresAt.toISOString(),
    active: true, scheduled: true, messageId: null,
  };

  try {
    const msg = await ch.send(componentsPayload([buildScheduledPanel(now, expiresAt, content)]));
    notam.messageId = msg.id;
    db.notams.push(notam);
    save(db);
    console.log(`[NOTAMs] Posted: ${notam.id}`);
  } catch (err) {
    console.error("[NOTAMs] Failed to post:", err.message);
  }
}

async function postManualNotam(client, notam) {
  if (!config.NOTAM_CHANNEL) return null;
  const ch = await client.channels.fetch(config.NOTAM_CHANNEL).catch(() => null);
  if (!ch) return null;
  const now       = new Date(notam.createdAt);
  const expiresAt = notam.expiresAt ? new Date(notam.expiresAt) : new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const content   = {
    substance: notam.severity,
    advisories: [notam.body.toUpperCase()],
    validity: `THIS NOTAM REMAINS IN EFFECT UNTIL ${zTime(expiresAt)} OR UNTIL FORMALLY CANCELLED BY FLIGHT OPERATIONS DEPARTMENT.`,
  };
  try {
    const msg = await ch.send(componentsPayload([buildScheduledPanel(now, expiresAt, content)]));
    notam.messageId = msg.id;
    save(db);
    return msg;
  } catch (err) {
    console.error("[NOTAMs] Failed to post manual:", err.message);
    return null;
  }
}

function startExpiryWatcher(client) {
  const check = async () => {
    const now = Date.now();
    let changed = false;
    for (const n of db.notams) {
      if (!n.active) continue;
      if (n.expiresAt && new Date(n.expiresAt).getTime() < now) {
        n.active = false;
        changed  = true;
      }
    }
    if (changed) save(db);
  };
  check();
  setInterval(check, 5 * 60 * 1000);
  console.log("[NOTAMs] Expiry watcher started.");
}

function startScheduledNotams(client) {
  setTimeout(() => postScheduledNotam(client), 5_000);
  setInterval(() => postScheduledNotam(client), 6 * 60 * 60 * 1000);
  console.log("[NOTAMs] 6-hour scheduler started.");
}

module.exports = { startExpiryWatcher, startScheduledNotams, postScheduledNotam, postManualNotam, zTime };
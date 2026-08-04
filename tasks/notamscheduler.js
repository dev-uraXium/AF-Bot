// tasks/notamScheduler.js — Auto-expire NOTAMs + post new ones on schedule
const { EmbedBuilder } = require("discord.js");
const { db, save }     = require("../data/db");
const { buildNotamEmbed, NOTAM_COLORS, NOTAM_ICONS, genId } = require("../utils/helpers");
const config           = require("../config");

// ── Auto-expiry check (runs every 5 minutes) ──────────────────
function startExpiryWatcher(client) {
  const check = async () => {
    const now     = Date.now();
    let changed   = false;

    for (const notam of db.notams) {
      if (!notam.active) continue;
      if (notam.expiresAt && new Date(notam.expiresAt).getTime() < now) {
        notam.active = false;
        changed      = true;
        console.log(`[NOTAMs] Expired: ${notam.id} — ${notam.title}`);

        // Try to edit the original Discord message to show expired
        if (notam.messageId && config.NOTAM_CHANNEL) {
          try {
            const ch  = await client.channels.fetch(config.NOTAM_CHANNEL);
            const msg = await ch.messages.fetch(notam.messageId);
            const expiredEmbed = buildNotamEmbed(notam)
              .setTitle(`~~${NOTAM_ICONS[notam.severity] ?? "📢"} NOTAM — ${notam.title}~~ *(Expired)*`)
              .setColor(0x36393f);
            await msg.edit({ embeds: [expiredEmbed], components: [] });
          } catch {}
        }
      }
    }

    if (changed) save(db);
  };

  // Run immediately, then every 5 minutes
  check();
  setInterval(check, 5 * 60 * 1000);
  console.log("[NOTAMs] Expiry watcher started.");
}

// ── Post a NOTAM to the NOTAM channel ─────────────────────────
async function postNotam(client, notam) {
  if (!config.NOTAM_CHANNEL) return null;
  try {
    const ch  = await client.channels.fetch(config.NOTAM_CHANNEL);
    const msg = await ch.send({
      content: notam.severity === "CRITICAL" ? "@everyone" : null,
      embeds:  [buildNotamEmbed(notam)],
    });
    notam.messageId = msg.id;
    save(db);
    return msg;
  } catch (err) {
    console.error("[NOTAMs] Failed to post:", err.message);
    return null;
  }
}

// ── Scheduled / automatic NOTAMs ──────────────────────────────
// These fire at set intervals to remind pilots of standing rules.
// Edit the SCHEDULED_NOTAMS array to customise or remove entries.
const SCHEDULED_NOTAMS = [
  {
    title:    "Proof Required for All Flights",
    body:     "Reminder: all flight logs **must** include a valid screenshot taken during the flight. Logs submitted without clear proof are subject to revocation.",
    severity: "INFO",
    interval: 24 * 60 * 60 * 1000,  // every 24 hours
  },
  {
    title:    "Fleet Compliance Reminder",
    body:     "Only the following aircraft are authorised for logging:\n• Airbus A350 · A320 · A220\n• Boeing 777 · 787\n\nUse of any other type will result in log rejection.",
    severity: "INFO",
    interval: 48 * 60 * 60 * 1000,  // every 48 hours
  },
  {
    title:    "Contract Expiry Warning",
    body:     "Check your active contracts with `/contract mine`. Expired contracts are automatically released — don't lose your reward!",
    severity: "CAUTION",
    interval: 12 * 60 * 60 * 1000,  // every 12 hours
  },
];

const schedulerTimers = {};

function startScheduledNotams(client) {
  for (const template of SCHEDULED_NOTAMS) {
    const fire = async () => {
      // Skip if NOTAM channel not set
      if (!config.NOTAM_CHANNEL) return;

      const notam = {
        id:         genId(),
        title:      template.title,
        body:       template.body,
        severity:   template.severity,
        authorTag:  client.user.tag,
        createdAt:  new Date().toISOString(),
        expiresAt:  new Date(Date.now() + template.interval - 60_000).toISOString(), // expires just before next fire
        active:     true,
        scheduled:  true,
        messageId:  null,
      };

      db.notams.push(notam);
      save(db);
      await postNotam(client, notam);
      console.log(`[NOTAMs] Scheduled NOTAM posted: ${notam.title}`);
    };

    // Fire once after a short delay so client is ready, then on interval
    setTimeout(fire, 10_000);
    schedulerTimers[template.title] = setInterval(fire, template.interval);
  }
  console.log(`[NOTAMs] ${SCHEDULED_NOTAMS.length} scheduled NOTAM(s) active.`);
}

module.exports = { startExpiryWatcher, startScheduledNotams, postNotam };
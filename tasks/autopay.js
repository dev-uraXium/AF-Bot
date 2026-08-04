// tasks/autopay.js — Run after a flight is approved; pays contract rewards
const { EmbedBuilder }  = require("discord.js");
const { db, save }      = require("../data/db");
const { addBalance, logTx, formatKD, contractMatchesFlight, CURRENCY } = require("../utils/helpers");

/**
 * Called when a flight is approved.
 * Scans all claimed contracts for this pilot and auto-pays if the flight matches.
 * Returns array of paid contract results (may be empty).
 */
async function runAutopay(client, userId, flight) {
  const now     = Date.now();
  const results = [];

  const matching = db.contracts.filter(c =>
    c.active &&
    c.claimedBy === userId &&
    !c.completedBy?.includes(userId) &&
    contractMatchesFlight(c, flight) &&
    (!c.expiresAt || new Date(c.expiresAt).getTime() > now)
  );

  if (!matching.length) return results;

  for (const c of matching) {
    if (!c.completedBy) c.completedBy = [];
    c.completedBy.push(userId);
    c.claimedBy = null;

    if (c.slots) {
      c.slotsUsed = (c.slotsUsed || 0) + 1;
      if (c.slotsUsed >= c.slots) c.active = false;
    }

    const newBal = addBalance(userId, c.reward);
    logTx(userId, "CONTRACT", c.reward, `Autopay: ${c.title} (${c.id})`);
    results.push({ contract: c, newBal });
  }

  save(db);

  // DM the pilot about their contract payouts
  try {
    const user = await client.users.fetch(userId);
    const lines = results.map(r =>
      `• **${r.contract.title}** — +${r.contract.reward.toLocaleString()} ${CURRENCY}`
    ).join("\n");
    await user.send({
      embeds: [
        new EmbedBuilder()
          .setTitle("💰 Contract Autopay!")
          .setColor(0x57f287)
          .setDescription(`Your approved flight matched **${results.length}** contract(s)!\n\n${lines}\n\n**New Balance:** ${formatKD(results.at(-1).newBal)}`)
          .setFooter({ text: "AFBot Virtual Economy" })
          .setTimestamp()
      ]
    });
  } catch {}

  return results;
}

module.exports = { runAutopay };
// commands/contracts.js — Contract System
// /contract list | claim | unclaim | complete | create | delete | info | active
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { db, save } = require("../data/db");
const {
  isStaff, errorEmbed, addBalance, logTx,
  CURRENCY, CURRENCY_ICON, FLEET_KEYS, FLEET_CHOICES,
  genId, contractMatchesFlight,
} = require("../utils/helpers");

const DIFF_COLOR = { EASY: 0x57f287, MEDIUM: 0xffd700, HARD: 0xff8c00, ELITE: 0xff0000 };
const DIFF_EMOJI = { EASY: "🟢", MEDIUM: "🟡", HARD: "🟠", ELITE: "🔴" };
const DIFF_BONUS = { EASY: 0, MEDIUM: 200, HARD: 500, ELITE: 1000 };

function contractEmbed(c, showClaimed = false) {
  const exp = c.expiresAt ? `<t:${Math.floor(new Date(c.expiresAt).getTime()/1000)}:R>` : "No expiry";
  const ac  = (!c.aircraft || c.aircraft.includes("ANY")) ? "Any fleet aircraft" : c.aircraft.join(", ");
  const embed = new EmbedBuilder()
    .setTitle(`📋 ${c.title}`)
    .setColor(DIFF_COLOR[c.difficulty] ?? 0x5865f2)
    .setDescription(c.description)
    .addFields(
      { name: "🛫 From",       value: c.departure,   inline: true },
      { name: "🛬 To",         value: c.arrival,     inline: true },
      { name: "✈️ Aircraft",   value: ac,            inline: true },
      { name: `${CURRENCY_ICON} Reward`,  value: `**${c.reward.toLocaleString()} ${CURRENCY}**`, inline: true },
      { name: "🏆 Difficulty", value: `${DIFF_EMOJI[c.difficulty]} ${c.difficulty}`, inline: true },
      { name: "⏳ Expires",    value: exp,           inline: true },
      { name: "🆔 Contract ID",value: `\`${c.id}\``, inline: true },
    );
  if (showClaimed && c.claimedBy) embed.addFields({ name: "👤 Claimed By", value: `<@${c.claimedBy}>`, inline: true });
  embed.setFooter({ text: `AFBot Contracts • Use /contract claim ${c.id} to claim` });
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("contract")
    .setDescription("Contract management system.")

    .addSubcommand(s => s.setName("list").setDescription("List all available unclaimed contracts.")
      .addStringOption(o => o.setName("difficulty").setDescription("Filter by difficulty").setRequired(false)
        .addChoices({name:"🟢 Easy",value:"EASY"},{name:"🟡 Medium",value:"MEDIUM"},{name:"🟠 Hard",value:"HARD"},{name:"🔴 Elite",value:"ELITE"})))

    .addSubcommand(s => s.setName("info").setDescription("View full details of a contract.")
      .addStringOption(o => o.setName("id").setDescription("Contract ID").setRequired(true)))

    .addSubcommand(s => s.setName("claim").setDescription("Claim a contract to work on.")
      .addStringOption(o => o.setName("id").setDescription("Contract ID").setRequired(true)))

    .addSubcommand(s => s.setName("unclaim").setDescription("Release a contract you claimed.")
      .addStringOption(o => o.setName("id").setDescription("Contract ID").setRequired(true)))

    .addSubcommand(s => s.setName("mine").setDescription("View contracts you have claimed."))

    .addSubcommand(s => s.setName("complete").setDescription("Manually complete a contract (staff verify).")
      .addStringOption(o => o.setName("id").setDescription("Contract ID").setRequired(true))
      .addAttachmentOption(o => o.setName("proof").setDescription("Screenshot of completed flight").setRequired(true)))

    .addSubcommand(s => s.setName("create").setDescription("Create a new contract. (Staff only)")
      .addStringOption(o => o.setName("title").setDescription("Contract title").setRequired(true))
      .addStringOption(o => o.setName("description").setDescription("Contract description").setRequired(true))
      .addStringOption(o => o.setName("departure").setDescription("ICAO departure (or ANY)").setRequired(true))
      .addStringOption(o => o.setName("arrival").setDescription("ICAO arrival (or ANY)").setRequired(true))
      .addIntegerOption(o => o.setName("reward").setDescription("Payout in KD").setRequired(true).setMinValue(100))
      .addStringOption(o => o.setName("difficulty").setDescription("Difficulty level").setRequired(true)
        .addChoices({name:"🟢 Easy",value:"EASY"},{name:"🟡 Medium",value:"MEDIUM"},{name:"🟠 Hard",value:"HARD"},{name:"🔴 Elite",value:"ELITE"}))
      .addStringOption(o => o.setName("aircraft").setDescription("Required aircraft (comma-separated, or ANY)").setRequired(false))
      .addStringOption(o => o.setName("expires").setDescription("Expiry (e.g. 7d, 24h, or leave blank)").setRequired(false))
      .addIntegerOption(o => o.setName("slots").setDescription("Max pilots who can complete (default unlimited)").setRequired(false).setMinValue(1)))

    .addSubcommand(s => s.setName("delete").setDescription("Delete a contract. (Staff only)")
      .addStringOption(o => o.setName("id").setDescription("Contract ID").setRequired(true)))

    .addSubcommand(s => s.setName("approve").setDescription("Approve and pay a completed contract. (Staff only)")
      .addStringOption(o => o.setName("id").setDescription("Contract ID").setRequired(true))
      .addUserOption(o => o.setName("pilot").setDescription("Pilot to pay").setRequired(true))),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── LIST ──────────────────────────────────────────────────
    if (sub === "list") {
      const diff = interaction.options.getString("difficulty");
      // Expire old contracts
      const now = Date.now();
      db.contracts.forEach(c => {
        if (c.expiresAt && new Date(c.expiresAt).getTime() < now) c.active = false;
      });
      save(db);

      let available = db.contracts.filter(c =>
        c.active && !c.claimedBy &&
        (!diff || c.difficulty === diff)
      );

      if (!available.length) {
        return interaction.reply({ content: "📭 No contracts available right now. Check back later!", ephemeral: true });
      }

      // Group by difficulty
      const sorted = available.sort((a,b) => {
        const order = ["ELITE","HARD","MEDIUM","EASY"];
        return order.indexOf(a.difficulty) - order.indexOf(b.difficulty);
      });

      const desc = sorted.slice(0,10).map(c => {
        const exp = c.expiresAt ? `<t:${Math.floor(new Date(c.expiresAt).getTime()/1000)}:R>` : "∞";
        const ac  = (!c.aircraft||c.aircraft.includes("ANY")) ? "Any" : c.aircraft.join("/");
        return `${DIFF_EMOJI[c.difficulty]} **${c.title}** • \`${c.id}\`\n> ${c.departure}→${c.arrival} · ${ac} · **${c.reward.toLocaleString()} ${CURRENCY}** · Exp: ${exp}`;
      }).join("\n\n");

      const embed = new EmbedBuilder()
        .setTitle("📋 Available Contracts")
        .setColor(0x5865f2)
        .setDescription(desc)
        .addFields({ name: "ℹ️ How to claim", value: "Use `/contract claim <ID>` to claim a contract, then log the matching flight to get auto-paid!", inline: false })
        .setFooter({ text: `${sorted.length} contract(s) available${diff ? ` (${diff})` : ""}` })
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    }

    // ── INFO ──────────────────────────────────────────────────
    if (sub === "info") {
      const id = interaction.options.getString("id").toUpperCase();
      const c  = db.contracts.find(c => c.id === id);
      if (!c) return interaction.reply({ embeds: [errorEmbed(`Contract \`${id}\` not found.`)], ephemeral: true });
      return interaction.reply({ embeds: [contractEmbed(c, isStaff(interaction.member))] });
    }

    // ── CLAIM ─────────────────────────────────────────────────
    if (sub === "claim") {
      const id = interaction.options.getString("id").toUpperCase();
      const c  = db.contracts.find(c => c.id === id);
      if (!c)        return interaction.reply({ embeds: [errorEmbed(`Contract \`${id}\` not found.`)], ephemeral: true });
      if (!c.active) return interaction.reply({ embeds: [errorEmbed("This contract is no longer active.")], ephemeral: true });
      if (c.claimedBy) return interaction.reply({ embeds: [errorEmbed("This contract has already been claimed.")], ephemeral: true });
      if (c.completedBy?.includes(interaction.user.id)) return interaction.reply({ embeds: [errorEmbed("You already completed this contract.")], ephemeral: true });

      // Check pilot doesn't already have too many active claims
      const activeClaims = db.contracts.filter(x => x.active && x.claimedBy === interaction.user.id);
      if (activeClaims.length >= 3) return interaction.reply({ embeds: [errorEmbed("You can only hold **3 active contracts** at a time. Use `/contract unclaim` to release one.")], ephemeral: true });

      c.claimedBy = interaction.user.id;
      save(db);

      const exp = c.expiresAt ? `\n**Expires:** <t:${Math.floor(new Date(c.expiresAt).getTime()/1000)}:R>` : "";
      const ac  = (!c.aircraft||c.aircraft.includes("ANY")) ? "Any fleet aircraft" : c.aircraft.join(", ");

      return interaction.reply({ embeds: [
        new EmbedBuilder()
          .setTitle("✅ Contract Claimed!")
          .setColor(DIFF_COLOR[c.difficulty])
          .setDescription(`You have claimed **${c.title}**.\n\nLog a flight matching this contract's route and aircraft to get **auto-paid** instantly!${exp}`)
          .addFields(
            { name: "🛫 From",       value: c.departure, inline: true },
            { name: "🛬 To",         value: c.arrival,   inline: true },
            { name: "✈️ Aircraft",   value: ac,          inline: true },
            { name: `${CURRENCY_ICON} Reward`, value: `**${c.reward.toLocaleString()} ${CURRENCY}**`, inline: true },
            { name: "🆔 ID",         value: `\`${c.id}\``, inline: true },
          )
          .setFooter({ text: "Log your flight now to earn your reward!" })
          .setTimestamp()
      ]});
    }

    // ── UNCLAIM ───────────────────────────────────────────────
    if (sub === "unclaim") {
      const id = interaction.options.getString("id").toUpperCase();
      const c  = db.contracts.find(c => c.id === id && c.claimedBy === interaction.user.id);
      if (!c) return interaction.reply({ embeds: [errorEmbed("You don't have this contract claimed.")], ephemeral: true });
      c.claimedBy = null;
      save(db);
      return interaction.reply({ embeds: [
        new EmbedBuilder().setColor(0xffd700).setDescription(`✅ Released contract **${c.title}** (\`${c.id}\`). It's now available for others to claim.`).setTimestamp()
      ]});
    }

    // ── MINE ──────────────────────────────────────────────────
    if (sub === "mine") {
      const mine = db.contracts.filter(c => c.active && c.claimedBy === interaction.user.id);
      if (!mine.length) return interaction.reply({ content: "📭 You have no active contracts. Use `/contract list` to browse!", ephemeral: true });
      const desc = mine.map(c => {
        const exp = c.expiresAt ? `Exp <t:${Math.floor(new Date(c.expiresAt).getTime()/1000)}:R>` : "No expiry";
        return `${DIFF_EMOJI[c.difficulty]} **${c.title}** \`${c.id}\`\n> ${c.departure}→${c.arrival} · **${c.reward.toLocaleString()} ${CURRENCY}** · ${exp}`;
      }).join("\n\n");
      return interaction.reply({ embeds: [
        new EmbedBuilder().setTitle("📋 Your Active Contracts").setColor(0x5865f2)
          .setDescription(desc).setFooter({ text: "Log matching flights to auto-complete and get paid!" }).setTimestamp()
      ]});
    }

    // ── COMPLETE (manual submission) ──────────────────────────
    if (sub === "complete") {
      const id    = interaction.options.getString("id").toUpperCase();
      const proof = interaction.options.getAttachment("proof");
      const c     = db.contracts.find(c => c.id === id);
      if (!c)           return interaction.reply({ embeds: [errorEmbed(`Contract \`${id}\` not found.`)], ephemeral: true });
      if (!c.active)    return interaction.reply({ embeds: [errorEmbed("Contract is no longer active.")], ephemeral: true });
      if (c.claimedBy !== interaction.user.id) return interaction.reply({ embeds: [errorEmbed("You haven't claimed this contract.")], ephemeral: true });
      if (c.completedBy?.includes(interaction.user.id)) return interaction.reply({ embeds: [errorEmbed("Already completed.")], ephemeral: true });
      if (!proof.contentType?.startsWith("image/")) return interaction.reply({ embeds: [errorEmbed("Proof must be an image.")], ephemeral: true });

      // Post to staff for review if contract channel is set
      if (process.env.CONTRACT_REVIEW_CHANNEL) {
        const ch = await interaction.client.channels.fetch(process.env.CONTRACT_REVIEW_CHANNEL).catch(()=>null);
        if (ch) {
          await ch.send({ embeds: [
            new EmbedBuilder().setTitle("📋 Contract Completion Request").setColor(0xffd700)
              .setDescription(`<@${interaction.user.id}> is claiming completion of **${c.title}** (\`${c.id}\`)`)
              .addFields(
                { name: "Pilot",    value: `<@${interaction.user.id}>`, inline: true },
                { name: "Contract", value: `${c.departure}→${c.arrival}`, inline: true },
                { name: "Reward",   value: `${c.reward.toLocaleString()} ${CURRENCY}`, inline: true },
              )
              .setImage(proof.url)
              .setFooter({ text: `Use /contract approve ${c.id} @pilot to pay` }).setTimestamp()
          ]});
        }
      }

      return interaction.reply({ embeds: [
        new EmbedBuilder().setColor(0xffd700)
          .setDescription(`📋 Your completion request for **${c.title}** has been submitted for staff review. You'll be paid once approved!`)
          .setTimestamp()
      ], ephemeral: true });
    }

    // ── CREATE (staff) ────────────────────────────────────────
    if (sub === "create") {
      if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed("Staff only.")], ephemeral: true });

      const title  = interaction.options.getString("title");
      const desc   = interaction.options.getString("description");
      const dep    = interaction.options.getString("departure").toUpperCase();
      const arr    = interaction.options.getString("arrival").toUpperCase();
      const reward = interaction.options.getInteger("reward");
      const diff   = interaction.options.getString("difficulty");
      const acRaw  = interaction.options.getString("aircraft");
      const expStr = interaction.options.getString("expires");
      const slots  = interaction.options.getInteger("slots") ?? null;

      // Parse aircraft
      let aircraft = ["ANY"];
      if (acRaw && acRaw.toUpperCase() !== "ANY") {
        aircraft = acRaw.split(",").map(s => s.trim().toUpperCase()).filter(s => FLEET_KEYS.includes(s));
        if (!aircraft.length) return interaction.reply({ embeds: [errorEmbed(`Invalid aircraft. Valid: ${FLEET_KEYS.join(", ")}`)], ephemeral: true });
      }

      // Parse expiry
      let expiresAt = null;
      if (expStr) {
        const match = expStr.match(/^(\d+)(d|h|m)$/i);
        if (!match) return interaction.reply({ embeds: [errorEmbed("Invalid expiry format. Use e.g. `7d`, `24h`, `90m`.")], ephemeral: true });
        const mult = { d: 86400000, h: 3600000, m: 60000 };
        expiresAt = new Date(Date.now() + parseInt(match[1]) * mult[match[2].toLowerCase()]).toISOString();
      }

      const bonus = DIFF_BONUS[diff] ?? 0;

      const contract = {
        id: genId(), title, description: desc,
        departure: dep, arrival: arr, aircraft,
        reward: reward + bonus, baseReward: reward, bonusReward: bonus,
        difficulty: diff, expiresAt, slots, slotsUsed: 0,
        createdBy: interaction.user.id, active: true,
        claimedBy: null, completedBy: [],
        createdAt: new Date().toISOString(),
      };

      db.contracts.push(contract);
      save(db);

      const embed = contractEmbed(contract);
      embed.setTitle(`✅ Contract Created — ${title}`);
      embed.setDescription(`${desc}\n\n**Difficulty Bonus:** +${bonus.toLocaleString()} ${CURRENCY}\n**Total Payout:** ${contract.reward.toLocaleString()} ${CURRENCY}`);

      await interaction.reply({ embeds: [embed] });

      // Announce in contracts channel
      if (process.env.CONTRACT_CHANNEL) {
        const ch = await interaction.client.channels.fetch(process.env.CONTRACT_CHANNEL).catch(()=>null);
        if (ch) {
          const ann = contractEmbed(contract);
          ann.setTitle(`🆕 New Contract Posted — ${title}`);
          ch.send({ content: "📢 **A new contract is available!** Use `/contract claim` to take it.", embeds: [ann] });
        }
      }
      return;
    }

    // ── DELETE (staff) ────────────────────────────────────────
    if (sub === "delete") {
      if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed("Staff only.")], ephemeral: true });
      const id  = interaction.options.getString("id").toUpperCase();
      const idx = db.contracts.findIndex(c => c.id === id);
      if (idx === -1) return interaction.reply({ embeds: [errorEmbed(`Contract \`${id}\` not found.`)], ephemeral: true });
      const [removed] = db.contracts.splice(idx, 1);
      save(db);
      return interaction.reply({ embeds: [
        new EmbedBuilder().setColor(0xff4444)
          .setDescription(`🗑️ Deleted contract **${removed.title}** (\`${removed.id}\`).`).setTimestamp()
      ]});
    }

    // ── APPROVE (staff) ───────────────────────────────────────
    if (sub === "approve") {
      if (!isStaff(interaction.member)) return interaction.reply({ embeds: [errorEmbed("Staff only.")], ephemeral: true });
      const id     = interaction.options.getString("id").toUpperCase();
      const pilot  = interaction.options.getUser("pilot");
      const c      = db.contracts.find(c => c.id === id);
      if (!c) return interaction.reply({ embeds: [errorEmbed(`Contract \`${id}\` not found.`)], ephemeral: true });
      if (c.completedBy?.includes(pilot.id)) return interaction.reply({ embeds: [errorEmbed("Pilot already paid for this contract.")], ephemeral: true });

      if (!c.completedBy) c.completedBy = [];
      c.completedBy.push(pilot.id);
      c.claimedBy = null;

      // Close contract if slots used up
      if (c.slots) {
        c.slotsUsed = (c.slotsUsed || 0) + 1;
        if (c.slotsUsed >= c.slots) c.active = false;
      }

      const newBal = addBalance(pilot.id, c.reward);
      logTx(pilot.id, "CONTRACT", c.reward, `Contract: ${c.title} (${c.id})`, interaction.user.id);
      save(db);

      await interaction.reply({ embeds: [
        new EmbedBuilder().setTitle(`${CURRENCY_ICON} Contract Approved & Paid`).setColor(0x57f287)
          .addFields(
            { name: "👤 Pilot",       value: `<@${pilot.id}>`, inline: true },
            { name: "📋 Contract",    value: c.title,          inline: true },
            { name: `${CURRENCY_ICON} Paid`, value: `**${c.reward.toLocaleString()} ${CURRENCY}**`, inline: true },
            { name: "💵 New Balance", value: `**${newBal.toLocaleString()} ${CURRENCY}**`, inline: true },
          ).setTimestamp()
      ]});

      pilot.send({ embeds: [
        new EmbedBuilder().setTitle(`${CURRENCY_ICON} Contract Completed!`).setColor(0x57f287)
          .setDescription(`Your contract **${c.title}** has been approved!\n\n**Reward: +${c.reward.toLocaleString()} ${CURRENCY}**\n**New Balance: ${newBal.toLocaleString()} ${CURRENCY}**`)
          .setFooter({ text: "AFBot Virtual Economy" }).setTimestamp()
      ]}).catch(()=>{});
    }
  },

  // Exported for autopay in log.js
  tryAutopay,
};

// ── Autopay on flight log ─────────────────────────────────────
async function tryAutopay(userId, flight, client) {
  const now = Date.now();
  const matches = db.contracts.filter(c =>
    c.active &&
    c.claimedBy === userId &&
    !c.completedBy?.includes(userId) &&
    contractMatchesFlight(c, flight) &&
    (!c.expiresAt || new Date(c.expiresAt).getTime() > now)
  );

  if (!matches.length) return null;

  const results = [];
  for (const c of matches) {
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
  return results;
}
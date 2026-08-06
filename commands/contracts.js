// commands/contracts.js
const { SlashCommandBuilder, ButtonStyle } = require("discord.js");
const { db, save } = require("../data/db");
const config        = require("../config");
const {
  isStaff, addBalance, logTx, CURRENCY, FLEET_KEYS, genId, TIERS, hasTier, AIRPORT_CHOICES,
} = require("../utils/helpers");
const { COLORS, text, separator, container, button, row, componentsPayload } = require("../utils/components");

const DIFF_COLOR = { EASY: COLORS.GREEN, MEDIUM: COLORS.GOLD, HARD: COLORS.ORANGE, ELITE: COLORS.RED };
const DIFF_BONUS = { EASY: 0, MEDIUM: 200, HARD: 500, ELITE: 1000 };

const EXTRA_TIER_CHANNELS = {
  EASY:   [],
  MEDIUM: ["PRESTIGE"],
  HARD:   ["SIGNATURE", "APOGEE"],
  ELITE:  ["APOGEE", "PREMIERE"],
};

// ── Route pools ─────────────────────────────────────────────
const NORMAL_ROUTES = [
  { dep: "EGKK", arr: "LEMH", ac: ["A220", "A320"], diff: "EASY",   reward: 900  },
  { dep: "LEMH", arr: "EGKK", ac: ["A220", "A320"], diff: "EASY",   reward: 900  },
  { dep: "EGHI", arr: "LEMH", ac: ["A220", "A320"], diff: "EASY",   reward: 850  },
  { dep: "EGKK", arr: "GCLP", ac: ["A320", "A350"], diff: "MEDIUM", reward: 1600 },
  { dep: "GCLP", arr: "EGKK", ac: ["A320", "A350"], diff: "MEDIUM", reward: 1600 },
  { dep: "EGKK", arr: "EFKT", ac: ["A320", "A220"], diff: "MEDIUM", reward: 1400 },
  { dep: "LCLK", arr: "LEMH", ac: ["A220", "A320"], diff: "EASY",   reward: 850  },
  { dep: "MDST", arr: "MDPC", ac: ["A220", "A320"], diff: "EASY",   reward: 700  },
];
const PRESTIGE_ROUTES = [
  { dep: "EGKK", arr: "LCLK", ac: ["A320", "A350"], diff: "MEDIUM", reward: 2000 },
  { dep: "LCLK", arr: "EGKK", ac: ["A320", "A350"], diff: "MEDIUM", reward: 2000 },
  { dep: "EGHI", arr: "GCLP", ac: ["A320", "A350"], diff: "MEDIUM", reward: 1800 },
  { dep: "LCLK", arr: "GCLP", ac: ["A320", "A350"], diff: "MEDIUM", reward: 1900 },
];
const SIGNATURE_ROUTES = [
  { dep: "EGKK", arr: "MDPC", ac: ["B789", "B773"], diff: "HARD", reward: 3200 },
  { dep: "MDPC", arr: "EGKK", ac: ["B789", "B773"], diff: "HARD", reward: 3200 },
  { dep: "EGKK", arr: "LCLK", ac: ["B773", "A350"], diff: "HARD", reward: 2800 },
  { dep: "EGHI", arr: "LCLK", ac: ["A350", "B789"], diff: "HARD", reward: 2600 },
];
const APOGEE_ROUTES = [
  { dep: "EGKK", arr: "MTCA", ac: ["B773", "B789"], diff: "HARD",  reward: 4000 },
  { dep: "LCLK", arr: "MDPC", ac: ["B773", "B789"], diff: "HARD",  reward: 3800 },
  { dep: "EGKK", arr: "MDST", ac: ["B773"],         diff: "ELITE", reward: 5000 },
  { dep: "LCLK", arr: "MTCA", ac: ["B773"],         diff: "ELITE", reward: 5200 },
];
const PREMIERE_ROUTES = [
  { dep: "EGKK", arr: "MTCA", ac: ["B773"], diff: "ELITE", reward: 7000 },
  { dep: "LCLK", arr: "MDPC", ac: ["B773"], diff: "ELITE", reward: 6800 },
  { dep: "EGHI", arr: "MDST", ac: ["B773"], diff: "ELITE", reward: 6500 },
  { dep: "EGKK", arr: "MDST", ac: ["B773"], diff: "ELITE", reward: 7200 },
];
const TIER_ROUTE_MAP = { PRESTIGE: PRESTIGE_ROUTES, SIGNATURE: SIGNATURE_ROUTES, APOGEE: APOGEE_ROUTES, PREMIERE: PREMIERE_ROUTES };

const TEMPLATES = [
  { title: (d,a) => `Priority Cargo Run — ${d} to ${a}`,
    desc:  (d,a,ac) => `**DISPATCH BRIEFING**\nA time-sensitive cargo consignment must be transported from **${d}** to **${a}**.\n\nCrew must operate the **${ac}**. Proof of completed flight is mandatory.` },
  { title: (d,a) => `Charter Flight — ${d} → ${a}`,
    desc:  (d,a,ac) => `**DISPATCH BRIEFING**\nA high-priority charter service has been requested between **${d}** and **${a}**, requiring experienced crew on the **${ac}**.\n\nNon-stop service. Submit proof upon completion.` },
  { title: (d,a) => `ACMI Lease Operation — ${d}/${a}`,
    desc:  (d,a,ac) => `**DISPATCH BRIEFING**\nAn ACMI lease has been activated for the **${d}**–**${a}** sector. The **${ac}** operates on behalf of the contracting carrier.\n\nSubmit flight proof upon sector completion.` },
  { title: (d,a) => `Positioning Flight — ${d} to ${a}`,
    desc:  (d,a,ac) => `**DISPATCH BRIEFING**\nA **${ac}** requires repositioning from **${d}** to **${a}**. Ferry flight, no revenue passengers.\n\nProof of departure and arrival must be submitted.` },
  { title: (d,a) => `Relief Flight — ${d}–${a}`,
    desc:  (d,a,ac) => `**DISPATCH BRIEFING**\nDue to disruption at **${a}**, a relief flight has been authorised from **${d}**. The **${ac}** is assigned.\n\nFull proof of flight is required.` },
];
function makeContent(dep, arr, acLabel) {
  const t = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  return { title: t.title(dep, arr), description: t.desc(dep, arr, acLabel) };
}

// ── Panel builder ──────────────────────────────────────────────
function contractPanel(c, tierLabel = null) {
  const emoji = config.EMOJI;
  const exp = c.expiresAt ? `<t:${Math.floor(new Date(c.expiresAt).getTime()/1000)}:R>` : "No expiry";
  const ac  = (!c.aircraft || c.aircraft.includes("ANY")) ? "Any fleet aircraft" : c.aircraft.join(", ");
  const status = c.claimedBy ? `Claimed by <@${c.claimedBy}>` : "Available";

  const panel = container(DIFF_COLOR[c.difficulty] ?? COLORS.PURPLE)
    .addTextDisplayComponents(text(
      tierLabel
        ? `${emoji.SCROLL.tag} **${tierLabel} Exclusive Contract**`
        : `${emoji.SCROLL.tag} **New Contract**`
    ))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(`**${c.title}**\n${c.description}`))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text(
      `**Departure**: ${c.departure}\n**Arrival**: ${c.arrival}\n**Aircraft**: ${ac}\n` +
      `**Reward**: ${c.reward.toLocaleString()} ${CURRENCY}\n**Difficulty**: ${c.difficulty}\n` +
      `**Expires**: ${exp}\n**Contract ID**: \`${c.id}\`\n**Status**: ${status}`
    ))
    .addSeparatorComponents(separator())
    .addActionRowComponents(row(button(`contract_claim:${c.id}`, "Claim Contract", ButtonStyle.Primary, emoji.HANDSHAKE)));

  return panel;
}

async function postToChannel(client, channelId, contract, tierLabel = null) {
  if (!channelId) return;
  try {
    const ch  = await client.channels.fetch(channelId);
    const msg = await ch.send(componentsPayload([contractPanel(contract, tierLabel)]));
    if (!contract.messageId) {
      contract.messageId = msg.id;
      contract.messageChannelId = channelId;
    }
    save(db);
  } catch (err) {
    console.error(`[Contracts] Failed to post to channel ${channelId}:`, err.message);
  }
}

async function postContractToChannels(client, contract) {
  const diff = contract.difficulty;
  if (diff === "EASY" || diff === "MEDIUM") {
    await postToChannel(client, config.CONTRACT_CHANNEL, contract);
  }
  const tierKeys = EXTRA_TIER_CHANNELS[diff] ?? [];
  for (const tierKey of tierKeys) {
    const chanId   = config.TIER_CHANNELS?.[tierKey];
    const tierName = TIERS.find(t => t.key === tierKey)?.name;
    await postToChannel(client, chanId, contract, tierName);
  }
  save(db);
}

async function generateAndPostContracts(client, count = 3) {
  const normalPool = [...NORMAL_ROUTES].sort(() => Math.random() - 0.5).slice(0, Math.ceil(count / 2));
  for (const t of normalPool) {
    const { title, description } = makeContent(t.dep, t.arr, t.ac.join("/"));
    const contract = {
      id: genId(), title, description,
      departure: t.dep, arrival: t.arr, aircraft: t.ac,
      reward: t.reward + (DIFF_BONUS[t.diff] ?? 0), difficulty: t.diff,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      createdBy: "AUTO", active: true, claimedBy: null, completedBy: [],
      createdAt: new Date().toISOString(), messageId: null, messageChannelId: null, tier: null,
    };
    db.contracts.push(contract);
    save(db);
    await postContractToChannels(client, contract);
  }

  for (const [tierKey, routes] of Object.entries(TIER_ROUTE_MAP)) {
    if (!routes.length) continue;
    const t = routes[Math.floor(Math.random() * routes.length)];
    const { title, description } = makeContent(t.dep, t.arr, t.ac.join("/"));
    const tierName = TIERS.find(x => x.key === tierKey)?.name;
    const contract = {
      id: genId(), title, description,
      departure: t.dep, arrival: t.arr, aircraft: t.ac,
      reward: t.reward + (DIFF_BONUS[t.diff] ?? 0), difficulty: t.diff, tier: tierKey,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      createdBy: "AUTO", active: true, claimedBy: null, completedBy: [],
      createdAt: new Date().toISOString(), messageId: null, messageChannelId: null,
    };
    db.contracts.push(contract);
    save(db);
    const chanId = config.TIER_CHANNELS?.[tierKey];
    await postToChannel(client, chanId, contract, tierName);
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("contract")
    .setDescription("Contract management.")
    .addSubcommand(s => s.setName("list").setDescription("List available contracts.")
      .addStringOption(o => o.setName("difficulty").setDescription("Filter").setRequired(false)
        .addChoices({ name: "Easy", value: "EASY" }, { name: "Medium", value: "MEDIUM" }, { name: "Hard", value: "HARD" }, { name: "Elite", value: "ELITE" })))
    .addSubcommand(s => s.setName("mine").setDescription("View your claimed contracts."))
    .addSubcommand(s => s.setName("unclaim").setDescription("Release a contract you claimed.")
      .addStringOption(o => o.setName("id").setDescription("Contract ID").setRequired(true)))
    .addSubcommand(s => s.setName("lookup").setDescription("Look up a contract by ID.")
      .addStringOption(o => o.setName("id").setDescription("Contract ID").setRequired(true)))
    .addSubcommand(s => s.setName("complete").setDescription("Submit contract completion with proof.")
      .addStringOption(o => o.setName("id").setDescription("Contract ID").setRequired(true))
      .addAttachmentOption(o => o.setName("proof").setDescription("Flight screenshot").setRequired(true)))
    .addSubcommand(s => s.setName("create").setDescription("Create a contract manually. (Staff only)")
      .addStringOption(o => o.setName("departure").setDescription("Departure").setRequired(true).addChoices(...AIRPORT_CHOICES))
      .addStringOption(o => o.setName("arrival").setDescription("Arrival").setRequired(true).addChoices(...AIRPORT_CHOICES))
      .addIntegerOption(o => o.setName("reward").setDescription("Reward").setRequired(true).setMinValue(100))
      .addStringOption(o => o.setName("difficulty").setDescription("Difficulty").setRequired(true)
        .addChoices({ name: "Easy", value: "EASY" }, { name: "Medium", value: "MEDIUM" }, { name: "Hard", value: "HARD" }, { name: "Elite", value: "ELITE" }))
      .addStringOption(o => o.setName("aircraft").setDescription("Aircraft (comma-separated or ANY)").setRequired(false))
      .addStringOption(o => o.setName("expires").setDescription("Expiry e.g. 12h, 7d").setRequired(false)))
    .addSubcommand(s => s.setName("forcepost").setDescription("Force auto-post new contracts now. (Staff only)")
      .addIntegerOption(o => o.setName("count").setDescription("How many normal contracts (default 3)").setRequired(false).setMinValue(1).setMaxValue(5)))
    .addSubcommand(s => s.setName("approve").setDescription("Approve and pay a contract. (Staff only)")
      .addStringOption(o => o.setName("id").setDescription("Contract ID").setRequired(true))
      .addUserOption(o => o.setName("pilot").setDescription("Pilot to pay").setRequired(true)))
    .addSubcommand(s => s.setName("delete").setDescription("Delete a contract. (Staff only)")
      .addStringOption(o => o.setName("id").setDescription("Contract ID").setRequired(true)))
    .addSubcommand(s => s.setName("purge").setDescription("Bulk-delete old contracts past a cutoff age. (Staff only)")
      .addIntegerOption(o => o.setName("days").setDescription("Delete contracts created more than this many days ago").setRequired(true).setMinValue(1))
      .addBooleanOption(o => o.setName("active_only").setDescription("Only delete inactive/expired ones, skip still-active (default: true)").setRequired(false))
      .addBooleanOption(o => o.setName("dry_run").setDescription("Preview what would be deleted without deleting (default: false)").setRequired(false))),

  async execute(interaction, client) {
    const emoji = config.EMOJI;
    const err = (msg) => componentsPayload(
      [container(COLORS.RED).addTextDisplayComponents(text(`${emoji.NO.tag} ${msg}`))],
      { ephemeral: true }
    );
    const sub = interaction.options.getSubcommand();

    if (sub === "list") {
      const diff   = interaction.options.getString("difficulty");
      const member = interaction.member;
      const now    = Date.now();
      db.contracts.forEach(c => { if (c.expiresAt && new Date(c.expiresAt).getTime() < now) c.active = false; });
      save(db);

      const available = db.contracts.filter(c => {
        if (!c.active || c.claimedBy) return false;
        if (diff && c.difficulty !== diff) return false;
        if (c.tier) return hasTier(member, c.tier);
        return true;
      });

      if (!available.length)
        return interaction.reply(componentsPayload(
          [container(COLORS.GREY).addTextDisplayComponents(text("No contracts available for you right now."))],
          { ephemeral: true }
        ));

      const rows = available.slice(0, 10).map(c => {
        const exp = c.expiresAt ? `<t:${Math.floor(new Date(c.expiresAt).getTime()/1000)}:R>` : "∞";
        const ac  = (!c.aircraft || c.aircraft.includes("ANY")) ? "Any" : c.aircraft.join("/");
        const tierTag = c.tier ? ` · ${TIERS.find(t => t.key === c.tier)?.emoji ?? ""}` : "";
        return `**${c.title}** \`${c.id}\`\n${c.departure}→${c.arrival} · ${ac} · **${c.reward.toLocaleString()} ${CURRENCY}**${tierTag} · Exp: ${exp}`;
      });

      return interaction.reply(componentsPayload([
        container(COLORS.PURPLE)
          .addTextDisplayComponents(text(`${emoji.SCROLL.tag} **Available Contracts**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(rows.join("\n\n")))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(`-# ${available.length} contract(s) available to you`))
      ]));
    }

    if (sub === "mine") {
      const mine = db.contracts.filter(c => c.active && c.claimedBy === interaction.user.id);
      if (!mine.length)
        return interaction.reply(componentsPayload(
          [container(COLORS.GREY).addTextDisplayComponents(text("You have no active contracts."))],
          { ephemeral: true }
        ));
      const rows = mine.map(c => {
        const exp     = c.expiresAt ? `Exp <t:${Math.floor(new Date(c.expiresAt).getTime()/1000)}:R>` : "No expiry";
        const tierTag = c.tier ? ` · ${TIERS.find(t => t.key === c.tier)?.name ?? ""}` : "";
        return `**${c.title}** \`${c.id}\`\n${c.departure}→${c.arrival} · **${c.reward.toLocaleString()} ${CURRENCY}**${tierTag} · ${exp}`;
      });
      return interaction.reply(componentsPayload([
        container(COLORS.PURPLE)
          .addTextDisplayComponents(text(`${emoji.SCROLL.tag} **Your Active Contracts**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(rows.join("\n\n")))
      ]));
    }

    if (sub === "unclaim") {
      const id = interaction.options.getString("id").toUpperCase();
      const c  = db.contracts.find(c => c.id === id && c.claimedBy === interaction.user.id);
      if (!c) return interaction.reply(err("You don't have this contract claimed."));
      c.claimedBy = null;
      if (c.messageId && c.messageChannelId) {
        try {
          const ch  = await client.channels.fetch(c.messageChannelId);
          const msg = await ch.messages.fetch(c.messageId);
          await msg.edit(componentsPayload([contractPanel(c)]));
        } catch {}
      }
      save(db);
      return interaction.reply(componentsPayload([
        container(COLORS.GOLD).addTextDisplayComponents(text(`Released **${c.title}** — it's available again.`))
      ]));
    }

    if (sub === "lookup") {
      const id = interaction.options.getString("id").toUpperCase();
      const c  = db.contracts.find(c => c.id === id);
      if (!c) return interaction.reply(err(`Contract \`${id}\` not found.`));
      const exp    = c.expiresAt ? `<t:${Math.floor(new Date(c.expiresAt).getTime()/1000)}:R>` : "No expiry";
      const ac     = (!c.aircraft || c.aircraft.includes("ANY")) ? "Any fleet aircraft" : c.aircraft.join(", ");
      const status = !c.active ? "Inactive/Completed" : c.claimedBy ? `Claimed by <@${c.claimedBy}>` : "Available";
      const tierName = c.tier ? TIERS.find(t => t.key === c.tier)?.name : "Standard";

      return interaction.reply(componentsPayload([
        container(DIFF_COLOR[c.difficulty] ?? COLORS.PURPLE)
          .addTextDisplayComponents(text(`${emoji.MAGNIFIER.tag} **${c.title}**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(c.description))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(
            `**Contract ID**: \`${c.id}\`\n**Status**: ${status}\n**Difficulty**: ${c.difficulty}\n**Tier**: ${tierName}\n` +
            `**Departure**: ${c.departure}\n**Arrival**: ${c.arrival}\n**Aircraft**: ${ac}\n` +
            `**Reward**: ${c.reward.toLocaleString()} ${CURRENCY}\n**Expires**: ${exp}\n` +
            `**Created By**: ${c.createdBy === "AUTO" ? "Auto-generated" : `<@${c.createdBy}>`}\n` +
            `**Completed By**: ${c.completedBy?.length ? c.completedBy.map(u => `<@${u}>`).join(", ") : "None"}`
          ))
      ], { ephemeral: true }));
    }

    if (sub === "complete") {
      const id    = interaction.options.getString("id").toUpperCase();
      const proof = interaction.options.getAttachment("proof");
      const c     = db.contracts.find(c => c.id === id);
      if (!c)                                            return interaction.reply(err("Contract not found."));
      if (!c.active)                                     return interaction.reply(err("Contract no longer active."));
      if (c.claimedBy !== interaction.user.id)           return interaction.reply(err("You haven't claimed this contract."));
      if (c.completedBy?.includes(interaction.user.id))  return interaction.reply(err("Already completed."));
      if (!proof.contentType?.startsWith("image/"))      return interaction.reply(err("Proof must be an image."));

      if (config.CONTRACT_REVIEW_CHANNEL) {
        const ch = await client.channels.fetch(config.CONTRACT_REVIEW_CHANNEL).catch(() => null);
        if (ch) await ch.send(componentsPayload([
          container(COLORS.GOLD)
            .addTextDisplayComponents(text(`${emoji.SCROLL.tag} **Contract Completion Request**`))
            .addSeparatorComponents(separator())
            .addTextDisplayComponents(text(
              `<@${interaction.user.id}> claims completion of **${c.title}** (\`${c.id}\`)\n\n` +
              `**Pilot**: <@${interaction.user.id}>\n**Route**: ${c.departure}→${c.arrival}\n**Reward**: ${c.reward.toLocaleString()} ${CURRENCY}`
            ))
            .addSeparatorComponents(separator())
            .addMediaGalleryComponents(require("../utils/components").mediaGallery(proof.url))
            .addSeparatorComponents(separator())
            .addTextDisplayComponents(text(`-# Use /contract approve ${c.id} @pilot to pay`))
        ]));
      }
      return interaction.reply(componentsPayload(
        [container(COLORS.GOLD).addTextDisplayComponents(text("Completion submitted for staff review. You'll be paid once approved!"))],
        { ephemeral: true }
      ));
    }

    if (sub === "create") {
      if (!isStaff(interaction.member)) return interaction.reply(err("Staff only."));
      const dep    = interaction.options.getString("departure");
      const arr    = interaction.options.getString("arrival");
      const reward = interaction.options.getInteger("reward");
      const diff   = interaction.options.getString("difficulty");
      const acRaw  = interaction.options.getString("aircraft");
      const expStr = interaction.options.getString("expires");
      let aircraft = ["ANY"];
      if (acRaw && acRaw.toUpperCase() !== "ANY") {
        aircraft = acRaw.split(",").map(s => s.trim().toUpperCase()).filter(s => FLEET_KEYS.includes(s));
        if (!aircraft.length) return interaction.reply(err(`Valid aircraft: ${FLEET_KEYS.join(", ")}`));
      }
      let expiresAt = null;
      if (expStr) {
        const match = expStr.match(/^(\d+)(d|h|m)$/i);
        if (!match) return interaction.reply(err("Invalid expiry. Use e.g. `12h`, `7d`."));
        const mult = { d: 86400000, h: 3600000, m: 60000 };
        expiresAt = new Date(Date.now() + parseInt(match[1]) * mult[match[2].toLowerCase()]).toISOString();
      }
      const { title, description } = makeContent(dep, arr, aircraft.join("/"));
      const contract = {
        id: genId(), title, description,
        departure: dep, arrival: arr, aircraft,
        reward: reward + (DIFF_BONUS[diff] ?? 0), difficulty: diff,
        tier: null, expiresAt, createdBy: interaction.user.id,
        active: true, claimedBy: null, completedBy: [],
        createdAt: new Date().toISOString(), messageId: null, messageChannelId: null,
      };
      db.contracts.push(contract);
      save(db);
      await postContractToChannels(client, contract);
      return interaction.reply(componentsPayload(
        [container(COLORS.GREEN).addTextDisplayComponents(text(`${emoji.YES.tag} Contract **${title}** created and posted.`))],
        { ephemeral: true }
      ));
    }

    if (sub === "forcepost") {
      if (!isStaff(interaction.member)) return interaction.reply(err("Staff only."));
      const count = interaction.options.getInteger("count") ?? 3;
      await interaction.reply(componentsPayload(
        [container(COLORS.GREEN).addTextDisplayComponents(text(`${emoji.YES.tag} Posting ${count} normal contract(s) + 1 per tier channel...`))],
        { ephemeral: true }
      ));
      await generateAndPostContracts(client, count);
      return;
    }

    if (sub === "approve") {
      if (!isStaff(interaction.member)) return interaction.reply(err("Staff only."));
      const id    = interaction.options.getString("id").toUpperCase();
      const pilot = interaction.options.getUser("pilot");
      const c     = db.contracts.find(c => c.id === id);
      if (!c) return interaction.reply(err("Contract not found."));
      if (c.completedBy?.includes(pilot.id)) return interaction.reply(err("Pilot already paid."));

      if (!c.completedBy) c.completedBy = [];
      c.completedBy.push(pilot.id);
      c.claimedBy = null;
      c.active    = false;
      const newBal = addBalance(pilot.id, c.reward);
      logTx(pilot.id, "CONTRACT", c.reward, `Contract: ${c.title} (${c.id})`, interaction.user.id);
      save(db);

      if (c.messageId && c.messageChannelId) {
        try {
          const ch  = await client.channels.fetch(c.messageChannelId);
          const msg = await ch.messages.fetch(c.messageId);
          await msg.edit(componentsPayload([
            container(COLORS.GREY)
              .addTextDisplayComponents(text(`~~**${c.title}**~~ *(Completed)*`))
              .addSeparatorComponents(separator())
              .addActionRowComponents(row(button(`contract_claim:${c.id}`, "Completed", ButtonStyle.Secondary, emoji.YES, true)))
          ]));
        } catch {}
      }

      await interaction.reply(componentsPayload([
        container(COLORS.GREEN)
          .addTextDisplayComponents(text(`${emoji.YES.tag} **Contract Approved & Paid**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(
            `**Pilot**: <@${pilot.id}>\n**Contract**: \`${c.id}\` ${c.title}\n**Paid**: ${c.reward.toLocaleString()} ${CURRENCY}\n**New Balance**: ${newBal.toLocaleString()} ${CURRENCY}`
          ))
      ]));

      pilot.send(componentsPayload([
        container(COLORS.GREEN)
          .addTextDisplayComponents(text(`${emoji.YES.tag} **Contract Completed!**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(`**${c.title}** approved!\n\n**Reward**: +${c.reward.toLocaleString()} ${CURRENCY}\n**New Balance**: ${newBal.toLocaleString()} ${CURRENCY}`))
      ])).catch(() => {});
      return;
    }

    if (sub === "delete") {
      if (!isStaff(interaction.member)) return interaction.reply(err("Staff only."));
      const id  = interaction.options.getString("id").toUpperCase();
      const idx = db.contracts.findIndex(c => c.id === id);
      if (idx === -1) return interaction.reply(err("Contract not found."));
      const [removed] = db.contracts.splice(idx, 1);
      save(db);
      if (removed.messageId && removed.messageChannelId) {
        try {
          const ch  = await client.channels.fetch(removed.messageChannelId);
          const msg = await ch.messages.fetch(removed.messageId);
          await msg.delete();
        } catch {}
      }
      return interaction.reply(componentsPayload([
        container(COLORS.RED).addTextDisplayComponents(text(`Deleted contract **${removed.title}** (\`${removed.id}\`).`))
      ]));
    }

    if (sub === "purge") {
      if (!isStaff(interaction.member)) return interaction.reply(err("Staff only."));
      const days       = interaction.options.getInteger("days");
      const activeOnly = interaction.options.getBoolean("active_only") ?? true; // "active_only" here means "only inactive/expired ones"
      const dryRun     = interaction.options.getBoolean("dry_run") ?? false;

      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const now    = Date.now();

      // Refresh expiry status first so age-based filtering sees current state.
      db.contracts.forEach(c => { if (c.expiresAt && new Date(c.expiresAt).getTime() < now) c.active = false; });

      const toDelete = db.contracts.filter(c => {
        const created = new Date(c.createdAt).getTime();
        if (isNaN(created) || created > cutoff) return false;
        if (activeOnly && c.active) return false; // skip still-live contracts
        return true;
      });

      if (!toDelete.length)
        return interaction.reply(componentsPayload(
          [container(COLORS.GREY).addTextDisplayComponents(text(`No contracts older than ${days} day(s) match the filter.`))],
          { ephemeral: true }
        ));

      if (dryRun) {
        const preview = toDelete.slice(0, 15).map(c =>
          `\`${c.id}\` **${c.title}** — ${c.active ? "Active" : "Inactive/Expired"} · Created <t:${Math.floor(new Date(c.createdAt).getTime()/1000)}:R>`
        ).join("\n");
        return interaction.reply(componentsPayload([
          container(COLORS.GOLD)
            .addTextDisplayComponents(text(`${emoji.SCROLL.tag} **Purge Preview (dry run)**`))
            .addSeparatorComponents(separator())
            .addTextDisplayComponents(text(`${toDelete.length} contract(s) would be deleted:\n\n${preview}${toDelete.length > 15 ? `\n…and ${toDelete.length - 15} more` : ""}`))
        ], { ephemeral: true }));
      }

      save(db); // persist the expiry-status refresh even if something below fails

      let deletedCount = 0;
      for (const c of toDelete) {
        const idx = db.contracts.findIndex(x => x.id === c.id);
        if (idx === -1) continue;
        db.contracts.splice(idx, 1);
        deletedCount++;
        if (c.messageId && c.messageChannelId) {
          try {
            const ch  = await client.channels.fetch(c.messageChannelId);
            const msg = await ch.messages.fetch(c.messageId);
            await msg.delete();
          } catch {}
        }
      }
      save(db);

      return interaction.reply(componentsPayload([
        container(COLORS.RED)
          .addTextDisplayComponents(text(`${emoji.TRASH.tag} **Contracts Purged**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(
            `**Cutoff**: older than ${days} day(s)\n**Filter**: ${activeOnly ? "inactive/expired only" : "all contracts (including active)"}\n**Deleted**: ${deletedCount} contract(s)`
          ))
      ]));
    }
  },

  generateAndPostContracts,
  contractPanel,
};
// ============================================================
//  AFBot — index.js (Components v2)
// ============================================================
const config = require("./config");

const {
  Client, GatewayIntentBits, Partials, Collection,
  REST, Routes, ButtonStyle,
} = require("discord.js");

const { db, save }  = require("./data/db");
const { startExpiryWatcher, startScheduledNotams } = require("./tasks/notamScheduler");
const {
  isStaff, getFlights, league,
  addBalance, logTx, flightPay, CURRENCY,
  contractMatchesFlight,
} = require("./utils/helpers");
const { COLORS, text, separator, container, button, row, componentsPayload } = require("./utils/components");

// ── Ticket helpers ──────────────────────────────────────────
const { openTicket, buildConfirmPanel } = require("./commands/ticket");
// ── Contract helpers ────────────────────────────────────────
const { generateAndPostContracts, contractPanel } = require("./commands/contracts");

// ── Load commands ─────────────────────────────────────────────
const commandFiles = [
  require("./commands/log"),
  require("./commands/flight"),
  require("./commands/leaderboard"),
  require("./commands/stats"),
  require("./commands/profile"),
  require("./commands/review"),
  require("./commands/ticket"),
  require("./commands/moderation"),
  require("./commands/economy"),
  require("./commands/contracts"),
  require("./commands/notams"),
  require("./commands/tiers"),
  ...require("./commands/utility"),
];

const commands    = new Collection();
const commandJSON = [];
for (const cmd of commandFiles) {
  commands.set(cmd.data.name, cmd);
  commandJSON.push(cmd.data.toJSON());
}

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(config.BOT_TOKEN);
  try {
    console.log("🔄 Registering slash commands…");
    await rest.put(
      Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID),
      { body: commandJSON }
    );
    console.log(`✅ ${commandJSON.length} commands registered.`);
  } catch (err) {
    console.error("❌ Registration failed:", err);
  }
}

// ═══════════════════════════════════════════════════════════════
//  AUTOPAY
// ═══════════════════════════════════════════════════════════════
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
    c.active    = false;

    if (c.messageId && c.messageChannelId) {
      try {
        const ch  = await client.channels.fetch(c.messageChannelId);
        const msg = await ch.messages.fetch(c.messageId);
        await msg.edit(componentsPayload([
          container(COLORS.GREY)
            .addTextDisplayComponents(text(`~~**${c.title}**~~ *(Completed)*`))
            .addSeparatorComponents(separator())
            .addActionRowComponents(row(button(`contract_claim:${c.id}`, "Completed", ButtonStyle.Secondary, config.EMOJI.YES, true)))
        ]));
      } catch {}
    }

    const newBal = addBalance(userId, c.reward);
    logTx(userId, "CONTRACT", c.reward, `Autopay: ${c.title} (${c.id})`);
    results.push({ contract: c, newBal });
  }

  save(db);

  try {
    const user  = await client.users.fetch(userId);
    const lines = results.map(r => `\`${r.contract.id}\` **${r.contract.title}** · +${r.contract.reward.toLocaleString()} ${CURRENCY}`).join("\n");
    await user.send(componentsPayload([
      container(COLORS.GREEN)
        .addTextDisplayComponents(text(`${config.EMOJI.YES.tag} **Contract Autopay!**`))
        .addSeparatorComponents(separator())
        .addTextDisplayComponents(text(`Your approved flight matched **${results.length}** contract(s)!\n\n${lines}\n\n**New Balance**: ${results.at(-1).newBal.toLocaleString()} ${CURRENCY}`))
    ]));
  } catch {}

  return results;
}

// ── Discord client ────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// ── Contract scheduler ─────────────────────────────────────────
async function startContractScheduler(client) {
  const run = async () => {
    try {
      console.log("[Contracts] Auto-posting scheduled contracts...");
      await generateAndPostContracts(client, 3);
      console.log("[Contracts] Scheduled post complete.");
    } catch (err) {
      console.error("[Contracts] Scheduler error:", err.message);
    }
  };
  setTimeout(run, 30_000);
  setInterval(run, 3 * 60 * 60 * 1000);
  console.log("[Contracts] 3-hour contract scheduler started.");
}

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity("Virtual Flights | /help", { type: 3 });
  await registerCommands();
  startExpiryWatcher(client);
  startScheduledNotams(client);
  startContractScheduler(client);
});

// ── Safe reply helper ───────────────────────────────────────────
async function safeReply(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ ...payload, ephemeral: true });
    } else {
      await interaction.reply({ ...payload, ephemeral: true });
    }
  } catch {}
}

function errPanel(msg) {
  return componentsPayload(
    [container(COLORS.RED).addTextDisplayComponents(text(`${config.EMOJI.NO.tag} ${msg}`))],
    { ephemeral: true }
  );
}

// ═══════════════════════════════════════════════════════════════
//  INTERACTIONS
// ═══════════════════════════════════════════════════════════════
client.on("interactionCreate", async (interaction) => {

  // ── Slash commands ────────────────────────────────────────
  if (interaction.isChatInputCommand()) {
    const cmd = commands.get(interaction.commandName);
    if (!cmd) return;
    try {
      await cmd.execute(interaction, client);
    } catch (err) {
      console.error(`❌ /${interaction.commandName}:`, err);
      await safeReply(interaction, errPanel("An error occurred running this command."));
    }
    return;
  }

  if (!interaction.isButton()) return;

  const colonIdx = interaction.customId.indexOf(":");
  const action    = colonIdx === -1 ? interaction.customId : interaction.customId.slice(0, colonIdx);
  const payload   = colonIdx === -1 ? ""                    : interaction.customId.slice(colonIdx + 1);
  const emoji     = config.EMOJI;

  try {

    // ╔════════════════════════════════════════════════════════╗
    //  ✅ APPROVE FLIGHT LOG
    // ╚════════════════════════════════════════════════════════╝
    if (action === "log_approve") {
      if (!isStaff(interaction.member)) return interaction.reply(errPanel("Only staff can approve flight logs."));

      const sub = db.pendingFlights[payload];
      if (!sub) return interaction.reply(errPanel("Submission not found — already processed."));

      const flights = getFlights(sub.userId);
      const entry   = {
        callsign: sub.callsign, aircraft: sub.aircraft,
        departure: sub.departure, arrival: sub.arrival,
        route: sub.route, proofUrl: sub.proofUrl,
        timestamp: sub.timestamp, approvedBy: interaction.user.id,
      };
      flights.push(entry);

      const total  = flights.length;
      const rank   = league(total);
      const pay    = flightPay(sub.aircraft);
      const newBal = addBalance(sub.userId, pay);
      logTx(sub.userId, "FLIGHT_PAY", pay, `Flight pay: ${sub.callsign} ${sub.departure}→${sub.arrival}`, interaction.user.id);
      delete db.pendingFlights[payload];
      save(db);

      const autopayResults = await runAutopay(client, sub.userId, entry);

      let contractLines = "";
      if (autopayResults.length > 0) {
        contractLines = "\n\n**Contracts Paid**\n" + autopayResults.map(r =>
          `\`${r.contract.id}\` **${r.contract.title}** · +${r.contract.reward.toLocaleString()} ${CURRENCY}`
        ).join("\n");
      }

      const dateStr = new Date().toLocaleString("en-GB", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      });

      const { mediaGallery } = require("./utils/components");

      await interaction.update(componentsPayload([
        container(COLORS.GREEN)
          .addTextDisplayComponents(
            text(`${emoji.FOLDER.tag} **Flight Approved**`),
            text(`<@${sub.userId}> has submitted a flight log.`)
          )
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(
            `**Flight Details**\n\`Callsign\`: ${sub.callsign}\n\`Aircraft\`: ${sub.aircraft}\n\`Brief\`: ${sub.departure} ${emoji.ROUTE.tag} ${sub.arrival}`
          ))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(`**Route**\n\`\`\`\n${sub.route}\n\`\`\``))
          .addSeparatorComponents(separator())
          .addMediaGalleryComponents(mediaGallery(sub.proofUrl))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(
            `${emoji.YES.tag} **Approved by <@${interaction.user.id}>**\n**Flight Pay**: +${pay.toLocaleString()} ${CURRENCY}${contractLines}`
          ))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(`-# ${sub.userId} • Approved ${dateStr}`))
      ]));

      try {
        const pilot = await client.users.fetch(sub.userId);
        const dmContracts = autopayResults.length > 0
          ? "\n\n**Contracts Autopaid**\n" + autopayResults.map(r => `\`${r.contract.id}\` **${r.contract.title}** · +${r.contract.reward.toLocaleString()} ${CURRENCY}`).join("\n")
          : "";
        await pilot.send(componentsPayload([
          container(COLORS.GREEN)
            .addTextDisplayComponents(text(`${emoji.YES.tag} **Flight Approved!**`))
            .addSeparatorComponents(separator())
            .addTextDisplayComponents(text(
              `Your flight **${sub.callsign}** (${sub.departure} → ${sub.arrival}) has been approved!\n\n` +
              `**Flight Pay**: +${pay.toLocaleString()} ${CURRENCY}\n**Total Flights**: ${total} — ${rank.name}\n**Balance**: ${newBal.toLocaleString()} ${CURRENCY}${dmContracts}`
            ))
        ]));
      } catch {}
      return;
    }

    // ╔════════════════════════════════════════════════════════╗
    //  🗑️ REVOKE FLIGHT LOG
    // ╚════════════════════════════════════════════════════════╝
    if (action === "log_revoke") {
      if (!isStaff(interaction.member)) return interaction.reply(errPanel("Only staff can revoke flight logs."));

      const sub = db.pendingFlights[payload];
      if (!sub) return interaction.reply(errPanel("Submission not found — already processed."));

      delete db.pendingFlights[payload];
      save(db);

      const dateStr = new Date().toLocaleString("en-GB", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
      const { mediaGallery } = require("./utils/components");

      await interaction.update(componentsPayload([
        container(COLORS.RED)
          .addTextDisplayComponents(
            text(`${emoji.FOLDER.tag} **Flight Revoked**`),
            text(`<@${sub.userId}> has submitted a flight log.`)
          )
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(
            `**Flight Details**\n\`Callsign\`: ${sub.callsign}\n\`Aircraft\`: ${sub.aircraft}\n\`Brief\`: ${sub.departure} ${emoji.ROUTE.tag} ${sub.arrival}`
          ))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(`**Route**\n\`\`\`\n${sub.route}\n\`\`\``))
          .addSeparatorComponents(separator())
          .addMediaGalleryComponents(mediaGallery(sub.proofUrl))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(`${emoji.NO.tag} **Revoked by <@${interaction.user.id}>**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(`-# ${sub.userId} • Revoked ${dateStr}`))
      ]));

      try {
        const pilot = await client.users.fetch(sub.userId);
        await pilot.send(componentsPayload([
          container(COLORS.RED)
            .addTextDisplayComponents(text(`${emoji.NO.tag} **Flight Log Revoked**`))
            .addSeparatorComponents(separator())
            .addTextDisplayComponents(text(
              `Your flight log **${sub.callsign}** (${sub.departure} → ${sub.arrival}) was revoked by staff.\n\nIf you believe this is a mistake, please open a ticket with \`/ticket open\`.`
            ))
        ]));
      } catch {}
      return;
    }

    // ╔════════════════════════════════════════════════════════╗
    //  📋 CLAIM CONTRACT
    // ╚════════════════════════════════════════════════════════╝
    if (action === "contract_claim") {
      const c = db.contracts.find(c => c.id === payload);
      if (!c || !c.active) return interaction.reply(errPanel("This contract is no longer available."));
      if (c.claimedBy)     return interaction.reply(errPanel("This contract has already been claimed by someone else."));
      if (c.completedBy?.includes(interaction.user.id)) return interaction.reply(errPanel("You already completed this contract."));

      const activeClaims = db.contracts.filter(x => x.active && x.claimedBy === interaction.user.id);
      if (activeClaims.length >= 3) return interaction.reply(errPanel("You can only hold **3 active contracts** at once. Use `/contract unclaim` to release one."));

      c.claimedBy = interaction.user.id;
      save(db);

      await interaction.update(componentsPayload([contractPanel(c)]));

      const ac  = (!c.aircraft || c.aircraft.includes("ANY")) ? "Any fleet aircraft" : c.aircraft.join(", ");
      const exp = c.expiresAt ? `\nExpires: <t:${Math.floor(new Date(c.expiresAt).getTime()/1000)}:R>` : "";

      await interaction.followUp(componentsPayload([
        container(COLORS.PURPLE)
          .addTextDisplayComponents(text(`${emoji.HANDSHAKE.tag} **Contract Claimed!**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(
            `You claimed **${c.title}**.\n\nLog a matching flight — it will be **auto-paid** the moment staff approves it.${exp}`
          ))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(
            `**Contract ID**: \`${c.id}\`\n**Route**: ${c.departure} → ${c.arrival}\n**Aircraft**: ${ac}\n**Reward**: ${c.reward.toLocaleString()} ${CURRENCY}`
          ))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(`-# Keep this contract ID handy — staff can use it to look you up.`))
      ], { ephemeral: true }));
      return;
    }

    // ╔════════════════════════════════════════════════════════╗
    //  🎫 OPEN TICKET — panel button
    // ╚════════════════════════════════════════════════════════╝
    if (action === "ticket_open_panel") {
      await interaction.deferReply({ ephemeral: true });
      const result = await openTicket(interaction.guild, interaction.user);
      if (result.error) return interaction.editReply(errPanel(result.error));
      return interaction.editReply(componentsPayload([
        container(COLORS.GREEN).addTextDisplayComponents(text(`${emoji.YES.tag} Your ticket has been created: ${result.channel}`))
      ]));
    }

    // ╔════════════════════════════════════════════════════════╗
    //  🔒 CLOSE TICKET — step 1
    // ╚════════════════════════════════════════════════════════╝
    if (action === "ticket_close_request") {
      const channelId = payload;
      const ticket     = db.tickets[channelId];
      if (!ticket?.open) return interaction.reply(errPanel("This ticket is already closed."));
      if (!isStaff(interaction.member) && ticket.ownerId !== interaction.user.id)
        return interaction.reply(errPanel("Only the ticket owner or staff can close this ticket."));

      return interaction.reply(componentsPayload([buildConfirmPanel(channelId)], { ephemeral: true }));
    }

    // ╔════════════════════════════════════════════════════════╗
    //  🔒 CLOSE TICKET — step 2: confirmed
    // ╚════════════════════════════════════════════════════════╝
    if (action === "ticket_close_confirm") {
      const channelId = payload;
      const ticket     = db.tickets[channelId];

      if (!ticket?.open)
        return interaction.update(componentsPayload([
          container(COLORS.RED).addTextDisplayComponents(text(`${emoji.NO.tag} Ticket is already closed.`))
        ], { components: [] }));

      if (!isStaff(interaction.member) && ticket.ownerId !== interaction.user.id)
        return interaction.update(errPanel("You don't have permission to close this ticket."));

      ticket.open     = false;
      ticket.closedAt = new Date().toISOString();
      ticket.closedBy = interaction.user.id;
      save(db);

      await interaction.update(componentsPayload([
        container(COLORS.RED).addTextDisplayComponents(text(`${emoji.LOCK.tag} Confirmed. Deleting channel in 5 seconds...`))
      ]));

      await interaction.channel.send(componentsPayload([
        container(COLORS.RED)
          .addTextDisplayComponents(text(`${emoji.LOCK.tag} **Ticket Closed**`))
          .addSeparatorComponents(separator())
          .addTextDisplayComponents(text(`**Closed By**: <@${interaction.user.id}>\n**Ticket**: #${ticket.ticketNum ?? "?"}`))
      ]));

      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
      return;
    }

    // ╔════════════════════════════════════════════════════════╗
    //  ❌ CLOSE TICKET — step 2: cancelled
    // ╚════════════════════════════════════════════════════════╝
    if (action === "ticket_close_cancel") {
      return interaction.update(componentsPayload([
        container(COLORS.GREEN).addTextDisplayComponents(text(`${emoji.YES.tag} Cancelled — ticket remains open.`))
      ]));
    }

  } catch (err) {
    console.error(`❌ Button [${action}] error:`, err);
    await safeReply(interaction, errPanel(`Something went wrong: \`${err.message}\``));
  }
});

client.on("error", err => console.error("Client error:", err));
process.on("unhandledRejection", err => console.error("Unhandled rejection:", err));

client.login(config.BOT_TOKEN);
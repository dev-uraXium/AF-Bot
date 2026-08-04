// ============================================================
//  AFBot — index.js (Entry Point)
//  discord.js v14 | Virtual Airline Bot
// ============================================================
const config = require("./config");

// Push config into env for any legacy helpers that read process.env
process.env.STAFF_ROLE = config.STAFF_ROLE;

const {
  Client, GatewayIntentBits, Partials, Collection,
  REST, Routes, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require("discord.js");

const { db, save }       = require("./data/db");
const { runAutopay }     = require("./tasks/autopay");
const { startExpiryWatcher, startScheduledNotams } = require("./tasks/notamScheduler");
const {
  isStaff, errorEmbed, getFlights, league,
  addBalance, logTx, flightPay, formatKD,
  e, eObj, FLEET,
} = require("./utils/helpers");

// ── Load all commands ─────────────────────────────────────────
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
  ...require("./commands/utility"),
];

const commands    = new Collection();
const commandJSON = [];

for (const cmd of commandFiles) {
  commands.set(cmd.data.name, cmd);
  commandJSON.push(cmd.data.toJSON());
}

// ── Register slash commands ───────────────────────────────────
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
    console.error("❌ Command registration failed:", err);
  }
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

// ── Ready ─────────────────────────────────────────────────────
client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  client.user.setActivity("Virtual Flights | /help", { type: 3 });
  await registerCommands();
  startExpiryWatcher(client);
  startScheduledNotams(client);
});

// ═══════════════════════════════════════════════════════════════
//  INTERACTION HANDLER
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
      const msg = { content: "❌ An error occurred.", ephemeral: true };
      interaction.replied || interaction.deferred
        ? await interaction.followUp(msg)
        : await interaction.reply(msg);
    }
    return;
  }

  // ── Button interactions ───────────────────────────────────
  if (!interaction.isButton()) return;
  const [action, payload] = interaction.customId.split(":");

  // ╔══════════════════════════════════════════════════════════╗
  //  ✅ APPROVE FLIGHT LOG
  // ╚══════════════════════════════════════════════════════════╝
  if (action === "log_approve") {
    if (!isStaff(interaction.member))
      return interaction.reply({ embeds: [errorEmbed("Only staff can approve flight logs.")], ephemeral: true });

    const subId = payload;
    const sub   = db.pendingFlights[subId];

    if (!sub)
      return interaction.reply({ embeds: [errorEmbed("This submission no longer exists (already processed).")], ephemeral: true });

    // ── Move from pending → confirmed ─────────────────────────
    const flights = getFlights(sub.userId);
    const entry   = {
      callsign:  sub.callsign,
      aircraft:  sub.aircraft,
      departure: sub.departure,
      arrival:   sub.arrival,
      route:     sub.route,
      proofUrl:  sub.proofUrl,
      timestamp: sub.timestamp,
      approvedBy: interaction.user.id,
    };
    flights.push(entry);

    const total    = flights.length;
    const lg       = league(total);
    const pay      = flightPay(sub.aircraft);
    const newBal   = addBalance(sub.userId, pay);
    logTx(sub.userId, "FLIGHT_PAY", pay, `Flight pay: ${sub.callsign} ${sub.departure}→${sub.arrival}`, interaction.user.id);

    delete db.pendingFlights[subId];
    save(db);

    // ── Edit the log message to show approved ─────────────────
    const routeArrow = e("EMOJI_ROUTE") || "➡️";
    const folder     = e("EMOJI_FOLDER") || "📁";

    const approvedEmbed = new EmbedBuilder()
      .setColor(0x57f287)   // green = approved
      .setTitle(`${folder} Flight Approved`)
      .setDescription(
        `<@${sub.userId}> has submitted a flight log.\n\n` +
        `**Flight Details**\n` +
        `\`Callsign\`: ${sub.callsign}\n` +
        `\`Aircraft\`: ${sub.aircraft}\n` +
        `\`Brief\`: ${sub.departure} ${routeArrow} ${sub.arrival}\n\n` +
        `**Route**\n` +
        `\`\`\`\n${sub.route}\n\`\`\`\n` +
        `✅ **Approved by <@${interaction.user.id}>** • Flight Pay: ${formatKD(pay)}`
      )
      .setImage(sub.proofUrl)
      .setFooter({ text: `${sub.userId} • Approved ${new Date().toLocaleString("en-GB", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" })}` });

    await interaction.update({ embeds: [approvedEmbed], components: [] });

    // ── DM the pilot ──────────────────────────────────────────
    try {
      const pilot = await client.users.fetch(sub.userId);
      await pilot.send({ embeds: [
        new EmbedBuilder()
          .setTitle("✅ Flight Approved!")
          .setColor(0x57f287)
          .setDescription(
            `Your flight **${sub.callsign}** (${sub.departure} → ${sub.arrival}) has been approved!\n\n` +
            `**Flight Pay:** ${formatKD(pay)}\n` +
            `**Total Flights:** ${total} — ${lg.name}\n` +
            `**Balance:** ${formatKD(newBal)}`
          )
          .setFooter({ text: "AFBot Virtual Economy" }).setTimestamp()
      ]});
    } catch {}

    // ── Run contract autopay ──────────────────────────────────
    await runAutopay(client, sub.userId, entry);
    return;
  }

  // ╔══════════════════════════════════════════════════════════╗
  //  🗑️ REVOKE FLIGHT LOG
  // ╚══════════════════════════════════════════════════════════╝
  if (action === "log_revoke") {
    if (!isStaff(interaction.member))
      return interaction.reply({ embeds: [errorEmbed("Only staff can revoke flight logs.")], ephemeral: true });

    const subId = payload;
    const sub   = db.pendingFlights[subId];

    if (!sub)
      return interaction.reply({ embeds: [errorEmbed("This submission no longer exists (already processed).")], ephemeral: true });

    delete db.pendingFlights[subId];
    save(db);

    // ── Edit the log message to show revoked ──────────────────
    const routeArrow = e("EMOJI_ROUTE") || "➡️";
    const folder     = e("EMOJI_FOLDER") || "📁";

    const revokedEmbed = new EmbedBuilder()
      .setColor(0xff4444)   // red = revoked
      .setTitle(`${folder} Flight Revoked`)
      .setDescription(
        `<@${sub.userId}> has submitted a flight log.\n\n` +
        `**Flight Details**\n` +
        `\`Callsign\`: ${sub.callsign}\n` +
        `\`Aircraft\`: ${sub.aircraft}\n` +
        `\`Brief\`: ${sub.departure} ${routeArrow} ${sub.arrival}\n\n` +
        `**Route**\n` +
        `\`\`\`\n${sub.route}\n\`\`\`\n` +
        `❌ **Revoked by <@${interaction.user.id}>**`
      )
      .setImage(sub.proofUrl)
      .setFooter({ text: `${sub.userId} • Revoked ${new Date().toLocaleString("en-GB", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" })}` });

    await interaction.update({ embeds: [revokedEmbed], components: [] });

    // ── DM the pilot ──────────────────────────────────────────
    try {
      const pilot = await client.users.fetch(sub.userId);
      await pilot.send({ embeds: [
        new EmbedBuilder()
          .setTitle("❌ Flight Log Revoked")
          .setColor(0xff4444)
          .setDescription(
            `Your flight log **${sub.callsign}** (${sub.departure} → ${sub.arrival}) has been revoked by staff.\n\n` +
            `If you believe this is a mistake, please open a ticket with \`/ticket open\`.`
          )
          .setFooter({ text: "AFBot • Virtual Airline" }).setTimestamp()
      ]});
    } catch {}
    return;
  }

  // ── Ticket close button ───────────────────────────────────
  if (action === "ticket_close_btn") {
    const { closeTicket } = require("./commands/ticket");
    try { await closeTicket(interaction, "Closed via button"); }
    catch (err) { console.error("❌ Ticket close error:", err); }
    return;
  }
});

// ── Global error handling ─────────────────────────────────────
client.on("error", err => console.error("Client error:", err));
process.on("unhandledRejection", err => console.error("Unhandled rejection:", err));

// ── Start ─────────────────────────────────────────────────────
client.login(config.BOT_TOKEN);
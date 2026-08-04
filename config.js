// config.js — Central configuration
// Values are read from environment variables to keep secrets out of the repository.

const env = process.env;

module.exports = {
  // ── Bot core ───────────────────────────────────────────────
  BOT_TOKEN: env.BOT_TOKEN || "",
  CLIENT_ID: env.CLIENT_ID || "",
  GUILD_ID: env.GUILD_ID || "",

  // ── Roles ──────────────────────────────────────────────────
  STAFF_ROLE: env.STAFF_ROLE || "",

  // ── Channels (all optional but recommended) ────────────────
  LOG_CHANNEL: env.LOG_CHANNEL || "",
  NOTAM_CHANNEL: env.NOTAM_CHANNEL || "",
  CONTRACT_CHANNEL: env.CONTRACT_CHANNEL || "",
  CONTRACT_REVIEW_CHANNEL: env.CONTRACT_REVIEW_CHANNEL || "",
  REVIEW_CHANNEL: env.REVIEW_CHANNEL || "",
  TICKET_CATEGORY: env.TICKET_CATEGORY || "",

  // ── Custom Emoji IDs ───────────────────────────────────────
  EMOJI_FOLDER: env.EMOJI_FOLDER_ID
    ? { id: env.EMOJI_FOLDER_ID, name: env.EMOJI_FOLDER_NAME || "afv_folder" }
    : { id: "", name: "afv_folder" },
  EMOJI_APPROVE: env.EMOJI_APPROVE_ID
    ? { id: env.EMOJI_APPROVE_ID, name: env.EMOJI_APPROVE_NAME || "afv_yes" }
    : { id: "", name: "afv_yes" },
  EMOJI_ROUTE: env.EMOJI_ROUTE_ID
    ? { id: env.EMOJI_ROUTE_ID, name: env.EMOJI_ROUTE_NAME || "afv_route" }
    : { id: "", name: "afv_route" },
  EMOJI_TRASH: env.EMOJI_TRASH_ID
    ? { id: env.EMOJI_TRASH_ID, name: env.EMOJI_TRASH_NAME || "afv_trash" }
    : { id: "", name: "afv_trash" },

  // ── Economy ────────────────────────────────────────────────
  FLIGHT_BASE_PAY: Number(env.FLIGHT_BASE_PAY || 500),
  CURRENCY: env.CURRENCY || "EUR",
  CURRENCY_ICON: env.CURRENCY_ICON || "€",
};
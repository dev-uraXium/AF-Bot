// config.js — loads and validates the .env file, exposes structured config
require("dotenv").config();

function emoji(idKey, nameKey, fallback) {
  const id   = process.env[idKey];
  const name = process.env[nameKey] || fallback;
  if (!id) return { id: null, name, tag: null };
  return { id, name, tag: `<:${name}:${id}>` };
}

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  CLIENT_ID: process.env.CLIENT_ID,
  GUILD_ID:  process.env.GUILD_ID,

  STAFF_ROLE: process.env.STAFF_ROLE,

  LOG_CHANNEL:             process.env.LOG_CHANNEL,
  NOTAM_CHANNEL:           process.env.NOTAM_CHANNEL,
  CONTRACT_CHANNEL:        process.env.CONTRACT_CHANNEL,
  CONTRACT_REVIEW_CHANNEL: process.env.CONTRACT_REVIEW_CHANNEL,
  REVIEW_CHANNEL:          process.env.REVIEW_CHANNEL,
  TICKET_CATEGORY:         process.env.TICKET_CATEGORY,

  TIER_ROLES: {
    PRESTIGE:  process.env.TIER_PRESTIGE_ROLE,
    SIGNATURE: process.env.TIER_SIGNATURE_ROLE,
    APOGEE:    process.env.TIER_APOGEE_ROLE,
    PREMIERE:  process.env.TIER_PREMIERE_ROLE,
  },
  TIER_CHANNELS: {
    PRESTIGE:  process.env.TIER_PRESTIGE_CHANNEL,
    SIGNATURE: process.env.TIER_SIGNATURE_CHANNEL,
    APOGEE:    process.env.TIER_APOGEE_CHANNEL,
    PREMIERE:  process.env.TIER_PREMIERE_CHANNEL,
  },

  // ── Emojis ─────────────────────────────────────────────────
  EMOJI: {
    FOLDER:     emoji("EMOJI_FOLDER_ID",     "EMOJI_FOLDER_NAME",     "afv_folder"),
    YES:        emoji("EMOJI_YES_ID",        "EMOJI_YES_NAME",        "afv_yes"),
    ROUTE:      emoji("EMOJI_ROUTE_ID",      "EMOJI_ROUTE_NAME",      "afv_route"),
    TRASH:      emoji("EMOJI_TRASH_ID",      "EMOJI_TRASH_NAME",      "afv_trash"),
    CONFETTI:   emoji("EMOJI_CONFETTI_ID",   "EMOJI_CONFETTI_NAME",   "afv_confetti"),
    CONTROLLER: emoji("EMOJI_CONTROLLER_ID", "EMOJI_CONTROLLER_NAME", "afv_controller"),
    DISCORD:    emoji("EMOJI_DISCORD_ID",    "EMOJI_DISCORD_NAME",    "afv_discord"),
    HANDSHAKE:  emoji("EMOJI_HANDSHAKE_ID",  "EMOJI_HANDSHAKE_NAME",  "afv_handshake"),
    HEART:      emoji("EMOJI_HEART_ID",      "EMOJI_HEART_NAME",      "afv_heart"),
    INFO:       emoji("EMOJI_INFO_ID",       "EMOJI_INFO_NAME",       "afv_info"),
    LINK:       emoji("EMOJI_LINK_ID",       "EMOJI_LINK_NAME",       "afv_link"),
    LOCK:       emoji("EMOJI_LOCK_ID",       "EMOJI_LOCK_NAME",       "afv_lock"),
    MAGNIFIER:  emoji("EMOJI_MAGNIFIER_ID",  "EMOJI_MAGNIFIER_NAME",  "afv_magnifier"),
    MAP:        emoji("EMOJI_MAP_ID",        "EMOJI_MAP_NAME",        "afv_map"),
    NO:         emoji("EMOJI_NO_ID",         "EMOJI_NO_NAME",         "afv_no"),
    NOTES:      emoji("EMOJI_NOTES_ID",      "EMOJI_NOTES_NAME",      "afv_notes"),
    PLANE:      emoji("EMOJI_PLANE_ID",      "EMOJI_PLANE_NAME",      "afv_plane"),
    PODIUM:     emoji("EMOJI_PODIUM_ID",     "EMOJI_PODIUM_NAME",     "afv_podium"),
    POINT:      emoji("EMOJI_POINT_ID",      "EMOJI_POINT_NAME",      "afv_point"),
    SCROLL:     emoji("EMOJI_SCROLL_ID",     "EMOJI_SCROLL_NAME",     "afv_scroll"),
    SOUND:      emoji("EMOJI_SOUND_ID",      "EMOJI_SOUND_NAME",      "afv_sound"),
    STAR:       emoji("EMOJI_STAR_ID",       "EMOJI_STAR_NAME",       "afv_star"),
    TICKET:     emoji("EMOJI_TICKET_ID",     "EMOJI_TICKET_NAME",     "afv_ticket"),
    WARNING:    emoji("EMOJI_WARNING_ID",    "EMOJI_WARNING_NAME",    "afv_warning"),
    YOUTUBE:    emoji("EMOJI_YOUTUBE_ID",    "EMOJI_YOUTUBE_NAME",    "afv_youtube"),
  },

  FLIGHT_BASE_PAY: Number(process.env.FLIGHT_BASE_PAY) || 500,
  CURRENCY:        process.env.CURRENCY       || "EUR",
  CURRENCY_ICON:   process.env.CURRENCY_ICON  || "€",
  AIRLINE_NAME:    process.env.AIRLINE_NAME   || "AF VIRTUAL",
  NOTAM_BANNER:    process.env.NOTAM_BANNER   || null,
};
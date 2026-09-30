/**
 * Convert channel data into a Televizo-compatible M3U playlist.
 *
 * Each channel contains:
 * - channel name
 * - logo URL
 * - website/category
 * - stream ID
 *
 * The playlist never stores a live token.
 * It stores the public dynamic resolver URL instead.
 */

/**
 * Public base URL of our Live TV service.
 *
 * This is the URL Televizo will access.
 */
const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL ||
  "https://tv.abledrama.top";

/**
 * Clean normal text.
 */
function cleanText(value, fallback = "") {
  return String(value ?? fallback)
    .replace(/\r?\n/g, " ")
    .trim();
}

/**
 * Escape a value used inside an M3U attribute.
 */
function escapeAttribute(value) {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}

/**
 * Clean the channel display name.
 */
function cleanChannelName(value, streamId) {
  const name = cleanText(
    value,
    `Channel ${streamId}`
  );

  return name || `Channel ${streamId}`;
}

/**
 * Build the public dynamic stream URL.
 *
 * Example:
 *
 *   streamId = 209
 *
 * becomes:
 *
 *   https://tv.abledrama.top/stream/209
 */
function buildStreamUrl(streamId) {
  return (
    `${PUBLIC_BASE_URL.replace(/\/+$/, "")}` +
    `/stream/${encodeURIComponent(streamId)}`
  );
}

/**
 * Create the complete M3U playlist.
 */
export function makeM3U(channels = []) {
  const lines = [
    "#EXTM3U"
  ];

  for (const channel of channels) {
    if (!channel || !channel.streamId) {
      continue;
    }

    const streamId =
      String(channel.streamId);

    const name =
      cleanChannelName(
        channel.name,
        streamId
      );

    const logo =
      escapeAttribute(
        channel.logo || ""
      );

    const group =
      escapeAttribute(
        channel.category ||
        channel.siteName ||
        "Live TV"
      );

    const tvgName =
      escapeAttribute(name);

    const streamUrl =
      buildStreamUrl(streamId);

    lines.push(
      `#EXTINF:-1 ` +
      `tvg-name="${tvgName}" ` +
      `tvg-logo="${logo}" ` +
      `group-title="${group}",` +
      `${name}`
    );

    lines.push(streamUrl);
  }

  lines.push("");

  return lines.join("\n");
}

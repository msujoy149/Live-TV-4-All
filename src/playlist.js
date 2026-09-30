/**
 * Convert channel data into a Televizo-compatible M3U playlist.
 *
 * The playlist contains:
 * - channel name
 * - logo URL
 * - website/category
 * - dynamic stream resolver URL
 *
 * No live token is stored in the playlist.
 *
 * The stream URL base can be provided by the server.
 * This allows the same code to work with:
 *
 * Local:
 *   http://192.168.0.103:3000
 *
 * Public:
 *   https://tv.abledrama.top
 */

const DEFAULT_PUBLIC_BASE_URL =
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
 * Normalize the base URL.
 */
function normalizeBaseUrl(baseUrl) {
  return String(
    baseUrl || DEFAULT_PUBLIC_BASE_URL
  ).replace(/\/+$/, "");
}

/**
 * Build the public dynamic stream URL.
 *
 * Example:
 *
 *   baseUrl  = http://192.168.0.103:3000
 *   streamId = 209
 *
 * becomes:
 *
 *   http://192.168.0.103:3000/stream/209
 */
function buildStreamUrl(
  streamId,
  baseUrl
) {
  return (
    `${normalizeBaseUrl(baseUrl)}` +
    `/stream/${encodeURIComponent(streamId)}`
  );
}

/**
 * Create the complete M3U playlist.
 *
 * @param {Array} channels
 * @param {string} baseUrl
 */
export function makeM3U(
  channels = [],
  baseUrl = DEFAULT_PUBLIC_BASE_URL
) {
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
      buildStreamUrl(
        streamId,
        baseUrl
      );

    lines.push(
      `#EXTINF:-1 ` +
      `tvg-name="${tvgName}" ` +
      `tvg-logo="${logo}" ` +
      `group-title="${group}",` +
      `${name}`
    );

    lines.push(
      streamUrl
    );
  }

  lines.push("");

  return lines.join("\n");
}

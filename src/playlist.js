/**
 * Convert channel data into a Televizo-compatible M3U playlist.
 *
 * The playlist contains:
 * - channel name
 * - logo URL
 * - website/category
 * - dynamic HLS resolver URL
 *
 * No live token is stored.
 *
 * Every channel uses:
 *
 *   /stream/{streamId}.m3u8
 *
 * so the player receives an HLS-looking URL directly.
 */

const DEFAULT_PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL ||
  "https://tv.abledrama.top";

/**
 * Clean normal text.
 */
function cleanText(
  value,
  fallback = ""
) {
  return String(
    value ?? fallback
  )
    .replace(/\r?\n/g, " ")
    .trim();
}

/**
 * Escape a value used inside
 * an M3U attribute.
 */
function escapeAttribute(value) {
  return cleanText(value)
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /"/g,
      "&quot;"
    );
}

/**
 * Clean channel name.
 */
function cleanChannelName(
  value,
  streamId
) {
  const name = cleanText(
    value,
    `Channel ${streamId}`
  );

  return (
    name ||
    `Channel ${streamId}`
  );
}

/**
 * Normalize the base URL.
 */
function normalizeBaseUrl(
  baseUrl
) {
  return String(
    baseUrl ||
      DEFAULT_PUBLIC_BASE_URL
  ).replace(
    /\/+$/,
    ""
  );
}

/**
 * Build the dynamic HLS resolver URL.
 *
 * Example:
 *
 * http://192.168.0.108:3000
 * +
 * /stream/209.m3u8
 */
function buildStreamUrl(
  streamId,
  baseUrl
) {
  return (
    `${normalizeBaseUrl(baseUrl)}` +
    `/stream/${encodeURIComponent(
      streamId
    )}.m3u8`
  );
}

/**
 * Create the complete M3U playlist.
 */
export function makeM3U(
  channels = [],
  baseUrl =
    DEFAULT_PUBLIC_BASE_URL
) {
  const lines = [
    "#EXTM3U"
  ];

  for (
    const channel of channels
  ) {
    if (
      !channel ||
      !channel.streamId
    ) {
      continue;
    }

    const streamId =
      String(
        channel.streamId
      );

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
      escapeAttribute(
        name
      );

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

  return lines.join(
    "\n"
  );
}

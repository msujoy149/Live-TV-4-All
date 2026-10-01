/**
 * Convert channel data into a Televizo-compatible M3U playlist.
 *
 * IMPORTANT:
 * - Never put a live token/HLS URL in the playlist.
 * - The playlist only contains our resolver endpoint.
 * - The resolver obtains the current playable URL when the user
 *   actually starts a channel.
 *
 * Multi-site format:
 *
 *   /stream/{siteId}/{streamId}.m3u8
 *
 * Using siteId prevents stream-ID collisions when multiple
 * source websites are added later.
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
function escapeAttribute(
  value
) {
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
  const name =
    cleanText(
      value,
      `Channel ${streamId}`
    );

  return (
    name ||
    `Channel ${streamId}`
  );
}

/**
 * Normalize the public base URL.
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
 * Build the dynamic resolver URL.
 *
 * New multi-site format:
 *
 * /stream/{siteId}/{streamId}.m3u8
 *
 * Example:
 *
 * /stream/xim-live-tv/209.m3u8
 */
function buildStreamUrl(
  channel,
  baseUrl
) {
  const siteId =
    String(
      channel.siteId || ""
    ).trim();

  const streamId =
    String(
      channel.streamId || ""
    ).trim();

  if (
    !siteId ||
    !streamId
  ) {
    return "";
  }

  return (
    `${normalizeBaseUrl(baseUrl)}` +
    `/stream/${encodeURIComponent(
      siteId
    )}` +
    `/${encodeURIComponent(
      streamId
    )}.m3u8`
  );
}

/**
 * Create the complete M3U playlist.
 *
 * No live HLS URL or token is stored here.
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
      !channel.streamId ||
      !channel.siteId
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
        channel,
        baseUrl
      );

    if (!streamUrl) {
      continue;
    }

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

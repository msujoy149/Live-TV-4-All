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
 */

function cleanText(value, fallback = "") {
  return String(value ?? fallback)
    .replace(/\r?\n/g, " ")
    .trim();
}

function escapeAttribute(value) {
  return cleanText(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}

function escapeChannelName(value) {
  return cleanText(value, "Unknown Channel")
    .replace(/\r?\n/g, " ");
}

function buildStreamUrl(channel) {
  // Use a custom stream URL when a source provides one.
  if (channel.streamUrl) {
    return channel.streamUrl;
  }

  // Default dynamic resolver endpoint.
  return `/stream/${encodeURIComponent(channel.streamId)}`;
}

export function makeM3U(channels = []) {
  const lines = ["#EXTM3U"];

  for (const channel of channels) {
    if (!channel || !channel.streamId) {
      continue;
    }

    const name = escapeChannelName(
      channel.name || `Channel ${channel.streamId}`
    );

    const logo = escapeAttribute(
      channel.logo || ""
    );

    const group = escapeAttribute(
      channel.category || "Live TV"
    );

    const tvgName = escapeAttribute(name);

    const streamUrl = buildStreamUrl(channel);

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

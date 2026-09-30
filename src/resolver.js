import * as cheerio from "cheerio";

/**
 * Resolve the current playable HLS URL for a stream.
 *
 * Flow:
 *   /img/play.php?stream=209
 *        ↓
 *   fresh iframe/embed URL
 *        ↓
 *   fresh token
 *        ↓
 *   /209/index.m3u8?token=...
 */
export async function resolveStream({ baseUrl, streamId }) {
  if (!baseUrl) {
    throw new Error("baseUrl is required");
  }

  if (!streamId) {
    throw new Error("streamId is required");
  }

  const playUrl = new URL(
    `/img/play.php?stream=${encodeURIComponent(streamId)}`,
    baseUrl
  );

  const response = await fetch(playUrl, {
    redirect: "follow",
    headers: {
      "user-agent": "Live-TV-4-All/1.0",
      "accept": "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(
      `play.php request failed: HTTP ${response.status}`
    );
  }

  const html = await response.text();

  const $ = cheerio.load(html);

  // Find the player iframe returned by play.php.
  const iframeSrc = $("iframe[src]").first().attr("src");

  if (!iframeSrc) {
    throw new Error(
      "No iframe source was found in play.php response"
    );
  }

  // Convert relative URL / protocol-relative URL into absolute URL.
  const embedUrl = new URL(iframeSrc, playUrl);

  // The source website provides the current token.
  const token = embedUrl.searchParams.get("token");

  if (!token) {
    throw new Error(
      "No token was found in the embed URL"
    );
  }

  // Preserve the port from the embed server.
  const port = embedUrl.port
    ? `:${embedUrl.port}`
    : "";

  // This is the direct HLS URL that VLC/Televizo can consume.
  const hlsUrl =
    `${embedUrl.protocol}//${embedUrl.hostname}${port}/` +
    `${encodeURIComponent(streamId)}/index.m3u8` +
    `?token=${encodeURIComponent(token)}`;

  return {
    streamId: String(streamId),
    token,
    embedUrl: embedUrl.toString(),
    hlsUrl
  };
}

import * as cheerio from "cheerio";

/**
 * XIM Live TV parser.
 *
 * Reads channel information from the XIM Live TV webpage.
 *
 * Extracts:
 * - stream ID
 * - logo URL
 * - source category
 * - channel name
 */
export function parseXimLiveTV(
  html,
  baseUrl,
  siteName = "XIM Live TV"
) {
  const $ = cheerio.load(html);

  const channels = [];
  const seenStreams = new Set();

  /**
   * Convert a logo filename into a readable channel name.
   *
   * Example:
   *   Jamunatv.png
   *   -> Jamuna TV
   */
  function makeChannelName(imageSrc, streamId) {
    const fileName = imageSrc
      .split("/")
      .pop()
      ?.split("?")[0]
      ?.replace(/\.[^.]+$/, "")
      ?.trim();

    if (!fileName) {
      return `Channel ${streamId}`;
    }

    const knownNames = {
      Jamunatv: "Jamuna TV",
      independenttv: "Independent TV",
      atnbangla: "ATN Bangla",
      atnnews: "ATN News",
      Dbc: "DBC News",
      Masranga: "Maasranga",
      ChannelI: "Channel i",
      TSPORTS: "T Sports",
      Tsports: "T Sports",
      "Star-plus": "Star Plus",
      "Star-Gold": "Star Gold",
      "Sony Entertainment": "Sony Entertainment",
      "Colors-Hindi": "Colors Hindi"
    };

    if (knownNames[fileName]) {
      return knownNames[fileName];
    }

    return fileName
      .replace(/[_-]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Read every list item that contains a playable channel.
   */
  $("li").each((_index, li) => {
    const item = $(li);

    const link = item.find("a[onclick]").first();
    const image = item.find("img[src]").first();

    if (!link.length || !image.length) {
      return;
    }

    const onclick = link.attr("onclick") || "";

    /**
     * Example source:
     *
     * view.location.href='img/play.php?stream=209'
     */
    const streamMatch = onclick.match(
      /play\.php\?stream=(\d+)/i
    );

    if (!streamMatch) {
      return;
    }

    const streamId = streamMatch[1];

    // Prevent duplicate channels.
    if (seenStreams.has(streamId)) {
      return;
    }

    seenStreams.add(streamId);

    const imageSrc = image.attr("src") || "";

    let logo;

    try {
      logo = new URL(imageSrc, baseUrl).href;
    } catch {
      return;
    }

    /**
     * The source website uses classes such as:
     * Sports, Bangla, Hindi, English, Others
     */
    const classes = (item.attr("class") || "")
      .split(/\s+/)
      .filter(Boolean);

    const sourceCategory =
      classes.find((value) =>
        ["Sports", "Bangla", "Hindi", "English", "Others"].includes(value)
      ) || "Others";

    const name = makeChannelName(
      imageSrc,
      streamId
    );

    channels.push({
      name,
      streamId,
      logo,
      category: siteName,
      sourceCategory,
      sources: []
    });
  });

  return channels;
}

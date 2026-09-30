import * as cheerio from "cheerio";

/**
 * XIM Live TV parser.
 *
 * Channel names are primarily derived from the logo filename.
 *
 * Examples:
 *   Tsports.png
 *      -> T Sports
 *
 *   Zee-Bangla.png
 *      -> Zee Bangla
 *
 *   Sony-Aath.png
 *      -> Sony Aath
 *
 *   SomoyTV1689411430.png
 *      -> Somoy TV
 */

/**
 * Convert a logo filename into a clean channel name.
 */
function getChannelNameFromLogo(imageSrc, streamId) {
  if (!imageSrc) {
    return `Channel ${streamId}`;
  }

  let fileName = imageSrc
    .split("/")
    .pop()
    ?.split("?")[0];

  if (!fileName) {
    return `Channel ${streamId}`;
  }

  try {
    fileName = decodeURIComponent(fileName);
  } catch {
    // Keep the original filename when decoding fails.
  }

  // Remove file extension.
  fileName = fileName.replace(/\.[^.]+$/, "");

  // Remove common timestamp suffixes.
  // Example:
  // SomoyTV1689411430 -> SomoyTV
  fileName = fileName.replace(/\d{8,}$/g, "");

  // Normalize separators.
  fileName = fileName.replace(/[_-]+/g, " ");

  // Split CamelCase.
  // Example:
  // SonyAath -> Sony Aath
  // StarGold -> Star Gold
  fileName = fileName.replace(
    /([a-z])([A-Z])/g,
    "$1 $2"
  );

  // Handle a single-letter prefix.
  // Example:
  // Tsports -> T sports
  fileName = fileName.replace(
    /^([A-Z])([a-z]+)$/,
    "$1 $2"
  );

  // Normalize common channel suffixes.
  // Example:
  // Jamunatv -> Jamuna TV
  // Independenttv -> Independent TV
  fileName = fileName.replace(
    /^(.+?)\s*tv$/i,
    "$1 TV"
  );

  // Normalize known compact brand forms where the filename
  // contains no natural word separator.
  const normalizedNames = {
    atnbangla: "ATN Bangla",
    atnnews: "ATN News",
    dbc: "DBC News",
    dbctv: "DBC News",
    channeli: "Channel i",
    tsports: "T Sports",
    jamunatv: "Jamuna TV",
    independenttv: "Independent TV"
  };

  const normalizedKey = fileName
    .replace(/\s+/g, "")
    .toLowerCase();

  if (normalizedNames[normalizedKey]) {
    return normalizedNames[normalizedKey];
  }

  // Clean extra spaces.
  fileName = fileName
    .replace(/\s+/g, " ")
    .trim();

  if (!fileName) {
    return `Channel ${streamId}`;
  }

  // Convert words to readable title case while preserving
  // common uppercase-style names already handled above.
  return fileName
    .split(" ")
    .map((word) => {
      if (!word) {
        return "";
      }

      return (
        word.charAt(0).toUpperCase() +
        word.slice(1).toLowerCase()
      );
    })
    .join(" ");
}

/**
 * XIM Live TV website parser.
 *
 * Extracts:
 * - stream ID
 * - logo URL
 * - channel name from logo filename
 * - internal source category
 */
export function parseXimLiveTV(
  html,
  baseUrl,
  siteName = "XIM Live TV"
) {
  const $ = cheerio.load(html);

  const channels = [];
  const seenStreams = new Set();

  $("li").each((_index, li) => {
    const item = $(li);

    const link = item
      .find("a[onclick]")
      .first();

    const image = item
      .find("img[src]")
      .first();

    if (!link.length || !image.length) {
      return;
    }

    const onclick =
      link.attr("onclick") || "";

    /**
     * Expected source pattern:
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

    // Do not add the same stream twice.
    if (seenStreams.has(streamId)) {
      return;
    }

    seenStreams.add(streamId);

    const imageSrc =
      image.attr("src") || "";

    let logo;

    try {
      logo = new URL(
        imageSrc,
        baseUrl
      ).href;
    } catch {
      return;
    }

    /**
     * Read the source website's internal category.
     *
     * Examples:
     * Sports
     * Bangla
     * Hindi
     * English
     * Others
     */
    const classes =
      (item.attr("class") || "")
        .split(/\s+/)
        .filter(Boolean);

    const sourceCategory =
      classes.find((value) =>
        [
          "Sports",
          "Bangla",
          "Hindi",
          "English",
          "Others"
        ].includes(value)
      ) || "Others";

    const name =
      getChannelNameFromLogo(
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

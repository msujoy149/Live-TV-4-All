import * as cheerio from "cheerio";

/**
 * XIM Live TV parser.
 *
 * Channel names are primarily derived from the logo filename.
 *
 * Examples:
 *
 * Tsports.png
 *   -> T Sports
 *
 * Discovery.png
 *   -> Discovery
 *
 * Masranga.png
 *   -> Masranga
 *
 * Zee-Bangla.png
 *   -> Zee Bangla
 *
 * Sony-Aath.png
 *   -> Sony Aath
 *
 * Star-Sports-Select2.png
 *   -> Star Sports Select 2
 */

/**
 * Convert a logo filename into a clean channel name.
 */
function getChannelNameFromLogo(
  imageSrc,
  streamId
) {
  if (!imageSrc) {
    return `Channel ${streamId}`;
  }

  let fileName =
    imageSrc
      .split("/")
      .pop()
      ?.split("?")[0] || "";

  if (!fileName) {
    return `Channel ${streamId}`;
  }

  try {
    fileName = decodeURIComponent(fileName);
  } catch {
    // Keep the original filename if decoding fails.
  }

  // Remove the file extension.
  fileName = fileName.replace(
    /\.[^.]+$/,
    ""
  );

  // Remove long timestamp-style numeric suffixes.
  //
  // Example:
  // Sony Max HD1667728133
  // -> Sony Max HD
  //
  // SomoyTV1689411430
  // -> SomoyTV
  fileName = fileName.replace(
    /\d{8,}$/,
    ""
  );

  /**
   * Build a comparison key from the filename.
   *
   * Spaces, hyphens, underscores and case are ignored.
   */
  const lookupKey = fileName
    .replace(/[\s_-]+/g, "")
    .toLowerCase();

  /**
   * Known channel names.
   *
   * These are checked BEFORE generic formatting
   * so common channel names keep their intended form.
   */
  const knownNames = {
    tsports: "T Sports",

    discovery: "Discovery",
    masranga: "Masranga",

    zeebangla: "Zee Bangla",
    starjalsha: "Star Jalsha",
    jalshamovies: "Jalsha Movies",
    colorsbangla: "Colors Bangla",
    sonyaath: "Sony Aath",

    independenttv: "Independent TV",
    atnbangla: "ATN Bangla",
    atnnews: "ATN News",
    dbc: "DBC News",
    dbctv: "DBC News",
    channeli: "Channel i",
    jamunatv: "Jamuna TV",
    somoytv: "Somoy TV",

    starplus: "Star Plus",
    stargold: "Star Gold",
    sonyentertainment: "Sony Entertainment",
    colorshindi: "Colors Hindi",
    zeecinema: "Zee Cinema",
    sonymaxhd: "Sony Max HD",

    starmovie: "Star Movie",
    sonypix: "Sony Pix",
    nationalgeography: "National Geography",

    eurosports: "Eurosport",
    asports: "A Sports",
    nick: "Nick",
    disneyjunior: "Disney Junior",
    "9xjalwa": "9X Jalwa",
    sangeetbangla: "Sangeet Bangla",

    starsports1: "Star Sports 1",
    starsports2: "Star Sports 2",
    starsportsselect1: "Star Sports Select 1",
    starsportsselect2: "Star Sports Select 2",

    sonyten1: "Sony Ten 1",
    sonyten2: "Sony Ten 2",
    sonyten3: "Sony Ten 3"
  };

  if (knownNames[lookupKey]) {
    return knownNames[lookupKey];
  }

  /**
   * Convert filename separators into spaces.
   *
   * Example:
   * Star-Sports
   * -> Star Sports
   */
  fileName = fileName.replace(
    /[_-]+/g,
    " "
  );

  /**
   * Separate CamelCase only when a lowercase letter
   * is followed by an uppercase letter.
   *
   * This means:
   *
   * SonyAath
   * -> Sony Aath
   *
   * SomoyTV
   * -> Somoy TV
   *
   * But:
   *
   * Discovery
   * -> Discovery
   *
   * Masranga
   * -> Masranga
   */
  fileName = fileName.replace(
    /([a-z])([A-Z])/g,
    "$1 $2"
  );

  /**
   * Separate trailing channel numbers.
   *
   * Example:
   * Select2
   * -> Select 2
   *
   * Sports1
   * -> Sports 1
   */
  fileName = fileName.replace(
    /([A-Za-z])(\d+)/g,
    "$1 $2"
  );

  /**
   * Normalize whitespace.
   */
  fileName = fileName
    .replace(/\s+/g, " ")
    .trim();

  if (!fileName) {
    return `Channel ${streamId}`;
  }

  /**
   * Format unknown names into readable text.
   */
  return fileName
    .split(" ")
    .map((word) => {
      if (!word) {
        return "";
      }

      // Preserve names such as 9X.
      if (/^\d+[A-Z]+$/i.test(word)) {
        return word.toUpperCase();
      }

      return (
        word.charAt(0).toUpperCase() +
        word.slice(1).toLowerCase()
      );
    })
    .join(" ");
}

/**
 * Parse the XIM Live TV website.
 *
 * Extracts:
 * - stream ID
 * - logo URL
 * - channel name
 * - source category
 */
export function parseXimLiveTV(
  html,
  baseUrl,
  siteName = "XIM Live TV (BDIX)"
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

    // Prevent duplicate stream IDs.
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
     * Detect source category.
     *
     * The source website uses:
     * Sports
     * Bangla
     * Hindi
     * English
     * others
     */
    const classes =
      (item.attr("class") || "")
        .split(/\s+/)
        .filter(Boolean);

    const sourceCategory =
      classes.find((value) =>
        [
          "Sports",
          "sports",
          "Bangla",
          "bangla",
          "Hindi",
          "hindi",
          "English",
          "english",
          "Others",
          "others"
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

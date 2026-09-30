import * as cheerio from "cheerio";

/**
 * XIM Live TV parser.
 *
 * Channel names are detected primarily from the logo filename.
 *
 * Name detection priority inside this parser:
 *
 * 1. Known channel-name mapping
 * 2. Filename separator cleanup
 * 3. CamelCase separation
 * 4. Final text cleanup
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
      ?.split("?")[0];

  if (!fileName) {
    return `Channel ${streamId}`;
  }

  try {
    fileName =
      decodeURIComponent(
        fileName
      );
  } catch {
    // Keep original filename
    // when URL decoding fails.
  }

  /**
   * Remove file extension.
   */
  fileName =
    fileName.replace(
      /\.[^.]+$/,
      ""
    );

  /**
   * Remove long numeric timestamp suffixes.
   *
   * Example:
   *
   * Sony Max Hd1667728133
   * -> Sony Max Hd
   *
   * SomoyTV1689411430
   * -> SomoyTV
   */
  fileName =
    fileName.replace(
      /\d{8,}$/g,
      ""
    );

  /**
   * Known channel names.
   *
   * These are checked BEFORE generic
   * text formatting so that channel brands
   * keep their intended spelling.
   */
  const knownNames = {
    tsports: "T Sports",

    starsports1:
      "Star Sports 1",

    starsports2:
      "Star Sports 2",

    starsportsselect1:
      "Star Sports Select 1",

    starsportsselect2:
      "Star Sports Select 2",

    sonyten1:
      "Sony Ten 1",

    sonyten2:
      "Sony Ten 2",

    sonyten3:
      "Sony Ten 3",

    discovery:
      "Discovery",

    masranga:
      "Masranga",

    masranga tv:
      "Masranga",

    zeebangla:
      "Zee Bangla",

    starjalsha:
      "Star Jalsha",

    jalshamovies:
      "Jalsha Movies",

    colorsbangla:
      "Colors Bangla",

    sonyaath:
      "Sony Aath",

    independenttv:
      "Independent TV",

    atnbangla:
      "ATN Bangla",

    atnnews:
      "ATN News",

    dbc:
      "DBC News",

    dbctv:
      "DBC News",

    channeli:
      "Channel i",

    jamunatv:
      "Jamuna TV",

    somoytv:
      "Somoy TV",

    starplus:
      "Star Plus",

    stargold:
      "Star Gold",

    sonyentertainment:
      "Sony Entertainment",

    colorshindi:
      "Colors Hindi",

    zeecinema:
      "Zee Cinema",

    sonymaxhd:
      "Sony Max HD",

    starmovie:
      "Star Movie",

    sonypix:
      "Sony Pix",

    eurosports:
      "Eurosport",

    asports:
      "A Sports",

    nationalgeography:
      "National Geography",

    nick:
      "Nick",

    disneyjunior:
      "Disney Junior",

    "9xjalwa":
      "9X Jalwa",

    sangeetbangla:
      "Sangeet Bangla"
  };

  /**
   * Create a lookup key that ignores:
   * - spaces
   * - hyphens
   * - underscores
   * - letter case
   */
  const lookupKey =
    fileName
      .replace(
        /[\s_-]+/g,
        ""
      )
      .toLowerCase();

  if (
    knownNames[lookupKey]
  ) {
    return knownNames[
      lookupKey
    ];
  }

  /**
   * Generic separator cleanup.
   *
   * Star-Sports
   * -> Star Sports
   *
   * 9X_Jalwa
   * -> 9X Jalwa
   */
  fileName =
    fileName.replace(
      /[_-]+/g,
      " "
    );

  /**
   * Separate CamelCase.
   *
   * SonyAath
   * -> Sony Aath
   *
   * SomoyTV
   * -> Somoy TV
   *
   * IMPORTANT:
   *
   * We do NOT split the first capital
   * from a normal one-word name.
   *
   * Therefore:
   *
   * Discovery
   * -> Discovery
   *
   * Masranga
   * -> Masranga
   */
  fileName =
    fileName.replace(
      /([a-z])([A-Z])/g,
      "$1 $2"
    );

  /**
   * Separate letters from trailing numbers.
   *
   * Select2
   * -> Select 2
   *
   * Sports1
   * -> Sports 1
   */
  fileName =
    fileName.replace(
      /([A-Za-z])(\d+)/g,
      "$1 $2"
    );

  /**
   * Clean repeated spaces.
   */
  fileName =
    fileName
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  if (!fileName) {
    return `Channel ${streamId}`;
  }

  /**
   * Convert each word to readable capitalization.
   *
   * Known brand names have already been
   * returned above, so this is only for
   * unknown filenames.
   */
  return fileName
    .split(" ")
    .map(
      (word) => {
        if (!word) {
          return "";
        }

        return (
          word.charAt(0).toUpperCase() +
          word
            .slice(1)
            .toLowerCase()
        );
      }
    )
    .join(" ");
}

/**
 * XIM Live TV website parser.
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
  siteName =
    "XIM Live TV (BDIX)"
) {
  const $ =
    cheerio.load(html);

  const channels = [];

  const seenStreams =
    new Set();

  $("li").each(
    (_index, li) => {
      const item =
        $(li);

      const link =
        item
          .find(
            "a[onclick]"
          )
          .first();

      const image =
        item
          .find(
            "img[src]"
          )
          .first();

      if (
        !link.length ||
        !image.length
      ) {
        return;
      }

      const onclick =
        link.attr(
          "onclick"
        ) || "";

      /**
       * Expected source:
       *
       * view.location.href='img/play.php?stream=209'
       */
      const streamMatch =
        onclick.match(
          /play\.php\?stream=(\d+)/i
        );

      if (!streamMatch) {
        return;
      }

      const streamId =
        streamMatch[1];

      /**
       * Prevent duplicate stream IDs.
       */
      if (
        seenStreams.has(
          streamId
        )
      ) {
        return;
      }

      seenStreams.add(
        streamId
      );

      const imageSrc =
        image.attr(
          "src"
        ) || "";

      let logo;

      try {
        logo =
          new URL(
            imageSrc,
            baseUrl
          ).href;
      } catch {
        return;
      }

      /**
       * Detect source category.
       *
       * Examples:
       *
       * Sports
       * Bangla
       * Hindi
       * English
       * Others
       */
      const classes =
        (
          item.attr(
            "class"
          ) || ""
        )
          .split(
            /\s+/
          )
          .filter(
            Boolean
          );

      const sourceCategory =
        classes.find(
          (value) =>
            [
              "Sports",
              "Bangla",
              "Hindi",
              "English",
              "Others"
            ].includes(
              value
            )
        ) ||
        "Others";

      /**
       * Get the actual channel name
       * from the logo filename.
       */
      const name =
        getChannelNameFromLogo(
          imageSrc,
          streamId
        );

      channels.push({
        name,

        streamId,

        logo,

        category:
          siteName,

        sourceCategory,

        sources: []
      });
    }
  );

  return channels;
}

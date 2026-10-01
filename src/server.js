import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveStream } from "./resolver.js";
import { makeM3U } from "./playlist.js";
import { parseXimLiveTV } from "./parsers/xim-live-tv.js";

const app = express();

const PORT =
  process.env.PORT || 3000;

const __filename =
  fileURLToPath(import.meta.url);

const __dirname =
  path.dirname(__filename);

const configPath =
  path.join(
    __dirname,
    "..",
    "config",
    "sites.json"
  );

/**
 * Available website adapters.
 *
 * Each website type can have its own
 * parser implementation.
 */
const parsers = {
  "xim-live-tv":
    parseXimLiveTV
};

/**
 * Load website configuration.
 */
async function loadConfig() {
  const raw =
    await fs.readFile(
      configPath,
      "utf8"
    );

  return JSON.parse(raw);
}

/**
 * Fetch a source website homepage.
 *
 * This is intentionally done again when
 * resolving a channel so channel data stays
 * current and no source playback URL is stored.
 */
async function fetchSourcePage(
  baseUrl
) {
  const response =
    await fetch(
      baseUrl,
      {
        redirect: "follow",

        signal:
          AbortSignal.timeout(
            15000
          ),

        headers: {
          "user-agent":
            "Live-TV-4-All/1.0",

          "accept":
            "text/html,application/xhtml+xml"
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      `Source returned HTTP ${response.status}`
    );
  }

  return response.text();
}

/**
 * Convert a site name into a stable
 * internal site ID.
 */
function makeSiteId(
  name
) {
  return String(
    name || "site"
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      "");
}

/**
 * Get the configured site ID.
 */
function getSiteId(
  site
) {
  return String(
    site.id ||
      makeSiteId(
        site.name
      )
  );
}

/**
 * Apply manual channel-name overrides.
 */
function applyNameOverrides(
  channels,
  site
) {
  const overrides =
    site.nameOverrides ||
    {};

  return channels.map(
    (channel) => {
      const manualName =
        overrides[
          String(
            channel.streamId
          )
        ];

      if (manualName) {
        return {
          ...channel,
          name: manualName
        };
      }

      return channel;
    }
  );
}

/**
 * Parse one configured source website.
 */
async function collectFromSite(
  site
) {
  const parser =
    parsers[site.type];

  if (!parser) {
    throw new Error(
      `No parser found for site type: ${site.type}`
    );
  }

  const baseUrl =
    String(
      site.baseUrl || ""
    ).replace(
      /\/+$/,
      ""
    );

  if (!baseUrl) {
    throw new Error(
      `Missing baseUrl for ${site.name}`
    );
  }

  const html =
    await fetchSourcePage(
      baseUrl
    );

  const siteId =
    getSiteId(
      site
    );

  let channels =
    parser(
      html,
      baseUrl,
      site.name
    );

  channels =
    applyNameOverrides(
      channels,
      site
    );

  return channels.map(
    (channel) => ({
      ...channel,

      siteId,

      siteName:
        site.name,

      sourceSite:
        baseUrl
    })
  );
}

/**
 * Get all enabled source websites.
 */
async function getEnabledSites() {
  const config =
    await loadConfig();

  return (
    config.sites || []
  ).filter(
    (site) =>
      site.enabled !== false
  );
}

/**
 * Collect channels from every enabled
 * source website.
 */
async function collectAllChannels() {
  const sites =
    await getEnabledSites();

  if (
    sites.length === 0
  ) {
    throw new Error(
      "No enabled source websites found"
    );
  }

  const allChannels =
    [];

  for (
    const site of sites
  ) {
    try {
      const channels =
        await collectFromSite(
          site
        );

      allChannels.push(
        ...channels
      );
    } catch (
      error
    ) {
      console.error(
        `Failed to load ${site.name}:`,
        error
      );
    }
  }

  return allChannels;
}

/**
 * Find a stream using its explicit site ID.
 *
 * IMPORTANT:
 * This is the main multi-site playback path.
 *
 * The source homepage is fetched again
 * during the playback request.
 *
 * No live HLS URL or token is stored.
 */
async function findStreamSource(
  siteId,
  streamId
) {
  const sites =
    await getEnabledSites();

  const site =
    sites.find(
      (item) =>
        getSiteId(
          item
        ) ===
        String(
          siteId
        )
    );

  if (!site) {
    throw new Error(
      `Source site not found: ${siteId}`
    );
  }

  /**
   * Fetch and parse the source again
   * at playback time.
   */
  const channels =
    await collectFromSite(
      site
    );

  const channel =
    channels.find(
      (item) =>
        String(
          item.streamId
        ) ===
        String(
          streamId
        )
    );

  if (!channel) {
    throw new Error(
      `Stream ${streamId} was not found on site ${siteId}`
    );
  }

  return {
    site,
    channel
  };
}

/**
 * Legacy lookup for old:
 *
 * /stream/209.m3u8
 *
 * This remains only for backward compatibility.
 *
 * New generated playlists will use:
 *
 * /stream/{siteId}/{streamId}.m3u8
 */
async function findLegacyStreamSource(
  streamId
) {
  const channels =
    await collectAllChannels();

  const matches =
    channels.filter(
      (item) =>
        String(
          item.streamId
        ) ===
        String(
          streamId
        )
    );

  if (
    matches.length === 0
  ) {
    throw new Error(
      `Stream ${streamId} was not found`
    );
  }

  /**
   * If multiple websites later contain
   * the same stream ID, the old URL becomes
   * ambiguous. The new site-specific URL
   * should then be used.
   */
  if (
    matches.length > 1
  ) {
    throw new Error(
      `Stream ${streamId} is ambiguous across multiple sites; use a site-specific URL`
    );
  }

  const match =
    matches[0];

  const sites =
    await getEnabledSites();

  const site =
    sites.find(
      (item) =>
        getSiteId(
          item
        ) ===
        match.siteId
    );

  if (!site) {
    throw new Error(
      `Source site not found for stream ${streamId}`
    );
  }

  return {
    site,
    channel:
      match
  };
}

/**
 * Determine the public base URL used
 * in the generated playlist.
 */
function getPlaylistBaseUrl(
  req
) {
  const configuredBase =
    process.env.PUBLIC_BASE_URL;

  if (
    configuredBase
  ) {
    return configuredBase.replace(
      /\/+$/,
      ""
    );
  }

  const forwardedProto =
    req.headers[
      "x-forwarded-proto"
    ];

  const protocol =
    forwardedProto
      ? String(
          forwardedProto
        )
          .split(",")[0]
          .trim()
      : req.protocol;

  const host =
    req.get(
      "host"
    );

  if (!host) {
    throw new Error(
      "Unable to determine request host"
    );
  }

  return (
    `${protocol}://${host}`
  );
}

/**
 * Home / health endpoint.
 */
app.get(
  "/",
  async (
    _req,
    res
  ) => {
    try {
      const sites =
        (
          await getEnabledSites()
        ).map(
          (site) => ({
            id:
              getSiteId(
                site
              ),

            name:
              site.name,

            type:
              site.type,

            baseUrl:
              site.baseUrl
          })
        );

      res.json({
        name:
          "Live TV 4 All",

        status:
          "online",

        sites
      });
    } catch (
      error
    ) {
      console.error(
        error
      );

      res.status(
        500
      ).json({
        error:
          "Failed to load configuration"
      });
    }
  }
);

/**
 * Dynamic M3U playlist.
 *
 * IMPORTANT:
 * The playlist never contains a live token
 * or direct temporary HLS URL.
 */
app.get(
  "/latest.m3u",
  async (
    req,
    res
  ) => {
    try {
      const channels =
        await collectAllChannels();

      if (
        channels.length === 0
      ) {
        return res
          .status(503)
          .send(
            "#EXTM3U\n"
          );
      }

      const baseUrl =
        getPlaylistBaseUrl(
          req
        );

      const playlist =
        makeM3U(
          channels,
          baseUrl
        );

      res.set({
        "content-type":
          "application/vnd.apple.mpegurl; charset=UTF-8",

        "cache-control":
          "no-store, no-cache, must-revalidate",

        "pragma":
          "no-cache",

        "expires":
          "0"
      });

      return res.send(
        playlist
      );
    } catch (
      error
    ) {
      console.error(
        "Playlist error:",
        error
      );

      return res
        .status(500)
        .send(
          "#EXTM3U\n"
        );
    }
  }
);

/**
 * Main multi-site stream resolver.
 *
 * Every playback request:
 *
 * 1. identifies the source website
 * 2. fetches that source again
 * 3. verifies the requested channel
 * 4. calls resolver.js
 * 5. gets the current playable URL
 * 6. sends a 302 redirect
 *
 * Nothing is persisted.
 */
async function handleStreamRequest(
  req,
  res
) {
  try {
    const siteId =
      String(
        req.params.siteId ||
          ""
      );

    let streamId =
      String(
        req.params.streamId ||
          ""
      ).replace(
        /\.m3u8$/i,
        ""
      );

    if (!siteId) {
      return res
        .status(400)
        .send(
          "Invalid site ID"
        );
    }

    if (
      !/^\d+$/.test(
        streamId
      )
    ) {
      return res
        .status(400)
        .send(
          "Invalid stream ID"
        );
    }

    const {
      site
    } =
      await findStreamSource(
        siteId,
        streamId
      );

    /**
     * IMPORTANT:
     *
     * resolver.js performs the actual
     * play.php -> iframe -> fresh token
     * -> HLS resolution.
     *
     * No result is stored.
     */
    const result =
      await resolveStream({
        baseUrl:
          site.baseUrl,

        streamId
      });

    /**
     * Prevent caching of the resolver
     * response so clients/proxies do not
     * intentionally reuse our redirect.
     */
    res.set({
      "cache-control":
        "no-store, no-cache, must-revalidate, proxy-revalidate",

      "pragma":
        "no-cache",

      "expires":
        "0",

      "surrogate-control":
        "no-store"
    });

    return res.redirect(
      302,
      result.hlsUrl
    );
  } catch (
    error
  ) {
    console.error(
      "Stream resolver error:",
      error
    );

    return res
      .status(502)
      .json({
        error:
          "Unable to resolve current stream"
      });
  }
}

/**
 * New multi-site HLS-looking resolver.
 *
 * Example:
 *
 * /stream/xim-live-tv/209.m3u8
 */
app.get(
  "/stream/:siteId/:streamId.m3u8",
  handleStreamRequest
);

/**
 * Same multi-site resolver without
 * the .m3u8 suffix.
 */
app.get(
  "/stream/:siteId/:streamId",
  handleStreamRequest
);

/**
 * Legacy single-site resolver endpoint.
 *
 * Existing old playlists can continue to use:
 *
 * /stream/209.m3u8
 */
app.get(
  "/stream/:streamId.m3u8",
  async (
    req,
    res
  ) => {
    try {
      const streamId =
        String(
          req.params.streamId ||
            ""
        ).replace(
          /\.m3u8$/i,
          ""
        );

      if (
        !/^\d+$/.test(
          streamId
        )
      ) {
        return res
          .status(400)
          .send(
            "Invalid stream ID"
          );
      }

      const {
        site
      } =
        await findLegacyStreamSource(
          streamId
        );

      const result =
        await resolveStream({
          baseUrl:
            site.baseUrl,

          streamId
        });

      res.set({
        "cache-control":
          "no-store, no-cache, must-revalidate, proxy-revalidate",

        "pragma":
          "no-cache",

        "expires":
          "0",

        "surrogate-control":
          "no-store"
      });

      return res.redirect(
        302,
        result.hlsUrl
      );
    } catch (
      error
    ) {
      console.error(
        "Legacy stream resolver error:",
        error
      );

      return res
        .status(502)
        .json({
          error:
            "Unable to resolve current stream"
        });
    }
  }
);

/**
 * Legacy endpoint without .m3u8.
 */
app.get(
  "/stream/:streamId",
  async (
    req,
    res
  ) => {
    try {
      const streamId =
        String(
          req.params.streamId ||
            ""
        );

      if (
        !/^\d+$/.test(
          streamId
        )
      ) {
        return res
          .status(400)
          .send(
            "Invalid stream ID"
          );
      }

      const {
        site
      } =
        await findLegacyStreamSource(
          streamId
        );

      const result =
        await resolveStream({
          baseUrl:
            site.baseUrl,

          streamId
        });

      res.set({
        "cache-control":
          "no-store, no-cache, must-revalidate, proxy-revalidate",

        "pragma":
          "no-cache",

        "expires":
          "0",

        "surrogate-control":
          "no-store"
      });

      return res.redirect(
        302,
        result.hlsUrl
      );
    } catch (
      error
    ) {
      console.error(
        "Legacy stream resolver error:",
        error
      );

      return res
        .status(502)
        .json({
          error:
            "Unable to resolve current stream"
        });
    }
  }
);

/**
 * 404 handler.
 */
app.use(
  (
    _req,
    res
  ) => {
    res
      .status(404)
      .json({
        error:
          "Not Found"
      });
  }
);

/**
 * Start server.
 */
app.listen(
  PORT,
  () => {
    console.log(
      `Live TV 4 All server running on port ${PORT}`
    );
  }
);

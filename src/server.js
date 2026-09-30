import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveStream } from "./resolver.js";
import { makeM3U } from "./playlist.js";
import { parseXimLiveTV } from "./parsers/xim-live-tv.js";

const app = express();

const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(
  __dirname,
  "..",
  "config",
  "sites.json"
);

/**
 * Available website adapters.
 *
 * Every website type can have its own parser.
 */
const parsers = {
  "xim-live-tv": parseXimLiveTV
};

/**
 * Load website configuration.
 */
async function loadConfig() {
  const raw = await fs.readFile(
    configPath,
    "utf8"
  );

  return JSON.parse(raw);
}

/**
 * Fetch source website HTML.
 */
async function fetchSourcePage(baseUrl) {
  const response = await fetch(baseUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
    headers: {
      "user-agent": "Live-TV-4-All/1.0",
      "accept":
        "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Source returned HTTP ${response.status}`
    );
  }

  return response.text();
}

/**
 * Convert a site name into a stable internal ID.
 */
function makeSiteId(name) {
  return String(name || "site")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Apply manual channel-name overrides.
 */
function applyNameOverrides(
  channels,
  site
) {
  const overrides =
    site.nameOverrides || {};

  return channels.map((channel) => {
    const manualName =
      overrides[
        String(channel.streamId)
      ];

    if (manualName) {
      return {
        ...channel,
        name: manualName
      };
    }

    return channel;
  });
}

/**
 * Parse one configured source website.
 */
async function collectFromSite(site) {
  const parser =
    parsers[site.type];

  if (!parser) {
    throw new Error(
      `No parser found for site type: ${site.type}`
    );
  }

  const baseUrl =
    String(site.baseUrl || "")
      .replace(/\/+$/, "");

  if (!baseUrl) {
    throw new Error(
      `Missing baseUrl for ${site.name}`
    );
  }

  const html =
    await fetchSourcePage(baseUrl);

  const siteId =
    site.id ||
    makeSiteId(site.name);

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
 * Collect channels from all enabled websites.
 */
async function collectAllChannels() {
  const config =
    await loadConfig();

  const sites =
    (config.sites || [])
      .filter(
        (site) =>
          site.enabled !== false
      );

  if (sites.length === 0) {
    throw new Error(
      "No enabled source websites found"
    );
  }

  const allChannels = [];

  for (const site of sites) {
    try {
      const channels =
        await collectFromSite(
          site
        );

      allChannels.push(
        ...channels
      );
    } catch (error) {
      console.error(
        `Failed to load ${site.name}:`,
        error
      );
    }
  }

  return allChannels;
}

/**
 * Find the source website for a stream.
 */
async function findStreamSource(
  streamId
) {
  const channels =
    await collectAllChannels();

  const channel =
    channels.find(
      (item) =>
        String(item.streamId) ===
        String(streamId)
    );

  if (!channel) {
    throw new Error(
      `Stream ${streamId} was not found`
    );
  }

  const config =
    await loadConfig();

  const site =
    (config.sites || [])
      .find(
        (item) =>
          item.enabled !== false &&
          (
            item.id ||
            makeSiteId(item.name)
          ) ===
            channel.siteId
      );

  if (!site) {
    throw new Error(
      `Source site not found for stream ${streamId}`
    );
  }

  return {
    site,
    channel
  };
}

/**
 * Determine the base URL used in the generated playlist.
 */
function getPlaylistBaseUrl(req) {
  const configuredBase =
    process.env.PUBLIC_BASE_URL;

  if (configuredBase) {
    return configuredBase
      .replace(/\/+$/, "");
  }

  const forwardedProto =
    req.headers[
      "x-forwarded-proto"
    ];

  const protocol =
    forwardedProto
      ? String(
          forwardedProto
        ).split(",")[0].trim()
      : req.protocol;

  const host =
    req.get("host");

  if (!host) {
    throw new Error(
      "Unable to determine request host"
    );
  }

  return `${protocol}://${host}`;
}

/**
 * Home / health endpoint.
 */
app.get(
  "/",
  async (_req, res) => {
    try {
      const config =
        await loadConfig();

      const sites =
        (config.sites || [])
          .filter(
            (site) =>
              site.enabled !== false
          )
          .map((site) => ({
            id:
              site.id ||
              makeSiteId(
                site.name
              ),

            name:
              site.name,

            type:
              site.type,

            baseUrl:
              site.baseUrl
          }));

      res.json({
        name:
          "Live TV 4 All",

        status:
          "online",

        sites
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          "Failed to load configuration"
      });
    }
  }
);

/**
 * Dynamic M3U playlist endpoint.
 *
 * Every request re-reads the source websites.
 */
app.get(
  "/latest.m3u",
  async (req, res) => {
    try {
      const channels =
        await collectAllChannels();

      if (channels.length === 0) {
        return res
          .status(503)
          .send("#EXTM3U\n");
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
    } catch (error) {
      console.error(
        "Playlist error:",
        error
      );

      return res
        .status(500)
        .send("#EXTM3U\n");
    }
  }
);

/**
 * Dynamic stream resolver.
 *
 * Every request resolves the stream again.
 *
 * Example:
 *
 *   /stream/209
 *
 * No token is stored here.
 */
app.get(
  "/stream/:streamId",
  async (req, res) => {
    try {
      const streamId =
        req.params.streamId;

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

      const { site } =
        await findStreamSource(
          streamId
        );

      const result =
        await resolveStream({
          baseUrl:
            site.baseUrl,

          streamId
        });

      /**
       * Prevent caching of the redirect.
       *
       * Every channel click should perform
       * a new resolver request and obtain
       * fresh playback information.
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
    } catch (error) {
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
);

/**
 * 404 handler.
 */
app.use(
  (_req, res) => {
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

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
 * Each website type can have its own parser.
 *
 * Later:
 *   "another-site": parseAnotherSite
 */
const parsers = {
  "xim-live-tv": parseXimLiveTV
};

/**
 * Load sites configuration.
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
 * Convert a site name into a stable internal identifier.
 *
 * Example:
 *   XIM Live TV
 *   -> xim-live-tv
 */
function makeSiteId(name) {
  return String(name || "site")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Apply optional manual channel-name overrides.
 *
 * Example in sites.json:
 *
 * "nameOverrides": {
 *   "101": "T Sports Extra",
 *   "106": "Another Channel"
 * }
 *
 * Manual names always have priority over
 * automatically detected names.
 */
function applyNameOverrides(channels, site) {
  const overrides =
    site.nameOverrides || {};

  return channels.map((channel) => {
    const manualName =
      overrides[String(channel.streamId)];

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
 * Parse one configured website.
 */
async function collectFromSite(site) {
  const parser = parsers[site.type];

  if (!parser) {
    throw new Error(
      `No parser found for site type: ${site.type}`
    );
  }

  const baseUrl =
    String(site.baseUrl || "").replace(
      /\/+$/,
      ""
    );

  if (!baseUrl) {
    throw new Error(
      `Missing baseUrl for ${site.name}`
    );
  }

  const html =
    await fetchSourcePage(baseUrl);

  const siteId =
    site.id || makeSiteId(site.name);

  let channels = parser(
    html,
    baseUrl,
    site.name
  );

  channels =
    applyNameOverrides(
      channels,
      site
    );

  return channels.map((channel) => ({
    ...channel,

    // Keep the website identity with every channel.
    siteId,

    siteName: site.name,

    // Helpful metadata for future multi-source support.
    sourceSite: baseUrl
  }));
}

/**
 * Collect channels from every enabled website.
 */
async function collectAllChannels() {
  const config =
    await loadConfig();

  const sites =
    (config.sites || [])
      .filter(
        (site) => site.enabled !== false
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
        await collectFromSite(site);

      allChannels.push(
        ...channels
      );
    } catch (error) {
      console.error(
        `Failed to load ${site.name}:`,
        error
      );

      // Do not stop the whole playlist
      // because one website failed.
    }
  }

  return allChannels;
}

/**
 * Find the source website for a stream.
 *
 * Current first-stage implementation:
 * - Match stream ID against collected channels.
 *
 * This allows different websites to eventually
 * have different parsers and different stream IDs.
 */
async function findStreamSource(streamId) {
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
    (config.sites || []).find(
      (item) =>
        item.enabled !== false &&
        (
          item.id ||
          makeSiteId(item.name)
        ) === channel.siteId
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
 * Home / health endpoint.
 */
app.get("/", async (_req, res) => {
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
            makeSiteId(site.name),

          name: site.name,

          type: site.type,

          baseUrl: site.baseUrl
        }));

    res.json({
      name: "Live TV 4 All",
      status: "online",
      sites
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        "Failed to load configuration"
    });
  }
});

/**
 * Dynamic M3U playlist.
 *
 * Televizo will use:
 *
 *   /latest.m3u
 *
 * The playlist is rebuilt from the
 * currently available source websites.
 */
app.get(
  "/latest.m3u",
  async (req, res) => {
    try {
      const channels =
        await collectAllChannels();

      if (channels.length === 0) {
        return res.status(503).send(
          "#EXTM3U\n"
        );
      }

      const playlist =
        makeM3U(channels);

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

      return res.status(500).send(
        "#EXTM3U\n"
      );
    }
  }
);

/**
 * Dynamic stream resolver.
 *
 * Example:
 *
 *   /stream/209
 *
 * The endpoint does NOT store a token.
 *
 * It asks XIM Live TV for the current
 * playback information and redirects to
 * the current HLS .m3u8 URL.
 */
app.get(
  "/stream/:streamId",
  async (req, res) => {
    try {
      const streamId =
        req.params.streamId;

      if (!/^\d+$/.test(streamId)) {
        return res.status(400).send(
          "Invalid stream ID"
        );
      }

      const {
        site
      } = await findStreamSource(
        streamId
      );

      const result =
        await resolveStream({
          baseUrl: site.baseUrl,
          streamId
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

      return res.status(502).json({
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
    res.status(404).json({
      error: "Not Found"
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

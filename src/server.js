import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveStream } from "./resolver.js";

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

async function loadConfig() {
  const raw = await fs.readFile(configPath, "utf8");
  return JSON.parse(raw);
}

/**
 * Find the source website responsible for a stream.
 *
 * For the first website we use the configured XIM Live TV source.
 * Later, when multiple sites are added, this function will be
 * expanded to use the site's parser/adapter and stream mapping.
 */
async function getSourceForStream(streamId) {
  const config = await loadConfig();

  const enabledSites = (config.sites || []).filter(
    (site) => site.enabled !== false
  );

  if (enabledSites.length === 0) {
    throw new Error("No enabled source websites found");
  }

  // First working source-site strategy.
  // The proper multi-site adapter mapping will be added next.
  const site = enabledSites[0];

  return {
    site,
    streamId: String(streamId)
  };
}

/**
 * Home / health endpoint.
 */
app.get("/", async (_req, res) => {
  try {
    const config = await loadConfig();

    const sites = (config.sites || [])
      .filter((site) => site.enabled !== false)
      .map((site) => ({
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
      error: "Failed to load configuration"
    });
  }
});

/**
 * Dynamic stream resolver endpoint.
 *
 * Example:
 *   /stream/209
 *
 * This does NOT store a token.
 * It asks the source website for the current token
 * and returns a redirect to the current HLS URL.
 */
app.get("/stream/:streamId", async (req, res) => {
  try {
    const streamId = req.params.streamId;

    if (!/^\d+$/.test(streamId)) {
      return res.status(400).send("Invalid stream ID");
    }

    const { site } = await getSourceForStream(streamId);

    const result = await resolveStream({
      baseUrl: site.baseUrl,
      streamId
    });

    return res.redirect(302, result.hlsUrl);
  } catch (error) {
    console.error("Stream resolver error:", error);

    return res.status(502).json({
      error: "Unable to resolve current stream"
    });
  }
});

/**
 * Placeholder playlist endpoint.
 *
 * The dynamic playlist generator will be connected here
 * after the website parser/adapter is added.
 */
app.get("/latest.m3u", async (_req, res) => {
  const playlist = `#EXTM3U
`;

  res.set({
    "content-type":
      "application/vnd.apple.mpegurl; charset=UTF-8",
    "cache-control": "no-store, no-cache, must-revalidate"
  });

  res.send(playlist);
});

/**
 * 404 handler.
 */
app.use((_req, res) => {
  res.status(404).json({
    error: "Not Found"
  });
});

app.listen(PORT, () => {
  console.log(
    `Live TV 4 All server running on port ${PORT}`
  );
});

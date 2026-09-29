import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, "..", "config", "sites.json");

async function loadConfig() {
  const raw = await fs.readFile(configPath, "utf8");
  return JSON.parse(raw);
}

app.get("/", async (_req, res) => {
  try {
    const config = await loadConfig();

    res.json({
      name: "Live TV 4 All",
      status: "online",
      sites: config.sites.filter((site) => site.enabled !== false).map((site) => ({
        name: site.name,
        type: site.type
      }))
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Failed to load configuration"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Live TV 4 All server running on port ${PORT}`);
});

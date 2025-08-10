const express = require("express");
const puppeteer = require("puppeteer");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();

// CORS setup
app.use(
  cors({
    origin: process.env.NEXTAUTH_URL || "https://your-app-name.vercel.app",
  })
);
app.use(express.json());

// Detect Chromium path dynamically (works on Render)
function getChromePath() {
  const basePath = "/opt/render/.cache/puppeteer/chrome";
  try {
    if (!fs.existsSync(basePath)) return puppeteer.executablePath();

    const versions = fs.readdirSync(basePath);
    if (versions.length === 0) return puppeteer.executablePath();

    return path.join(basePath, versions[0], "chrome-linux64", "chrome");
  } catch (err) {
    console.error("Error detecting Chrome path, falling back:", err.message);
    return puppeteer.executablePath();
  }
}

// YouTube API keys rotation
const youtubeKeys = process.env.YOUTUBE_API_KEYS
  ? process.env.YOUTUBE_API_KEYS.split(",")
  : [];
let currentKeyIndex = 0;

// /youtube endpoint
app.get("/youtube", async (req, res) => {
  const { query, limit = 1 } = req.query;

  if (!query) {
    return res.status(400).json({ error: "Query parameter is required" });
  }

  try {
    // Launch Puppeteer with detected Chromium path
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: getChromePath(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--single-process",
        "--no-zygote",
      ],
    });

    const page = await browser.newPage();
    await page.goto(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(
        query
      )}`,
      { waitUntil: "networkidle2" }
    );

    const videoId = await page.evaluate(() => {
      const video = document.querySelector("a#video-title");
      return video ? video.href.split("v=")[1]?.split("&")[0] : "";
    });

    await browser.close();

    if (videoId) {
      return res.json({ videoId, items: [{ snippet: { videoId } }] });
    }

    // Fallback: YouTube Data API
    if (youtubeKeys.length === 0) {
      throw new Error("No YouTube API keys provided");
    }

    const key = youtubeKeys[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % youtubeKeys.length;

    const response = await axios.get(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(
        query
      )}&maxResults=${limit}&key=${key}`
    );

    const items = response.data.items || [];
    res.json({ videoId: items[0]?.id.videoId || "", items });
  } catch (error) {
    console.error("Proxy Fetch Error:", error.message);
    res.status(500).json({ error: "Failed to fetch from proxy", items: [] });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "healthy" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});

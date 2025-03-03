const express = require("express");
const puppeteer = require("puppeteer");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const youtubeKeys = process.env.YOUTUBE_API_KEYS ? process.env.YOUTUBE_API_KEYS.split(",") : [];
let currentKeyIndex = 0;

app.get("/youtube", async (req, res) => {
  const { query, limit = 1 } = req.query;

  if (!query) {
    return res.status(400).json({ error: "Query parameter is required" });
  }

  try {
    // Try scraping first
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.goto(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, { waitUntil: "networkidle2" });
    const videoId = await page.evaluate(() => {
      const video = document.querySelector("a#video-title");
      return video ? video.href.split("v=")[1]?.split("&")[0] : "";
    });
    await browser.close();

    if (videoId) {
      console.log(`Scraped videoId: ${videoId} for query: ${query}`);
      return res.json({ videoId, items: [{ snippet: { videoId } }] });
    }

    // Fallback to API key rotation
    if (youtubeKeys.length === 0) {
      throw new Error("No YouTube API keys provided");
    }
    const key = youtubeKeys[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % youtubeKeys.length;

    const response = await axios.get(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(query)}&maxResults=${limit}&key=${key}`
    );
    console.log(`YouTube API Response for query ${query}:`, response.data);
    const items = response.data.items || [];
    res.json({ videoId: items[0]?.id.videoId || "", items });
  } catch (error) {
    console.error("Proxy Fetch Error:", {
      message: error.message,
      stack: error.stack,
    });
    res.status(502).json({ error: "Failed to fetch from proxy", items: [] });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
});

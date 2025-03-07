const express = require("express");
const axios = require("axios");
const cors = require("cors");

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
    const key = youtubeKeys[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % youtubeKeys.length;

    const response = await axios.get(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(query)}&maxResults=${limit}&key=${key}`
    );
    const items = response.data.items || [];
    res.json({
      videoId: items[0]?.id.videoId || "",
      items: items.map((item) => ({
        title: item.snippet.title,
        artist: item.snippet.channelTitle,
        thumbnails: { default: { url: item.snippet.thumbnails.default.url } },
        videoId: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        source: "youtube_music",
      })),
    });
  } catch (error) {
    console.error("Proxy Fetch Error:", error.message);
    res.status(502).json({ error: "Failed to fetch from proxy", items: [] });
  }
});

module.exports = app;

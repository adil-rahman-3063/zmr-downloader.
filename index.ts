import express from "express";
import ytdlp from "yt-dlp-exec";

const app = express();
const PORT = process.env.PORT || 3000;

/*
Health check
*/
app.get("/health", (req, res) => {
  res.send("ZMR Downloader running");
});

/*
Download endpoint
Example:
https://your-render-url/download?url=https://music.youtube.com/watch?v=VIDEO_ID
*/
app.get("/download", async (req, res) => {
  try {

    const url = req.query.url;

    if (!url) {
      return res.status(400).send("Missing url parameter");
    }

    console.log("Downloading:", url);

    const output = await ytdlp(url, {
      format: "bestaudio",
      getUrl: true,
      noWarnings: true
    });

    const audioUrl = String(output).split("\n")[0].trim();

    if (!audioUrl) {
      return res.status(500).send("Could not extract audio");
    }

    console.log("Audio stream:", audioUrl);

    res.json({
      stream: audioUrl
    });

  } catch (err) {

    console.error("Download error:", err);

    res.status(500).send("Download failed");

  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
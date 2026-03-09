import express from "express";
import { exec } from "child_process";
import { promisify } from "util";

const app = express();
const PORT = process.env.PORT || 3000;

const execAsync = promisify(exec);

/*
Health check
*/
app.get("/health", (req, res) => {
  res.send("ZMR Downloader running");
});

/*
Test yt-dlp availability
*/
app.get("/test", async (req, res) => {
  try {
    const { stdout } = await execAsync('yt-dlp --version');
    res.json({
      status: "yt-dlp available",
      version: stdout.trim()
    });
  } catch (err) {
    console.error("yt-dlp test failed:", err);
    res.status(500).json({
      status: "yt-dlp not available",
      error: err instanceof Error ? err.message : String(err)
    });
  }
});

/*
Download endpoint
Example:
https://your-render-url/download?url=https://music.youtube.com/watch?v=VIDEO_ID
*/
app.get("/download", async (req, res) => {
  try {

    // `req.query` is untyped and may be string | ParsedQs | string[] | ParsedQs[]
    const urlParam = req.query.url;
    const url = typeof urlParam === 'string' ? urlParam : undefined;

    if (!url) {
      return res.status(400).send("Missing url parameter");
    }

    console.log("Downloading:", url);

    // First check if yt-dlp is available
    try {
      await execAsync('yt-dlp --version');
      console.log("yt-dlp is available");
    } catch (versionErr) {
      console.error("yt-dlp version check failed:", versionErr);
      return res.status(500).send("yt-dlp not available");
    }

    try {
      const { stdout } = await execAsync(`yt-dlp "${url}" --format bestaudio --dump-json --no-warnings --no-check-certificate --no-cache-dir`);
      console.log("yt-dlp output:", stdout.substring(0, 200) + "...");

      // Parse JSON output
      const jsonOutput = JSON.parse(stdout);

      // Extract the best audio format URL
      const formats = jsonOutput.formats || [];
      const audioFormat = formats.find((f: any) => f.format_id === '251') || // webm audio
                         formats.find((f: any) => f.format_id === '140') || // m4a audio
                         formats.find((f: any) => f.acodec !== 'none' && f.vcodec === 'none');

      if (!audioFormat || !audioFormat.url) {
        console.error("No suitable audio format found");
        return res.status(500).send("No audio stream available");
      }

      const audioUrl = audioFormat.url;
      console.log("Audio stream:", audioUrl.substring(0, 100) + "...");

      res.json({
        stream: audioUrl
      });

    } catch (execErr) {
      console.error("yt-dlp execution failed:", execErr);
      return res.status(500).send("Failed to extract audio");
    }

  } catch (err) {

    console.error("Download error details:", err);

    // More specific error messages
    if (err instanceof Error) {
      if (err.message.includes('No such file or directory')) {
        return res.status(500).send("yt-dlp binary not found");
      }
      if (err.message.includes('Unable to extract')) {
        return res.status(400).send("Invalid or unsupported URL");
      }
      if (err.message.includes('Video unavailable')) {
        return res.status(404).send("Video not available");
      }
    }

    res.status(500).send("Download failed");

  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
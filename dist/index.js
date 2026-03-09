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
Test yt-dlp availability
*/
app.get("/test", async (req, res) => {
    try {
        const version = await ytdlp('--version');
        res.json({
            status: "yt-dlp available",
            version: String(version).trim()
        });
    }
    catch (err) {
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
            await ytdlp('--version');
            console.log("yt-dlp is available");
        }
        catch (versionErr) {
            console.error("yt-dlp version check failed:", versionErr);
            return res.status(500).send("yt-dlp not available");
        }
        const output = await ytdlp(url, {
            format: "bestaudio",
            dumpJson: true, // Get JSON output instead of direct URL
            noWarnings: true,
            noCheckCertificate: true, // Sometimes helps with network issues
            noCacheDir: true
        });
        console.log("yt-dlp output type:", typeof output);
        console.log("yt-dlp raw output:", output);
        // Parse JSON output
        let jsonOutput;
        try {
            jsonOutput = typeof output === 'string' ? JSON.parse(output) : output;
        }
        catch (parseErr) {
            console.error("Failed to parse yt-dlp output:", parseErr);
            return res.status(500).send("Could not parse video data");
        }
        // Extract the best audio format URL
        const formats = jsonOutput.formats || [];
        const audioFormat = formats.find((f) => f.format_id === '251') || // webm audio
            formats.find((f) => f.format_id === '140') || // m4a audio
            formats.find((f) => f.acodec !== 'none' && f.vcodec === 'none');
        if (!audioFormat || !audioFormat.url) {
            console.error("No suitable audio format found");
            return res.status(500).send("No audio stream available");
        }
        const audioUrl = audioFormat.url;
        console.log("Audio stream:", audioUrl);
        res.json({
            stream: audioUrl
        });
    }
    catch (err) {
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

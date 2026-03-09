import express from "express";
import { execFile } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const app = express();
const PORT = process.env.PORT || 3000;

// Custom wrapper for execFile since promisify doesn't work well with it
async function runYtdlp(args: string[], cookies?: string): Promise<string> {
  let cookieFile: string | undefined;
  
  try {
    // If cookies are provided, create a temporary cookie file
    if (cookies) {
      const cookieData = Buffer.from(cookies, 'base64').toString('utf-8');
      cookieFile = join(tmpdir(), `yt-dlp-cookies-${Date.now()}.txt`);
      await writeFile(cookieFile, cookieData, 'utf-8');
      args.push('--cookies', cookieFile);
      console.log(`Using cookie file: ${cookieFile}`);
    }
    
    return new Promise((resolve, reject) => {
      const ytDlpPath = process.env.NODE_ENV === 'production' ? 'yt-dlp' : 'C:\\Users\\adilr\\Documents\\projects\\zmr-download\\.venv\\Scripts\\yt-dlp.exe';
      console.log(`Running yt-dlp from: ${ytDlpPath}`);
      console.log(`yt-dlp command args: ${args.join(' ')}`);
      
      execFile(ytDlpPath, args, { maxBuffer: 10 * 1024 * 1024, timeout: 60000 }, (error, stdout, stderr) => {
        if (error) {
          console.error("==== yt-dlp EXECUTION ERROR ====");
          console.error("Error code:", error.code);
          console.error("Error message:", error.message);
          console.error("Error signal:", (error as any).signal);
          console.error("stderr output:", stderr);
          console.error("================================");
          reject(error);
        } else {
          if (stderr) {
            console.warn("yt-dlp warnings (stderr):", stderr);
          }
          resolve(stdout);
        }
      });
    });
  } finally {
    // Clean up cookie file
    if (cookieFile) {
      try {
        await unlink(cookieFile);
        console.log(`Cleaned up cookie file: ${cookieFile}`);
      } catch (cleanupError) {
        console.warn("Failed to clean up cookie file:", cleanupError);
      }
    }
  }
}

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
    const version = await runYtdlp(['--version']);
    res.json({
      status: "yt-dlp available",
      version: version.trim()
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
Optional: &cookies=BASE64_ENCODED_COOKIE_DATA
*/
app.get("/download", async (req, res) => {
  try {

    // `req.query` is untyped and may be string | ParsedQs | string[] | ParsedQs[]
    const urlParam = req.query.url;
    const url = typeof urlParam === 'string' ? urlParam : undefined;
    const cookiesParam = req.query.cookies;
    const cookies = typeof cookiesParam === 'string' ? cookiesParam : undefined;

    if (!url) {
      return res.status(400).send("Missing url parameter");
    }

    console.log("Downloading:", url);
    console.log("Cookies provided:", !!cookies);

    // Normalize YouTube Music URLs to regular YouTube URLs
    const normalizedUrl = url.replace('music.youtube.com', 'youtube.com');
    console.log("Normalized URL:", normalizedUrl);

    // First check if yt-dlp is available
    try {
      await runYtdlp(['--version']);
      console.log("yt-dlp is available");
    } catch (versionErr) {
      console.error("yt-dlp version check failed:", versionErr);
      return res.status(500).send("yt-dlp not available");
    }

    try {
      console.log("Executing yt-dlp with URL:", normalizedUrl);
      
      // Different format handling for YouTube Music vs regular YouTube
      const isYouTubeMusic = url.includes('music.youtube.com');
      console.log("Is YouTube Music:", isYouTubeMusic);
      
      const formatArg = isYouTubeMusic 
        ? 'best[ext=m4a]/best[ext=webm]/best[ext=mp4]/best'
        : 'best[ext=m4a]/best[ext=webm]/bestaudio/best';
      
      let stdout;
      try {
        // First attempt with minimal headers
        stdout = await runYtdlp([
          normalizedUrl,
          '--format', formatArg,
          '--dump-json',
          '--no-warnings',
          '--no-check-certificate',
          '--no-cache-dir',
          '--socket-timeout', '30',
          '--user-agent', 'Mozilla/5.0 (compatible; yt-dlp/2024.01.01; +https://github.com/yt-dlp/yt-dlp)',
          '--extractor-args', 'youtube:player_client=web',
          '--no-color'
        ], cookies);
      } catch (firstAttemptError) {
        console.log("First attempt failed, trying fallback approach...");
        
        // Fallback attempt with simpler headers
        stdout = await runYtdlp([
          normalizedUrl,
          '--format', 'best',
          '--dump-json',
          '--no-warnings',
          '--no-check-certificate',
          '--no-cache-dir',
          '--socket-timeout', '30',
          '--user-agent', 'Mozilla/5.0 (compatible; yt-dlp/2024.01.01; +https://github.com/yt-dlp/yt-dlp)',
          '--sleep-interval', '1',
          '--max-sleep-interval', '3',
          '--extractor-args', 'youtube:player_client=ios',
          '--no-color'
        ], cookies);
      }
      
      console.log("✓ yt-dlp stdout received, length:", stdout.length);
      
      // Parse JSON output
      let jsonOutput;
      try {
        jsonOutput = JSON.parse(stdout);
        console.log("✓ JSON parsed successfully");
      } catch (parseErr) {
        console.error("✗ JSON PARSE ERROR:");
        console.error("Failed to parse JSON. First 1000 chars:", stdout.substring(0, 1000));
        return res.status(500).send("Failed to parse video data");
      }
      
      console.log("✓ Video title:", jsonOutput.title);
      console.log("✓ Available formats:", jsonOutput.formats?.length || 0);

      // Extract the best audio format URL
      const formats = jsonOutput.formats || [];
      if (formats.length === 0) {
        console.error("✗ NO FORMATS ERROR: No formats available in response");
        return res.status(500).send("No formats available for this video");
      }
      
      // For YouTube Music or general audio, look for audio-only formats first
      const audioOnlyFormat = formats.find((f: any) => 
        f.acodec !== 'none' && f.acodec !== undefined && 
        (f.vcodec === 'none' || f.vcodec === undefined)
      );
      
      // Fallback to any format with audio
      const audioFormat = audioOnlyFormat || 
                         formats.find((f: any) => f.format_id === '251') || // webm audio
                         formats.find((f: any) => f.format_id === '140') || // m4a audio
                         formats.find((f: any) => f.acodec !== 'none' && !f.vcodec?.includes('vp'));

      if (!audioFormat) {
        console.error("✗ NO AUDIO FORMAT ERROR");
        console.error("Available formats sample:", formats.slice(0, 10).map((f: any) => ({ 
          id: f.format_id, 
          acodec: f.acodec, 
          vcodec: f.vcodec,
          ext: f.ext 
        })));
        return res.status(500).send("No audio stream available");
      }

      if (!audioFormat.url) {
        console.error("✗ NO URL ERROR: Audio format found but no URL:", audioFormat);
        return res.status(500).send("Audio format has no URL");
      }

      const audioUrl = audioFormat.url;
      console.log("✓ Found audio URL");

      res.json({
        stream: audioUrl
      });

    } catch (execErr) {
      console.error("==== yt-dlp EXECUTION ERROR IN DOWNLOAD ====");
      console.error("Error type:", execErr instanceof Error ? execErr.constructor.name : typeof execErr);
      console.error("Error details:", execErr);
      if (execErr instanceof Error) {
        console.error("Error message:", execErr.message);
        console.error("Error stack:", execErr.stack);
      }
      console.error("==========================================");
      
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
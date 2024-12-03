const express = require("express");
const WebTorrent = require("webtorrent");
const cors = require("cors");
const app = require("supertest");
const app = express();
const client = new WebTorrent();

app.use(cors());
app.use(express.json());

// Route for streaming torrent
app.get("/stream", (req, res) => {
  const magnet = req.query.magnet; // Magnet link
  if (!magnet) return res.status(400).send("Magnet link required.");

  client.add(magnet, (torrent) => {
    const file = torrent.files.find((file) => file.name.endsWith(".mp4")); // Example: MP4 file

    if (file) {
      res.writeHead(200, {
        "Content-Type": "video/mp4",
        "Content-Length": file.length,
      });

      const stream = file.createReadStream();
      stream.pipe(res);
    } else {
      res.status(404).send("Video file not found.");
    }
  });

  // Clean up torrents after streaming
  client.on("torrent", (torrent) => {
    torrent.on("done", () => client.remove(torrent));
  });
});

// Route for direct download
app.get("/download", (req, res) => {
  const magnet = req.query.magnet; // Magnet link
  if (!magnet) return res.status(400).send("Magnet link required.");

  client.add(magnet, (torrent) => {
    const file = torrent.files.find((file) => file.name.endsWith(".mp4")); // Example: MP4 file

    if (file) {
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${file.name}"`,
      );
      const stream = file.createReadStream();
      stream.pipe(res);
    } else {
      res.status(404).send("Video file not found.");
    }
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

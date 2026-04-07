# yoto-myo-uploader

Three tools for getting audiobooks onto [Yoto](https://yotoplay.com) MYO cards:

| Tool | What it does |
|------|-------------|
| `yoto-convert` | Converts raw audiobook files (mp3/m4a/m4b) into organized, Yoto-ready MP3s with cover art |
| `yoto-serve` | Browse and download your converted library from a local web UI |
| `yoto-upload` | Upload converted books to your Yoto account as MYO cards |

## Requirements

- [Node.js](https://nodejs.org) 18 or newer
- [ffmpeg](https://ffmpeg.org) (for `yoto-convert` only)
- A Yoto account (for `yoto-upload`)
- Audiobooks as MP3, M4A, M4B, or other common formats

## Setup

```bash
git clone https://github.com/brtcruiser1234/yoto-myo-uploader.git
cd yoto-myo-uploader
npm install
```

---

## Step 1 — Convert: `yoto-convert`

Converts a folder of audiobooks into organized MP3s with cover art. Skips books already converted.

```bash
node bin/yoto-convert.js /path/to/source /path/to/output
```

**Source structure** — one subfolder per book, any mix of audio formats:

```
/source/
  The Hobbit/
    01 - An Unexpected Party.m4a
    02 - Roast Mutton.m4a
    cover.jpg
  Charlotte's Web/
    01 Charlotte's Web.mp3
    folder.jpeg
```

**Output structure** — organized, renamed, all MP3:

```
/output/
  The Hobbit/
    01 - An Unexpected Party.mp3
    02 - Roast Mutton.mp3
    cover.jpg
  Charlotte's Web/
    01 - Charlotte's Web.mp3
    cover.jpeg
```

Install ffmpeg if you don't have it:
```bash
# Mac
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows
# Download from https://ffmpeg.org/download.html
```

---

## Step 2 — Browse: `yoto-serve`

Start a local web server to browse your library and download books as ZIPs:

```bash
node bin/yoto-serve.js /path/to/output
```

Options:

```bash
node bin/yoto-serve.js /path/to/output --port 3000 --password secret
```

Open `http://localhost:3000` — you'll see a grid of all your books with cover art and a download button for each.

---

## Step 3 — Upload: `yoto-upload`

Upload all books to your Yoto account as MYO cards:

```bash
node bin/yoto-upload.js /path/to/output
```

The first time you run it, you'll see a link — open it and log in to your Yoto account. Credentials are saved to `~/.yoto-myo-uploader/tokens.json` so you only log in once.

**Re-running is safe.** Already-uploaded books are skipped. Progress is saved to `~/.yoto-myo-uploader/progress.json`.

### How the upload works

For each track, the script:
1. Gets a presigned S3 URL from Yoto's API
2. Uploads the MP3 with `Content-Type: audio/mpeg` (required to trigger transcoding)
3. Polls Yoto's API until transcoding finishes (~10–30 seconds per track)
4. Creates the MYO card using the transcoded file hash

### Timing

Each track takes ~10–30 seconds on Yoto's servers. A 10-track book takes roughly 2–5 minutes. Leave it running in the background for large libraries.

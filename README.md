# yoto-myo-uploader

Two tools for loading audiobooks onto [Yoto](https://yotoplay.com) MYO cards:

- **`yoto-serve`** — browse and download your library from a local web UI
- **`yoto-upload`** — upload a folder of audiobooks to your Yoto account as MYO cards

## Requirements

- [Node.js](https://nodejs.org) 18 or newer
- A Yoto account
- Audiobooks as MP3 files

## Setup

```bash
git clone https://github.com/YOUR_USERNAME/yoto-myo-uploader.git
cd yoto-myo-uploader
npm install
```

## Folder structure

One subfolder per book, MP3 files inside:

```
/my-audiobooks/
  The Hobbit/
    01 - An Unexpected Party.mp3
    02 - Roast Mutton.mp3
  Charlotte's Web/
    01 - Chapter One.mp3
    02 - Chapter Two.mp3
```

Each subfolder becomes one Yoto MYO card. The folder name becomes the card title.

---

## yoto-serve — browse & download

Start a local web server to browse your library and download books as ZIPs:

```bash
node bin/yoto-serve.js /path/to/audiobooks
```

Options:

```bash
node bin/yoto-serve.js /path/to/audiobooks --port 3000 --password secret
```

Open `http://localhost:3000` in your browser. You'll see a grid of all your books with cover art and a download button for each.

---

## yoto-upload — upload to Yoto

Upload all books to your Yoto account as MYO cards:

```bash
node bin/yoto-upload.js /path/to/audiobooks
```

The first time you run it, you'll see a link — open it and log in to your Yoto account. After that, your credentials are saved at `~/.yoto-myo-uploader/tokens.json`.

**Re-running is safe.** Already-uploaded books are skipped. Progress is saved to `~/.yoto-myo-uploader/progress.json`.

### How it works

For each track, the script:
1. Gets a presigned S3 upload URL from Yoto
2. Uploads the MP3 with `Content-Type: audio/mpeg` to trigger Yoto's transcoding pipeline
3. Polls until transcoding finishes (~10–30 seconds per track)
4. Creates the MYO card with all tracks

### Timing

Each track takes ~10–30 seconds to transcode on Yoto's servers. A 10-track book takes roughly 2–5 minutes. With 55 books it'll run for a couple hours — leave it going in the background.

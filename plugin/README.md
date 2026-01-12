# Obsidian YouTube Scraper Plugin

Obsidian plugin for downloading YouTube video transcripts. Requires a running backend (Docker).

**Note:** This plugin only detects and scrapes **YouTube links**. Other URLs are ignored.

## Features

- 📺 Automatic YouTube link detection in notes
- 📝 Download transcripts (auto-generated and manual)
- 🌐 Multi-language support (download all available languages)
- 🔗 Automatic backlinks to transcript files
- 📁 Scan single note, folder, or entire vault
- ⏸️ Pause/resume scraping
- ⏱️ Optional timestamps in transcripts

## Requirements

- Backend Docker container running on LAN
- Obsidian 1.0.0+

## Installation

### 1. Backend (Docker)

On a machine with Docker:

```bash
cd backend
docker-compose up -d
```

Verify it works:
```bash
curl http://localhost:8765/health
```

### 2. Plugin

Copy these files to `.obsidian/plugins/youtube-scraper/`:
- `main.js`
- `manifest.json`
- `styles.css`

Or build from source:
```bash
npm install
npm run build
```

3. Enable plugin in Obsidian → Settings → Community Plugins
4. Configure **Backend URL** (e.g. `http://192.168.1.100:8765`)

## Usage

### Menu (YouTube icon in left panel)
- **Scrape current note** - scrape links from current note
- **Scrape folder...** - select folder to scan
- **Scrape all YouTube links in vault** - scan entire vault
- **Test backend connection** - verify backend connectivity

### Context Menu (right-click)
- On `.md` file: "Scrape YouTube links from this note"
- On folder: "Scrape YouTube links from this folder"
- In editor on line with link: "Scrape YouTube: ..."

### Commands (Ctrl/Cmd + P)
- `YouTube Scraper: Scrape YouTube links from current note`
- `YouTube Scraper: Scrape all YouTube links from vault`
- `YouTube Scraper: Scrape YouTube link under cursor`
- `YouTube Scraper: Test backend connection`

## Settings

### Backend connection
- **Backend URL** - backend address (e.g. `http://192.168.1.100:8765`)

### Folder scope
- **Output folder** - where to save transcripts (default: `youtube-transcripts`)
- **Include folders** - only scan these folders
- **Exclude folders** - skip these folders

### Backlinks
- **Add backlinks** - add links to transcripts in original notes
- **Backlink text** - text/emoji for link (default: `📺`)

### Transcript options
- **Preferred languages** - preferred transcript languages (e.g. `pl, en, auto`)
- **Include timestamps** - add timestamps before segments
- **Include segments** - save as separate segments (instead of continuous text)
- **Fetch all available languages** - download transcripts in all available languages

### General
- **Skip already scraped** - skip videos already saved

## Output File Format

```markdown
---
video_id: "VIDEO_ID"
url: "https://www.youtube.com/watch?v=VIDEO_ID"
title: "Video Title"
author: "Channel Name"
transcript_languages: "en, pl"
scraped_at: "2024-01-15T12:00:00.000Z"
source_notes: ["[[Source Note]]"]
---

# Video Title

> **Video:** [link](url)
> **Channel:** Channel Name
> **Languages:** en, pl
> **Linked from:** [[Source Note]]

![Thumbnail](url)

## Transcript - English (auto-generated)

Full English transcript...

## Transcript - Polish

Full Polish transcript...
```

## Troubleshooting

### "Cannot connect to backend"
1. Verify Docker is running
2. Check backend machine IP address
3. Ensure port 8765 is accessible

### "No transcript available"
- Some videos don't have transcripts
- Try changing preferred languages

### "Invalid YouTube URL"
- Ensure link is valid
- Supported formats: youtube.com/watch?v=, youtu.be/, youtube.com/shorts/

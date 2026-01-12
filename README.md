# Obsidian YouTube Scraper

A complete solution for downloading YouTube video transcripts into Obsidian notes.

**Note:** This plugin only scrapes **YouTube links** (youtube.com, youtu.be). Other links are ignored.

## 📁 Project Structure

```
obsidian-youtube-scraper/
├── backend/          # FastAPI backend (Docker)
│   ├── main.py
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── requirements.txt
│
└── plugin/           # Obsidian plugin
    ├── main.ts       # Source code
    ├── main.js       # Built plugin
    ├── manifest.json
    └── styles.css
```

## 🚀 Quick Start

### 1. Backend (Docker)

```bash
cd backend
docker-compose up -d
```

Verify: `curl http://localhost:8765/health`

### 2. Obsidian Plugin

```bash
# Copy to plugins folder
cp -r plugin ~/.obsidian/plugins/youtube-scraper

# Or build from source:
cd plugin
npm install
npm run build
```

3. Enable plugin in Obsidian
4. Set **Backend URL** in plugin settings (e.g. `http://192.168.1.100:8765`)

## ✨ Features

- 📺 Automatic YouTube link detection
- 📝 Transcript download (auto-generated and manual)
- 🌐 Multi-language support (downloads all available languages)
- 🔗 Automatic backlinks to transcripts
- 📁 Scan single note / folder / entire vault
- ⏸️ Pause and resume scraping
- ⏱️ Optional timestamps in transcripts

## 📖 Documentation

- [Backend README](backend/README.md)
- [Plugin README](plugin/README.md)

## 🔧 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/transcript` | POST | Get transcript |
| `/batch` | POST | Get multiple transcripts |

### Example API Usage

```bash
curl -X POST http://localhost:8765/transcript \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=VIDEO_ID", "fetch_all_languages": true}'
```

## 📋 Requirements

- **Backend**: Docker or Python 3.10+
- **Plugin**: Obsidian 1.0.0+

## 📄 License

MIT

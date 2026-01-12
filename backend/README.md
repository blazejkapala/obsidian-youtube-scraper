# YouTube Transcript Scraper Backend

Backend API for Obsidian YouTube Scraper Plugin. Fetches transcripts and metadata from YouTube videos.

## Features

- ✅ Fetch transcripts (auto-generated and manual)
- ✅ Fetch metadata (title, author, thumbnail)
- ✅ Multi-language support (fetch all available languages)
- ✅ Batch API for multiple videos
- ✅ CORS enabled for Obsidian access
- ✅ Docker ready

## Quick Start

### Docker (recommended)

```bash
# Build and run
docker-compose up -d

# Check status
docker-compose logs -f

# Stop
docker-compose down
```

### Local Development

```bash
# Create venv
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or: venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Run
python main.py
# or
uvicorn main:app --host 0.0.0.0 --port 8765 --reload
```

## API Endpoints

### Health Check
```
GET /
GET /health
```

### Get Transcript
```
POST /transcript
Content-Type: application/json

{
    "url": "https://www.youtube.com/watch?v=VIDEO_ID",
    "languages": ["pl", "en", "auto"],
    "fetch_all_languages": true
}
```

**Response:**
```json
{
    "success": true,
    "url": "https://www.youtube.com/watch?v=VIDEO_ID",
    "video_id": "VIDEO_ID",
    "metadata": {
        "video_id": "VIDEO_ID",
        "title": "Video Title",
        "author": "Channel Name",
        "thumbnail_url": "https://img.youtube.com/vi/VIDEO_ID/maxresdefault.jpg"
    },
    "transcript_text": "Full transcript text...",
    "transcript_language": "en",
    "all_transcripts": [
        {
            "language": "en",
            "language_name": "English",
            "is_generated": true,
            "text": "Full text...",
            "segments": [...]
        },
        {
            "language": "pl",
            "language_name": "Polish",
            "is_generated": false,
            "text": "Pełny tekst...",
            "segments": [...]
        }
    ],
    "available_languages": ["en", "pl", "de"]
}
```

### Batch (multiple videos)
```
POST /batch
Content-Type: application/json

["url1", "url2", "url3"]
```

## Obsidian Configuration

In plugin settings, set:
- **Backend URL**: `http://SERVER_IP:8765`

Where `SERVER_IP` is the IP address of the machine running Docker (e.g. `192.168.1.100`).

## Testing

```bash
# Test health
curl http://localhost:8765/health

# Test transcript
curl -X POST http://localhost:8765/transcript \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

## Swagger UI

After starting, API documentation is available at:
- http://localhost:8765/docs
- http://localhost:8765/redoc

## Requirements

- Python 3.10+
- Docker (optional but recommended)

## Limitations

- YouTube may rate-limit requests
- Some videos don't have transcripts
- Private/region-locked videos may not work

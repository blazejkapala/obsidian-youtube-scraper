# YouTube Transcript Scraper Backend

Backend API dla Obsidian YouTube Scraper Plugin. Pobiera transkrypcje i metadane z filmów YouTube.

## Funkcje

- ✅ Pobieranie transkrypcji (automatycznych i ręcznych)
- ✅ Pobieranie metadanych (tytuł, autor, thumbnail)
- ✅ Obsługa wielu języków
- ✅ Batch API dla wielu filmów
- ✅ CORS dla dostępu z Obsidiana
- ✅ Docker ready

## Szybki start

### Docker (zalecane)

```bash
# Build i uruchom
docker-compose up -d

# Sprawdź status
docker-compose logs -f

# Zatrzymaj
docker-compose down
```

### Lokalne uruchomienie

```bash
# Utwórz venv
python -m venv venv
source venv/bin/activate  # Linux/Mac
# lub: venv\Scripts\activate  # Windows

# Zainstaluj zależności
pip install -r requirements.txt

# Uruchom
python main.py
# lub
uvicorn main:app --host 0.0.0.0 --port 8765 --reload
```

## API Endpoints

### Health Check
```
GET /
GET /health
```

### Pobierz transkrypcję
```
POST /transcript
Content-Type: application/json

{
    "url": "https://www.youtube.com/watch?v=VIDEO_ID",
    "languages": ["pl", "en", "auto"]  // opcjonalne
}
```

**Odpowiedź:**
```json
{
    "success": true,
    "url": "https://www.youtube.com/watch?v=VIDEO_ID",
    "video_id": "VIDEO_ID",
    "metadata": {
        "video_id": "VIDEO_ID",
        "title": "Tytuł filmu",
        "author": "Nazwa kanału",
        "description": "",
        "thumbnail_url": "https://img.youtube.com/vi/VIDEO_ID/maxresdefault.jpg"
    },
    "transcript_text": "Pełny tekst transkrypcji...",
    "transcript_segments": [
        {"text": "Segment 1", "start": 0.0, "duration": 2.5},
        {"text": "Segment 2", "start": 2.5, "duration": 3.0}
    ],
    "transcript_language": "en",
    "available_languages": ["en", "pl", "de"]
}
```

### Batch (wiele filmów)
```
POST /batch
Content-Type: application/json

["url1", "url2", "url3"]
```

## Konfiguracja w Obsidian

W ustawieniach pluginu ustaw:
- **Backend URL**: `http://ADRES_IP_SERWERA:8765`

Gdzie `ADRES_IP_SERWERA` to adres maszyny z Dockerem w sieci LAN (np. `192.168.1.100`).

## Testowanie

```bash
# Test health
curl http://localhost:8765/health

# Test transkrypcji
curl -X POST http://localhost:8765/transcript \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

## Swagger UI

Po uruchomieniu dostępna jest dokumentacja Swagger:
- http://localhost:8765/docs
- http://localhost:8765/redoc

## Wymagania

- Python 3.10+
- Docker (opcjonalne, ale zalecane)

## Limity

- YouTube może ograniczać liczbę requestów
- Niektóre filmy nie mają transkrypcji
- Filmy prywatne/region-locked mogą nie działać

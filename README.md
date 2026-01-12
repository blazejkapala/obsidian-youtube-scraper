# Obsidian YouTube Scraper

Kompletne rozwiązanie do pobierania transkrypcji z filmów YouTube do Obsidian.

## 📁 Struktura projektu

```
obsidian-youtube-scraper/
├── backend/          # FastAPI backend (Docker)
│   ├── main.py
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── requirements.txt
│
└── plugin/           # Obsidian plugin
    ├── main.ts       # Źródło
    ├── main.js       # Zbudowany plugin
    ├── manifest.json
    └── styles.css
```

## 🚀 Szybki start

### 1. Backend (Docker)

```bash
cd backend
docker-compose up -d
```

Sprawdź: `curl http://localhost:8765/health`

### 2. Plugin Obsidian

```bash
# Skopiuj do folderu pluginów
cp -r plugin ~/.obsidian/plugins/youtube-scraper

# Lub jeśli chcesz zbudować ze źródeł:
cd plugin
npm install
npm run build
```

3. Włącz plugin w Obsidian
4. Ustaw **Backend URL** w ustawieniach pluginu (np. `http://192.168.1.100:8765`)

## ✨ Funkcje

- 📺 Automatyczne wykrywanie linków YouTube
- 📝 Pobieranie transkrypcji (auto-generated i ręcznych)
- 🌐 Obsługa wielu języków
- 🔗 Automatyczne backlinki do transkrypcji
- 📁 Skanowanie notatki / folderu / całego vault
- ⏸️ Pauza i wznowienie scrapowania
- ⏱️ Opcjonalne timestampy w transkrypcji

## 📖 Dokumentacja

- [Backend README](backend/README.md)
- [Plugin README](plugin/README.md)

## 🔧 API Endpoints

| Endpoint | Metoda | Opis |
|----------|--------|------|
| `/health` | GET | Health check |
| `/transcript` | POST | Pobierz transkrypcję |
| `/batch` | POST | Pobierz wiele transkrypcji |

### Przykład użycia API

```bash
curl -X POST http://localhost:8765/transcript \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=VIDEO_ID"}'
```

## 📋 Wymagania

- **Backend**: Docker lub Python 3.10+
- **Plugin**: Obsidian 1.0.0+

## 📄 Licencja

MIT

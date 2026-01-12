# Obsidian YouTube Scraper Plugin

Plugin do Obsidian pobierający transkrypcje z filmów YouTube. Wymaga uruchomionego backendu (Docker).

## Funkcje

- 📺 Automatyczne wykrywanie linków YouTube w notatkach
- 📝 Pobieranie transkrypcji (auto-generated i ręcznych)
- 🔗 Automatyczne backlinki do transkrypcji
- 📁 Skanowanie pojedynczej notatki, folderu lub całego vault
- ⏸️ Pauza/wznowienie scrapowania
- 🌐 Obsługa wielu języków transkrypcji

## Wymagania

- Backend Docker uruchomiony w sieci LAN
- Obsidian 1.0.0+

## Instalacja

### 1. Backend (Docker)

Na maszynie z Dockerem:

```bash
cd youtube-scraper-backend
docker-compose up -d
```

Sprawdź czy działa:
```bash
curl http://localhost:8765/health
```

### 2. Plugin Obsidian

1. Skopiuj folder `obsidian-youtube-scraper-plugin` do `.obsidian/plugins/youtube-scraper/`
2. Zainstaluj zależności i zbuduj:
   ```bash
   cd .obsidian/plugins/youtube-scraper
   npm install
   npm run build
   ```
3. Włącz plugin w ustawieniach Obsidian
4. Skonfiguruj URL backendu (np. `http://192.168.1.100:8765`)

## Użycie

### Menu (ikona YouTube w lewym panelu)
- **Scrape current note** - scrapuj linki z aktualnej notatki
- **Scrape folder...** - wybierz folder do skanowania
- **Scrape all YouTube links in vault** - skanuj cały vault
- **Test backend connection** - sprawdź połączenie z backendem

### Menu kontekstowe (prawy klik)
- Na pliku `.md`: "Scrape YouTube links from this note"
- Na folderze: "Scrape YouTube links from this folder"
- W edytorze na linii z linkiem: "Scrape YouTube: ..."

### Komendy (Ctrl/Cmd + P)
- `YouTube Scraper: Scrape YouTube links from current note`
- `YouTube Scraper: Scrape all YouTube links from vault`
- `YouTube Scraper: Scrape YouTube link under cursor`
- `YouTube Scraper: Test backend connection`

## Ustawienia

### Backend connection
- **Backend URL** - adres backendu (np. `http://192.168.1.100:8765`)

### Folder scope
- **Output folder** - gdzie zapisywać transkrypcje (domyślnie: `youtube-transcripts`)
- **Include folders** - skanuj tylko te foldery
- **Exclude folders** - pomiń te foldery

### Backlinks
- **Add backlinks** - dodawaj linki do transkrypcji w oryginalnych notatkach
- **Backlink text** - tekst/emoji linku (domyślnie: `📺`)

### Transcript options
- **Preferred languages** - preferowane języki transkrypcji (np. `pl, en, auto`)
- **Include timestamps** - dodaj timestampy przed segmentami
- **Include segments** - zapisz jako osobne segmenty (zamiast ciągłego tekstu)

### General
- **Skip already scraped** - pomiń filmy już zapisane

## Format zapisanego pliku

```markdown
---
video_id: "VIDEO_ID"
url: "https://www.youtube.com/watch?v=VIDEO_ID"
title: "Tytuł filmu"
author: "Nazwa kanału"
transcript_language: "en"
scraped_at: "2024-01-15T12:00:00.000Z"
source_notes: ["[[Notatka źródłowa]]"]
---

# Tytuł filmu

> **Video:** [link](url)
> **Channel:** Nazwa kanału
> **Language:** en
> **Linked from:** [[Notatka źródłowa]]

![Thumbnail](url)

## Transcript

Pełna transkrypcja filmu...
```

## Rozwiązywanie problemów

### "Cannot connect to backend"
1. Sprawdź czy Docker jest uruchomiony
2. Sprawdź adres IP maszyny z backendem
3. Upewnij się że port 8765 jest dostępny

### "No transcript available"
- Niektóre filmy nie mają transkrypcji
- Spróbuj zmienić preferowane języki

### "Invalid YouTube URL"
- Upewnij się że link jest prawidłowy
- Obsługiwane formaty: youtube.com/watch?v=, youtu.be/, youtube.com/shorts/

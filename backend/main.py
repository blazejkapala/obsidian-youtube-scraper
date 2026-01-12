"""
YouTube Transcript Scraper Backend
FastAPI server for fetching YouTube video transcripts and metadata.
Designed to work with Obsidian YouTube Scraper Plugin.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import re
import requests
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import (
    TranscriptsDisabled,
    NoTranscriptFound,
    VideoUnavailable,
)

app = FastAPI(
    title="YouTube Transcript Scraper",
    description="API for fetching YouTube video transcripts for Obsidian",
    version="0.1.0"
)

# CORS - allow all origins for local network access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TranscriptRequest(BaseModel):
    url: str
    languages: Optional[list[str]] = ["pl", "en", "de", "es", "fr", "auto"]
    fetch_all_languages: Optional[bool] = True  # Pobierz wszystkie dostępne języki


class TranscriptSegment(BaseModel):
    text: str
    start: float
    duration: float


class SingleTranscript(BaseModel):
    """Single language transcript."""
    language: str
    language_name: Optional[str] = None
    is_generated: bool = False
    text: str
    segments: list[TranscriptSegment]


class VideoMetadata(BaseModel):
    video_id: str
    title: str
    author: str
    description: str
    thumbnail_url: str
    duration_seconds: Optional[int] = None
    view_count: Optional[int] = None
    publish_date: Optional[str] = None


class TranscriptResponse(BaseModel):
    success: bool
    url: str
    video_id: str
    metadata: Optional[VideoMetadata] = None
    # Główna transkrypcja (pierwsza z preferowanych)
    transcript_text: Optional[str] = None
    transcript_segments: Optional[list[TranscriptSegment]] = None
    transcript_language: Optional[str] = None
    # Wszystkie pobrane transkrypcje
    all_transcripts: Optional[list[SingleTranscript]] = None
    available_languages: Optional[list[str]] = None
    error: Optional[str] = None


def extract_video_id(url: str) -> str:
    """Extract YouTube video ID from various URL formats."""
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})',
        r'(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    
    # If URL is just the video ID
    if re.match(r'^[a-zA-Z0-9_-]{11}$', url):
        return url
    
    raise ValueError(f"Could not extract video ID from URL: {url}")


def get_video_metadata(video_id: str) -> VideoMetadata:
    """Fetch video metadata using oembed API (no API key required)."""
    try:
        # Use oembed API for basic metadata
        oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        response = requests.get(oembed_url, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        return VideoMetadata(
            video_id=video_id,
            title=data.get("title", "Unknown Title"),
            author=data.get("author_name", "Unknown Author"),
            description="",  # oembed doesn't provide description
            thumbnail_url=data.get("thumbnail_url", f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"),
        )
    except Exception as e:
        # Fallback metadata
        return VideoMetadata(
            video_id=video_id,
            title="Unknown Title",
            author="Unknown Author", 
            description="",
            thumbnail_url=f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
        )


def fetch_transcript(video_id: str, languages: list[str], fetch_all: bool = True) -> tuple[str, list[TranscriptSegment], str, list[str], list[SingleTranscript]]:
    """
    Fetch transcript for a YouTube video.
    Returns: (full_text, segments, language_code, available_languages, all_transcripts)
    """
    ytt_api = YouTubeTranscriptApi()
    
    # Get available transcripts info
    available_languages = []
    transcript_info = {}  # lang_code -> (language_name, is_generated)
    try:
        transcript_list = ytt_api.list(video_id)
        for t in transcript_list:
            available_languages.append(t.language_code)
            transcript_info[t.language_code] = (t.language, t.is_generated)
    except Exception:
        pass
    
    # Determine which languages to fetch
    languages_to_fetch = []
    
    if fetch_all:
        # Fetch all preferred languages that are available
        for lang in languages:
            if lang == "auto":
                continue
            if lang in available_languages:
                languages_to_fetch.append(lang)
        
        # Also add any available language not in preferred list
        for lang in available_languages:
            if lang not in languages_to_fetch:
                languages_to_fetch.append(lang)
    else:
        # Just fetch first available preferred language
        for lang in languages:
            if lang == "auto":
                continue
            if lang in available_languages:
                languages_to_fetch.append(lang)
                break
    
    # Fetch all transcripts
    all_transcripts: list[SingleTranscript] = []
    primary_transcript = None
    primary_language = None
    
    for lang in languages_to_fetch:
        try:
            transcript = ytt_api.fetch(video_id, languages=[lang])
            
            segments = [
                TranscriptSegment(
                    text=entry.text,
                    start=entry.start,
                    duration=entry.duration
                )
                for entry in transcript
            ]
            
            full_text = " ".join([entry.text for entry in transcript])
            lang_name, is_generated = transcript_info.get(lang, (lang, False))
            
            single = SingleTranscript(
                language=lang,
                language_name=lang_name,
                is_generated=is_generated,
                text=full_text,
                segments=segments
            )
            all_transcripts.append(single)
            
            # First successful is primary
            if primary_transcript is None:
                primary_transcript = (full_text, segments)
                primary_language = lang
                
        except (NoTranscriptFound, TranscriptsDisabled):
            continue
    
    # If nothing found, try auto-generated fallback
    if not all_transcripts:
        try:
            transcript = ytt_api.fetch(video_id)
            segments = [
                TranscriptSegment(
                    text=entry.text,
                    start=entry.start,
                    duration=entry.duration
                )
                for entry in transcript
            ]
            full_text = " ".join([entry.text for entry in transcript])
            
            single = SingleTranscript(
                language="auto",
                language_name="Auto-generated",
                is_generated=True,
                text=full_text,
                segments=segments
            )
            all_transcripts.append(single)
            primary_transcript = (full_text, segments)
            primary_language = "auto"
        except Exception as e:
            raise e
    
    if primary_transcript is None:
        raise NoTranscriptFound(video_id, languages, None)
    
    return primary_transcript[0], primary_transcript[1], primary_language, available_languages, all_transcripts


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "YouTube Transcript Scraper",
        "version": "1.0.0"
    }


@app.get("/health")
async def health():
    """Health check for Docker/monitoring."""
    return {"status": "healthy"}


@app.post("/transcript", response_model=TranscriptResponse)
async def get_transcript(request: TranscriptRequest):
    """
    Fetch transcript and metadata for a YouTube video.
    
    - **url**: YouTube video URL or video ID
    - **languages**: Preferred languages for transcript (default: ["pl", "en", "de", "es", "fr", "auto"])
    - **fetch_all_languages**: If True, fetch all available languages (default: True)
    """
    try:
        # Extract video ID
        video_id = extract_video_id(request.url)
        
        # Get metadata
        metadata = get_video_metadata(video_id)
        
        # Get transcript(s)
        try:
            full_text, segments, language, available_langs, all_transcripts = fetch_transcript(
                video_id, 
                request.languages,
                request.fetch_all_languages
            )
            
            return TranscriptResponse(
                success=True,
                url=request.url,
                video_id=video_id,
                metadata=metadata,
                transcript_text=full_text,
                transcript_segments=segments,
                transcript_language=language,
                all_transcripts=all_transcripts,
                available_languages=available_langs,
            )
            
        except TranscriptsDisabled:
            return TranscriptResponse(
                success=False,
                url=request.url,
                video_id=video_id,
                metadata=metadata,
                error="Transcripts are disabled for this video",
                available_languages=[],
            )
            
        except NoTranscriptFound:
            return TranscriptResponse(
                success=False,
                url=request.url,
                video_id=video_id,
                metadata=metadata,
                error="No transcript found for this video",
                available_languages=[],
            )
            
        except VideoUnavailable:
            return TranscriptResponse(
                success=False,
                url=request.url,
                video_id=video_id,
                error="Video is unavailable",
            )
            
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@app.post("/batch")
async def get_batch_transcripts(urls: list[str], languages: Optional[list[str]] = None):
    """
    Fetch transcripts for multiple YouTube videos.
    Returns list of TranscriptResponse objects.
    """
    if languages is None:
        languages = ["en", "pl", "de", "es", "fr", "auto"]
    
    results = []
    for url in urls:
        try:
            request = TranscriptRequest(url=url, languages=languages)
            result = await get_transcript(request)
            results.append(result)
        except HTTPException as e:
            results.append(TranscriptResponse(
                success=False,
                url=url,
                video_id="",
                error=e.detail,
            ))
    
    return results


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)

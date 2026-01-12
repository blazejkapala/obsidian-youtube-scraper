import {
	App,
	Plugin,
	PluginSettingTab,
	Setting,
	Notice,
	TFile,
	TFolder,
	requestUrl,
	Modal,
	Menu,
	AbstractInputSuggest,
	TAbstractFile,
} from "obsidian";

// ============== Folder Suggester ==============
class FolderSuggest extends AbstractInputSuggest<TFolder> {
	private inputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.inputEl = inputEl;
	}

	getSuggestions(inputStr: string): TFolder[] {
		const folders: TFolder[] = [];
		const lowerInput = inputStr.toLowerCase();
		
		const currentValue = this.inputEl.value;
		const lastComma = currentValue.lastIndexOf(",");
		const searchTerm = lastComma >= 0 
			? currentValue.substring(lastComma + 1).trim().toLowerCase()
			: lowerInput;

		const walkFolders = (folder: TAbstractFile) => {
			if (folder instanceof TFolder) {
				if (folder.path.toLowerCase().includes(searchTerm) || searchTerm === "") {
					folders.push(folder);
				}
				for (const child of folder.children) {
					walkFolders(child);
				}
			}
		};

		walkFolders(this.app.vault.getRoot());
		return folders.slice(0, 20);
	}

	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.createEl("div", { text: folder.path || "/" });
	}

	selectSuggestion(folder: TFolder): void {
		const currentValue = this.inputEl.value;
		const lastComma = currentValue.lastIndexOf(",");
		
		if (lastComma >= 0) {
			const prefix = currentValue.substring(0, lastComma + 1);
			this.inputEl.value = `${prefix} ${folder.path}`;
		} else {
			this.inputEl.value = folder.path;
		}
		
		this.inputEl.trigger("input");
		this.close();
	}
}

// ============== Settings ==============
interface YouTubeScraperSettings {
	backendUrl: string;
	outputFolder: string;
	addBacklinks: boolean;
	backlinkText: string;
	skipAlreadyScraped: boolean;
	includeFolders: string;
	excludeFolders: string;
	preferredLanguages: string;
	includeTimestamps: boolean;
	includeSegments: boolean;
}

const DEFAULT_SETTINGS: YouTubeScraperSettings = {
	backendUrl: "http://localhost:8765",
	outputFolder: "youtube-transcripts",
	addBacklinks: true,
	backlinkText: "📺",
	skipAlreadyScraped: true,
	includeFolders: "",
	excludeFolders: "",
	preferredLanguages: "pl, en, auto",
	includeTimestamps: false,
	includeSegments: false,
};

// ============== Types ==============
interface ExtractedYouTubeLink {
	url: string;
	sourceFile: string;
	videoId: string;
}

interface VideoMetadata {
	video_id: string;
	title: string;
	author: string;
	description: string;
	thumbnail_url: string;
}

interface TranscriptSegment {
	text: string;
	start: number;
	duration: number;
}

interface TranscriptResponse {
	success: boolean;
	url: string;
	video_id: string;
	metadata?: VideoMetadata;
	transcript_text?: string;
	transcript_segments?: TranscriptSegment[];
	transcript_language?: string;
	available_languages?: string[];
	error?: string;
}

interface ScrapingState {
	pendingUrls: string[];
	stats: { success: number; failed: number; skipped: number; total: number; processed: number };
	linksMap: [string, ExtractedYouTubeLink[]][];
}

interface LogEntry {
	url: string;
	status: "success" | "failed" | "skipped";
	message: string;
}

// ============== Background Scraping Manager ==============
class BackgroundScrapingManager {
	plugin: YouTubeScraperPlugin;
	isRunning = false;
	isPaused = false;
	isCancelled = false;
	pendingUrls: string[] = [];
	allLinksMap: Map<string, ExtractedYouTubeLink[]> = new Map();
	stats = { success: 0, failed: 0, skipped: 0, total: 0, processed: 0 };
	currentUrl = "";
	logEntries: LogEntry[] = [];
	statusBarEl: HTMLElement | null = null;
	listeners: Set<() => void> = new Set();

	constructor(plugin: YouTubeScraperPlugin) {
		this.plugin = plugin;
	}

	subscribe(callback: () => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	notifyListeners() {
		this.listeners.forEach(cb => cb());
	}

	addLogEntry(url: string, status: "success" | "failed" | "skipped", message: string) {
		this.logEntries.push({ url, status, message });
		if (this.logEntries.length > 100) {
			this.logEntries.shift();
		}
		this.notifyListeners();
	}

	updateStatusBar() {
		if (!this.statusBarEl) return;
		
		if (this.isRunning) {
			const percent = this.stats.total > 0 
				? Math.round((this.stats.processed / this.stats.total) * 100) 
				: 0;
			
			this.statusBarEl.empty();
			this.statusBarEl.addClass("yt-scraper-statusbar-active");
			
			const icon = this.statusBarEl.createSpan({ cls: "yt-scraper-statusbar-icon" });
			icon.setText(this.isPaused ? "⏸" : "📺");
			
			const text = this.statusBarEl.createSpan({ cls: "yt-scraper-statusbar-text" });
			text.setText(`${this.stats.processed}/${this.stats.total}`);
			
			const barContainer = this.statusBarEl.createSpan({ cls: "yt-scraper-statusbar-bar" });
			const barFill = barContainer.createSpan({ cls: "yt-scraper-statusbar-bar-fill" });
			barFill.style.width = `${percent}%`;
			
			this.statusBarEl.show();
		} else {
			this.statusBarEl.empty();
			this.statusBarEl.removeClass("yt-scraper-statusbar-active");
			this.statusBarEl.hide();
		}
	}

	togglePause() {
		this.isPaused = !this.isPaused;
		this.updateStatusBar();
		this.notifyListeners();
		
		if (this.isPaused) {
			this.saveState();
		}
	}

	cancel() {
		this.isCancelled = true;
		this.isPaused = false;
		this.saveState();
		this.notifyListeners();
	}

	saveState() {
		this.plugin.saveScrapingState({
			pendingUrls: this.pendingUrls,
			stats: this.stats,
			linksMap: Array.from(this.allLinksMap.entries())
		});
	}

	loadState(): boolean {
		const savedState = this.plugin.getSavedScrapingState();
		if (savedState && savedState.pendingUrls.length > 0) {
			this.pendingUrls = savedState.pendingUrls;
			this.stats = savedState.stats;
			this.allLinksMap = new Map(savedState.linksMap);
			return true;
		}
		return false;
	}

	async startWithUrls(urls: string[], sourceFile: string) {
		if (this.isRunning) return;
		
		this.reset();
		this.pendingUrls = [...urls];
		this.stats = { success: 0, failed: 0, skipped: 0, total: urls.length, processed: 0 };
		
		for (const url of urls) {
			const videoId = this.plugin.extractVideoId(url);
			this.allLinksMap.set(url, [{ url, sourceFile, videoId: videoId || "" }]);
		}
		
		await this.runScraping();
	}

	async start(folderPath: string | null = null) {
		if (this.isRunning) return;
		
		this.isRunning = true;
		this.isPaused = false;
		this.isCancelled = false;
		this.logEntries = [];
		this.updateStatusBar();
		this.notifyListeners();

		if (this.pendingUrls.length === 0) {
			this.allLinksMap = await this.plugin.scanVaultForYouTubeLinks(folderPath);
			this.pendingUrls = Array.from(this.allLinksMap.keys());
			this.stats = { success: 0, failed: 0, skipped: 0, total: this.pendingUrls.length, processed: 0 };

			if (this.pendingUrls.length === 0) {
				this.finish("No YouTube links found");
				return;
			}
		}

		this.notifyListeners();
		await this.runScraping();
	}

	async runScraping() {
		this.isRunning = true;
		this.isPaused = false;
		this.isCancelled = false;
		this.logEntries = [];
		this.updateStatusBar();
		this.notifyListeners();

		while (this.pendingUrls.length > 0 && !this.isCancelled) {
			while (this.isPaused && !this.isCancelled) {
				await new Promise(resolve => setTimeout(resolve, 200));
			}
			
			if (this.isCancelled) break;

			const url = this.pendingUrls.shift()!;
			this.stats.processed++;
			this.currentUrl = url;
			this.updateStatusBar();
			this.notifyListeners();

			const result = await this.plugin.scrapeYouTubeUrl(url);

			if (result === null) {
				this.stats.skipped++;
				this.addLogEntry(url, "skipped", "Already scraped");
			} else if (result.success) {
				this.stats.success++;
				const sourceFiles = this.allLinksMap.get(url)?.map(l => l.sourceFile) || [];
				const savedPath = await this.plugin.saveTranscript(result, sourceFiles);
				
				if (savedPath && this.plugin.settings.addBacklinks) {
					for (const link of this.allLinksMap.get(url) || []) {
						await this.plugin.addBacklinkToNote(link.sourceFile, savedPath, url);
					}
				}
				this.addLogEntry(url, "success", result.metadata?.title?.substring(0, 30) || "OK");
			} else {
				this.stats.failed++;
				this.addLogEntry(url, "failed", result.error?.substring(0, 30) || "Error");
			}

			this.updateStatusBar();
			await new Promise(resolve => setTimeout(resolve, 500));
		}

		if (this.isCancelled) {
			this.finish(`Cancelled - ${this.pendingUrls.length} remaining`);
		} else {
			this.plugin.clearScrapingState();
			this.finish(`Done: ${this.stats.success} scraped, ${this.stats.skipped} skipped, ${this.stats.failed} failed`);
		}
	}

	finish(message: string) {
		this.isRunning = false;
		this.currentUrl = "";
		this.updateStatusBar();
		this.notifyListeners();
		new Notice(`YouTube Scraper: ${message}`);
	}

	reset() {
		this.pendingUrls = [];
		this.allLinksMap = new Map();
		this.stats = { success: 0, failed: 0, skipped: 0, total: 0, processed: 0 };
		this.logEntries = [];
		this.plugin.clearScrapingState();
	}
}

// ============== Main Plugin ==============
export default class YouTubeScraperPlugin extends Plugin {
	settings: YouTubeScraperSettings;
	backgroundManager: BackgroundScrapingManager;
	statusBarEl: HTMLElement;

	async onload() {
		await this.loadSettings();

		this.backgroundManager = new BackgroundScrapingManager(this);

		this.statusBarEl = this.addStatusBarItem();
		this.statusBarEl.addClass("yt-scraper-statusbar");
		this.statusBarEl.hide();
		this.statusBarEl.onClickEvent(() => {
			new ScraperModal(this.app, this, { isReattaching: true }).open();
		});
		this.backgroundManager.statusBarEl = this.statusBarEl;

		// Ribbon icon with dropdown menu
		this.addRibbonIcon("youtube", "YouTube Scraper", (evt) => {
			const menu = new Menu();

			if (this.backgroundManager.isRunning) {
				const statusText = this.backgroundManager.isPaused ? "paused" : "running";
				const percent = this.backgroundManager.stats.total > 0
					? Math.round((this.backgroundManager.stats.processed / this.backgroundManager.stats.total) * 100)
					: 0;
				
				menu.addItem((item) =>
					item
						.setTitle(`View progress (${percent}% - ${statusText})`)
						.setIcon("activity")
						.onClick(() => new ScraperModal(this.app, this, { isReattaching: true }).open())
				);
				
				menu.addSeparator();
			}

			menu.addItem((item) =>
				item
					.setTitle("Scrape current note")
					.setIcon("file-text")
					.onClick(() => this.scrapeCurrentNote())
			);

			menu.addItem((item) =>
				item
					.setTitle("Scrape folder...")
					.setIcon("folder")
					.onClick(() => new FolderPickerModal(this.app, this).open())
			);

			menu.addItem((item) =>
				item
					.setTitle("Scrape all YouTube links in vault")
					.setIcon("vault")
					.onClick(() => new ScraperModal(this.app, this, {}).open())
			);

			menu.addSeparator();

			menu.addItem((item) =>
				item
					.setTitle("Test backend connection")
					.setIcon("wifi")
					.onClick(() => this.testBackendConnection())
			);

			menu.addItem((item) =>
				item
					.setTitle("Open settings")
					.setIcon("settings")
					.onClick(() => {
						// @ts-ignore
						this.app.setting.open();
						// @ts-ignore
						this.app.setting.openTabById("youtube-scraper");
					})
			);

			menu.showAtMouseEvent(evt);
		});

		// File menu (right-click on file or folder)
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile && file.extension === "md") {
					menu.addItem((item) => {
						item
							.setTitle("Scrape YouTube links from this note")
							.setIcon("youtube")
							.onClick(async () => {
								const links = await this.extractYouTubeLinksFromFile(file);
								if (links.length === 0) {
									new Notice("No YouTube links found in this note");
									return;
								}
								const urls = [...new Set(links.map((l) => l.url))];
								new ScraperModal(this.app, this, {
									preloadedUrls: urls,
									sourceFile: file.path,
									title: `Scrape YouTube from: ${file.basename}`
								}).open();
							});
					});
				}
				
				if (file instanceof TFolder) {
					menu.addItem((item) => {
						item
							.setTitle("Scrape YouTube links from this folder")
							.setIcon("youtube")
							.onClick(() => {
								new ScraperModal(this.app, this, { folderPath: file.path }).open();
							});
					});
				}
			})
		);

		// Editor menu (right-click in editor)
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu, editor, view) => {
				const cursor = editor.getCursor();
				const line = editor.getLine(cursor.line);
				const urls = this.extractYouTubeUrlsFromText(line);

				if (urls.length > 0) {
					menu.addItem((item) => {
						item
							.setTitle("Scrape YouTube: " + urls[0].substring(0, 40) + "...")
							.setIcon("youtube")
							.onClick(async () => {
								const file = view.file;
								if (file) {
									await this.scrapeUrls(urls, file.path);
								}
							});
					});
				}
			})
		);

		// Commands
		this.addCommand({
			id: "scrape-current-note",
			name: "Scrape YouTube links from current note",
			callback: () => this.scrapeCurrentNote(),
		});

		this.addCommand({
			id: "scrape-all-links",
			name: "Scrape all YouTube links from vault",
			callback: () => {
				new ScraperModal(this.app, this, {}).open();
			},
		});

		this.addCommand({
			id: "scrape-link-under-cursor",
			name: "Scrape YouTube link under cursor",
			editorCallback: async (editor) => {
				const cursor = editor.getCursor();
				const line = editor.getLine(cursor.line);
				const urls = this.extractYouTubeUrlsFromText(line);
				if (urls.length > 0) {
					await this.scrapeUrls(urls, this.app.workspace.getActiveFile()?.path || "");
				} else {
					new Notice("No YouTube link found in this line");
				}
			},
		});

		this.addCommand({
			id: "view-scraping-progress",
			name: "View scraping progress",
			callback: () => {
				if (this.backgroundManager.isRunning || this.backgroundManager.pendingUrls.length > 0) {
					new ScraperModal(this.app, this, { isReattaching: true }).open();
				} else {
					new Notice("No scraping in progress");
				}
			},
		});

		this.addCommand({
			id: "test-backend",
			name: "Test backend connection",
			callback: () => this.testBackendConnection(),
		});

		this.addSettingTab(new YouTubeScraperSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private scrapingState: ScrapingState | null = null;

	getSavedScrapingState(): ScrapingState | null {
		return this.scrapingState;
	}

	saveScrapingState(state: ScrapingState) {
		this.scrapingState = state;
	}

	clearScrapingState() {
		this.scrapingState = null;
	}

	// Test backend connection
	async testBackendConnection() {
		try {
			const response = await requestUrl({
				url: `${this.settings.backendUrl}/health`,
				method: "GET",
			});
			
			if (response.status === 200) {
				new Notice("✅ Backend connection successful!");
			} else {
				new Notice(`⚠️ Backend returned status: ${response.status}`);
			}
		} catch (e) {
			new Notice(`❌ Cannot connect to backend: ${this.settings.backendUrl}`);
			console.error("Backend connection error:", e);
		}
	}

	// Extract video ID from YouTube URL
	extractVideoId(url: string): string | null {
		const patterns = [
			/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
			/(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
		];
		
		for (const pattern of patterns) {
			const match = url.match(pattern);
			if (match) {
				return match[1];
			}
		}
		return null;
	}

	// Check if URL is YouTube
	isYouTubeUrl(url: string): boolean {
		return /(?:youtube\.com|youtu\.be)/.test(url);
	}

	// Extract YouTube URLs from text
	extractYouTubeUrlsFromText(text: string): string[] {
		const urls: string[] = [];
		
		// Markdown links [text](url)
		const mdLinkRegex = /\[([^\]]*)\]\((https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)[^\s)]+)\)/g;
		let match;
		while ((match = mdLinkRegex.exec(text)) !== null) {
			urls.push(match[2]);
		}

		const textWithoutMd = text.replace(mdLinkRegex, "");

		// Raw URLs
		const rawUrlRegex = /(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)[^\s<>[\]()"'`]+)/g;
		while ((match = rawUrlRegex.exec(textWithoutMd)) !== null) {
			const url = match[1].replace(/[.,;:]+$/, "");
			if (!urls.includes(url)) {
				urls.push(url);
			}
		}

		return urls;
	}

	// Extract YouTube links from file
	async extractYouTubeLinksFromFile(file: TFile): Promise<ExtractedYouTubeLink[]> {
		const links: ExtractedYouTubeLink[] = [];
		const content = await this.app.vault.read(file);
		const urls = this.extractYouTubeUrlsFromText(content);

		for (const url of urls) {
			const videoId = this.extractVideoId(url);
			if (videoId) {
				links.push({
					url,
					sourceFile: file.path,
					videoId,
				});
			}
		}

		return links;
	}

	// Check if file should be included based on folder settings
	shouldIncludeFile(filePath: string): boolean {
		if (filePath.startsWith(this.settings.outputFolder)) {
			return false;
		}

		const excludeFolders = this.settings.excludeFolders
			.split(",")
			.map((f) => f.trim())
			.filter((f) => f.length > 0);
		
		for (const folder of excludeFolders) {
			if (filePath.startsWith(folder) || filePath.startsWith(folder + "/")) {
				return false;
			}
		}

		const includeFolders = this.settings.includeFolders
			.split(",")
			.map((f) => f.trim())
			.filter((f) => f.length > 0);
		
		if (includeFolders.length > 0) {
			return includeFolders.some((folder) => 
				filePath.startsWith(folder) || filePath.startsWith(folder + "/")
			);
		}

		return true;
	}

	// Scan vault or specific folder for YouTube links
	async scanVaultForYouTubeLinks(folderPath: string | null = null): Promise<Map<string, ExtractedYouTubeLink[]>> {
		const allLinks = new Map<string, ExtractedYouTubeLink[]>();
		const files = this.app.vault.getMarkdownFiles();

		for (const file of files) {
			if (folderPath !== null) {
				if (!file.path.startsWith(folderPath) && !file.path.startsWith(folderPath + "/")) {
					continue;
				}
			}
			
			if (!this.shouldIncludeFile(file.path)) continue;

			const links = await this.extractYouTubeLinksFromFile(file);
			for (const link of links) {
				if (!allLinks.has(link.url)) {
					allLinks.set(link.url, []);
				}
				allLinks.get(link.url)!.push(link);
			}
		}

		return allLinks;
	}

	// Scrape current note
	async scrapeCurrentNote() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active note");
			return;
		}

		const links = await this.extractYouTubeLinksFromFile(activeFile);
		if (links.length === 0) {
			new Notice("No YouTube links found in this note");
			return;
		}

		const urls = [...new Set(links.map((l) => l.url))];
		
		new ScraperModal(this.app, this, {
			preloadedUrls: urls,
			sourceFile: activeFile.path,
			title: `Scrape YouTube from: ${activeFile.basename}`
		}).open();
	}

	// Check if already scraped (file exists)
	isAlreadyScraped(videoId: string): boolean {
		if (!this.settings.skipAlreadyScraped) return false;
		
		const outputFolder = this.settings.outputFolder;
		const folder = this.app.vault.getAbstractFileByPath(outputFolder);
		
		if (folder instanceof TFolder) {
			for (const file of folder.children) {
				if (file instanceof TFile && file.name.includes(videoId)) {
					return true;
				}
			}
		}
		return false;
	}

	// Scrape single YouTube URL
	async scrapeYouTubeUrl(url: string): Promise<TranscriptResponse | null> {
		const videoId = this.extractVideoId(url);
		if (!videoId) {
			return {
				success: false,
				url,
				video_id: "",
				error: "Invalid YouTube URL",
			};
		}

		// Skip already scraped
		if (this.isAlreadyScraped(videoId)) {
			return null;
		}

		try {
			const languages = this.settings.preferredLanguages
				.split(",")
				.map(l => l.trim())
				.filter(l => l.length > 0);

			const response = await requestUrl({
				url: `${this.settings.backendUrl}/transcript`,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					url: url,
					languages: languages,
				}),
			});

			if (response.status !== 200) {
				return {
					success: false,
					url,
					video_id: videoId,
					error: `Backend error: HTTP ${response.status}`,
				};
			}

			return response.json as TranscriptResponse;
		} catch (e) {
			return {
				success: false,
				url,
				video_id: videoId,
				error: `Request failed: ${String(e).substring(0, 200)}`,
			};
		}
	}

	// Generate safe filename
	sanitizeFilename(name: string): string {
		return name
			.replace(/[<>:"/\\|?*]/g, "_")
			.replace(/\s+/g, " ")
			.trim()
			.substring(0, 80);
	}

	// Format timestamp (seconds to HH:MM:SS)
	formatTimestamp(seconds: number): string {
		const h = Math.floor(seconds / 3600);
		const m = Math.floor((seconds % 3600) / 60);
		const s = Math.floor(seconds % 60);
		
		if (h > 0) {
			return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
		}
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	// Save transcript to file
	async saveTranscript(
		result: TranscriptResponse,
		sourceFiles: string[]
	): Promise<string | null> {
		const outputFolder = this.settings.outputFolder;
		if (!(await this.app.vault.adapter.exists(outputFolder))) {
			await this.app.vault.createFolder(outputFolder);
		}

		// Filename
		let filename: string;
		if (result.metadata?.title) {
			filename = this.sanitizeFilename(result.metadata.title);
		} else {
			filename = result.video_id;
		}
		filename = `${filename}_${result.video_id}.md`;
		const filePath = `${outputFolder}/${filename}`;

		// Backlinks to sources
		const sources = [...new Set(sourceFiles.map((f) => `[[${f.replace(".md", "")}]]`))];
		const titleSafe = (result.metadata?.title || result.video_id).replace(/"/g, "'");

		// Build transcript content
		let transcriptContent = "";
		
		if (this.settings.includeSegments && result.transcript_segments) {
			// Include segments with optional timestamps
			for (const segment of result.transcript_segments) {
				if (this.settings.includeTimestamps) {
					const timestamp = this.formatTimestamp(segment.start);
					transcriptContent += `**[${timestamp}]** ${segment.text}\n\n`;
				} else {
					transcriptContent += `${segment.text}\n\n`;
				}
			}
		} else if (result.transcript_text) {
			// Just full text
			transcriptContent = result.transcript_text;
		}

		// File content
		let mdContent = `---
video_id: "${result.video_id}"
url: "${result.url}"
title: "${titleSafe}"
author: "${result.metadata?.author || "Unknown"}"
transcript_language: "${result.transcript_language || "unknown"}"
scraped_at: "${new Date().toISOString()}"
success: ${result.success}
source_notes: ${JSON.stringify(sources)}
---

# ${result.metadata?.title || result.video_id}

> **Video:** [${result.url}](${result.url})
> **Channel:** ${result.metadata?.author || "Unknown"}
> **Language:** ${result.transcript_language || "unknown"}
> **Scraped:** ${new Date().toISOString().split("T")[0]}
> **Linked from:** ${sources.join(", ")}

![Thumbnail](${result.metadata?.thumbnail_url || ""})

`;

		if (result.success && transcriptContent) {
			mdContent += `## Transcript\n\n${transcriptContent}\n`;
		} else if (!result.success) {
			mdContent += `## Error\n\nFailed to get transcript: **${result.error}**\n`;
			if (result.available_languages && result.available_languages.length > 0) {
				mdContent += `\nAvailable languages: ${result.available_languages.join(", ")}\n`;
			}
		} else {
			mdContent += `## Transcript\n\n*No transcript available for this video*\n`;
		}

		// Save file
		const existingFile = this.app.vault.getAbstractFileByPath(filePath);
		if (existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, mdContent);
		} else {
			await this.app.vault.create(filePath, mdContent);
		}

		return filePath;
	}

	// Add backlink to note
	async addBacklinkToNote(notePath: string, scrapedPath: string, url: string) {
		if (!this.settings.addBacklinks) return;

		const file = this.app.vault.getAbstractFileByPath(notePath);
		if (!(file instanceof TFile)) return;

		const content = await this.app.vault.read(file);
		const scrapedName = scrapedPath.replace(".md", "").split("/").pop();
		const linkText = this.settings.backlinkText || "📺";
		const backlink = ` [[${scrapedPath.replace(".md", "")}|${linkText}]]`;

		if (content.includes(scrapedName!)) return;

		let newContent = content;

		const escapedUrl = this.escapeRegex(url);
		const mdPattern = new RegExp(
			"(\\[[^\\]]*\\]\\(" + escapedUrl + "\\))",
			"g"
		);
		newContent = newContent.replace(mdPattern, `$1${backlink}`);

		if (newContent === content) {
			newContent = content.replace(url, `${url}${backlink}`);
		}

		if (newContent !== content) {
			await this.app.vault.modify(file, newContent);
		}
	}

	escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	// Main scraping function (for single/few URLs)
	async scrapeUrls(urls: string[], sourceFile: string) {
		const notice = new Notice(`Scraping ${urls.length} YouTube videos...`, 0);

		let success = 0;
		let failed = 0;
		let skipped = 0;

		for (let i = 0; i < urls.length; i++) {
			const url = urls[i];
			const videoId = this.extractVideoId(url);
			notice.setMessage(`Scraping ${i + 1}/${urls.length}: ${videoId || url.substring(0, 30)}`);

			const result = await this.scrapeYouTubeUrl(url);

			if (result === null) {
				skipped++;
				continue;
			}

			if (result.success) {
				success++;
			} else {
				failed++;
			}

			const savedPath = await this.saveTranscript(result, [sourceFile]);

			if (savedPath && result.success) {
				await this.addBacklinkToNote(sourceFile, savedPath, url);
			}

			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		notice.hide();
		new Notice(`Done: ${success} scraped, ${skipped} skipped, ${failed} failed`);
	}
}

// ============== Folder Picker Modal ==============
class FolderPickerModal extends Modal {
	plugin: YouTubeScraperPlugin;
	
	constructor(app: App, plugin: YouTubeScraperPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("yt-scraper-modal");

		new Setting(contentEl).setName("Select folder to scrape").setHeading();

		const folderList = contentEl.createDiv({ cls: "yt-scraper-folder-list" });
		
		const folders: TFolder[] = [];
		const walkFolders = (folder: TAbstractFile) => {
			if (folder instanceof TFolder && folder.path !== this.plugin.settings.outputFolder) {
				folders.push(folder);
				for (const child of folder.children) {
					walkFolders(child);
				}
			}
		};
		walkFolders(this.app.vault.getRoot());

		folders.sort((a, b) => a.path.localeCompare(b.path));

		for (const folder of folders) {
			const folderItem = folderList.createDiv({ cls: "yt-scraper-folder-item" });
			folderItem.createSpan({ text: folder.path || "/ (root)" });
			folderItem.addEventListener("click", () => {
				this.close();
				new ScraperModal(this.app, this.plugin, { folderPath: folder.path }).open();
			});
		}

		const buttonContainer = contentEl.createDiv({ cls: "yt-scraper-buttons" });
		const cancelBtn = buttonContainer.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// ============== Progress Modal ==============
interface ScraperModalOptions {
	folderPath?: string | null;
	isReattaching?: boolean;
	preloadedUrls?: string[];
	sourceFile?: string;
	title?: string;
}

class ScraperModal extends Modal {
	plugin: YouTubeScraperPlugin;
	folderPath: string | null;
	isReattaching: boolean;
	preloadedUrls: string[] | null;
	sourceFile: string | null;
	customTitle: string | null;
	
	statusEl: HTMLElement;
	progressContainer: HTMLElement;
	progressText: HTMLElement;
	progressBarFill: HTMLElement;
	progressStatus: HTMLElement;
	currentUrlEl: HTMLElement;
	statsEl: HTMLElement;
	logContainer: HTMLElement;
	startBtn: HTMLButtonElement;
	pauseBtn: HTMLButtonElement;
	cancelBtn: HTMLButtonElement;
	minimizeBtn: HTMLButtonElement;
	
	unsubscribe: (() => void) | null = null;
	lastLogCount = 0;

	constructor(app: App, plugin: YouTubeScraperPlugin, options: ScraperModalOptions = {}) {
		super(app);
		this.plugin = plugin;
		this.folderPath = options.folderPath ?? null;
		this.isReattaching = options.isReattaching ?? false;
		this.preloadedUrls = options.preloadedUrls ?? null;
		this.sourceFile = options.sourceFile ?? null;
		this.customTitle = options.title ?? null;
	}

	get manager(): BackgroundScrapingManager {
		return this.plugin.backgroundManager;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("yt-scraper-modal");

		let title: string;
		let statusText: string;
		
		if (this.customTitle) {
			title = this.customTitle;
			statusText = this.preloadedUrls 
				? `Found ${this.preloadedUrls.length} YouTube links. Click start to scrape.`
				: "Click start to scrape.";
		} else if (this.folderPath) {
			title = `Scrape YouTube from: ${this.folderPath}`;
			statusText = `Click start to scan folder "${this.folderPath}" and scrape all YouTube links.`;
		} else {
			title = "Scrape all YouTube links";
			statusText = "Click start to scan the vault and scrape all YouTube links.";
		}
		
		new Setting(contentEl).setName(title).setHeading();

		this.statusEl = contentEl.createEl("p", {
			text: statusText,
			cls: "yt-scraper-status"
		});

		this.progressContainer = contentEl.createDiv({ cls: "yt-scraper-progress yt-scraper-hidden" });
		
		const progressHeader = this.progressContainer.createDiv({ cls: "yt-scraper-progress-header" });
		this.progressText = progressHeader.createSpan({ cls: "yt-scraper-progress-text" });
		this.statsEl = progressHeader.createSpan({ cls: "yt-scraper-stats" });
		
		const barContainer = this.progressContainer.createDiv({ cls: "yt-scraper-bar-container" });
		this.progressBarFill = barContainer.createDiv({ cls: "yt-scraper-bar-fill" });
		
		this.currentUrlEl = this.progressContainer.createDiv({ cls: "yt-scraper-current-url" });
		this.progressStatus = this.progressContainer.createDiv({ cls: "yt-scraper-progress-status" });
		this.logContainer = this.progressContainer.createDiv({ cls: "yt-scraper-log" });

		const buttonContainer = contentEl.createDiv({ cls: "yt-scraper-buttons" });

		this.startBtn = buttonContainer.createEl("button", { 
			text: "Start",
			cls: "mod-cta"
		});
		this.startBtn.addEventListener("click", () => {
			void this.startScraping();
		});

		this.pauseBtn = buttonContainer.createEl("button", { 
			text: "Pause",
			cls: "yt-scraper-hidden"
		});
		this.pauseBtn.addEventListener("click", () => {
			this.manager.togglePause();
		});

		this.cancelBtn = buttonContainer.createEl("button", { 
			text: "Cancel",
			cls: "yt-scraper-hidden mod-warning"
		});
		this.cancelBtn.addEventListener("click", () => {
			this.manager.cancel();
		});

		this.minimizeBtn = buttonContainer.createEl("button", { 
			text: "Minimize",
			cls: "yt-scraper-hidden"
		});
		this.minimizeBtn.addEventListener("click", () => {
			new Notice("Scraping continues in background. Click status bar to reopen.");
			this.close();
		});

		const closeBtn = buttonContainer.createEl("button", { text: "Close" });
		closeBtn.addEventListener("click", () => this.close());

		this.unsubscribe = this.manager.subscribe(() => this.syncWithManager());

		if (this.isReattaching && this.manager.isRunning) {
			this.syncWithManager();
			this.showRunningUI();
			this.rebuildLog();
		} else if (this.manager.loadState()) {
			this.statusEl.setText(
				`Found interrupted session: ${this.manager.pendingUrls.length} URLs remaining. Click resume to continue.`
			);
			this.startBtn.setText("Resume");
		}
	}

	showRunningUI() {
		this.startBtn.addClass("yt-scraper-hidden");
		this.pauseBtn.removeClass("yt-scraper-hidden");
		this.cancelBtn.removeClass("yt-scraper-hidden");
		this.minimizeBtn.removeClass("yt-scraper-hidden");
		this.progressContainer.removeClass("yt-scraper-hidden");
	}

	rebuildLog() {
		this.logContainer.empty();
		for (const entry of this.manager.logEntries) {
			this.addLogEntry(entry.url, entry.status, entry.message);
		}
		this.lastLogCount = this.manager.logEntries.length;
	}

	syncWithManager() {
		const mgr = this.manager;
		
		const percent = mgr.stats.total > 0 
			? Math.round((mgr.stats.processed / mgr.stats.total) * 100) 
			: 0;
		
		this.progressText.setText(`${mgr.stats.processed}/${mgr.stats.total} (${percent}%)`);
		this.progressBarFill.style.width = `${percent}%`;
		this.statsEl.setText(
			`✓ ${mgr.stats.success} | ✗ ${mgr.stats.failed} | ⊘ ${mgr.stats.skipped}`
		);

		if (mgr.currentUrl) {
			const videoId = this.plugin.extractVideoId(mgr.currentUrl);
			this.currentUrlEl.setText(`Processing: ${videoId || mgr.currentUrl.substring(0, 50)}`);
		} else {
			this.currentUrlEl.setText("");
		}

		const newEntries = mgr.logEntries.slice(this.lastLogCount);
		for (const entry of newEntries) {
			this.addLogEntry(entry.url, entry.status, entry.message);
		}
		this.lastLogCount = mgr.logEntries.length;

		if (mgr.isRunning) {
			this.statusEl.setText(`Scraping ${mgr.stats.total} YouTube videos...`);
			this.showRunningUI();
			
			if (mgr.isPaused) {
				this.pauseBtn.setText("Resume");
				this.progressStatus.setText("Paused - click resume to continue");
			} else {
				this.pauseBtn.setText("Pause");
				this.progressStatus.setText("");
			}
		} else {
			this.startBtn.removeClass("yt-scraper-hidden");
			this.pauseBtn.addClass("yt-scraper-hidden");
			this.cancelBtn.addClass("yt-scraper-hidden");
			this.minimizeBtn.addClass("yt-scraper-hidden");
			this.currentUrlEl.setText("");
			this.progressStatus.setText(`Files saved in: ${this.plugin.settings.outputFolder}/`);
			
			if (mgr.pendingUrls.length > 0) {
				this.statusEl.setText(`Cancelled. ${mgr.pendingUrls.length} URLs remaining.`);
				this.startBtn.setText("Resume");
			} else {
				this.statusEl.setText(
					`Done: ${mgr.stats.success} scraped, ${mgr.stats.skipped} skipped, ${mgr.stats.failed} failed`
				);
				this.startBtn.setText("Run again");
			}
		}
	}

	addLogEntry(url: string, status: "success" | "failed" | "skipped", message: string) {
		const entry = this.logContainer.createDiv({ cls: `yt-scraper-log-entry yt-scraper-log-${status}` });
		
		const icon = status === "success" ? "✓" : status === "failed" ? "✗" : "⊘";
		entry.createSpan({ text: icon, cls: "yt-scraper-log-icon" });
		
		const videoId = this.plugin.extractVideoId(url);
		entry.createSpan({ text: videoId || url.substring(0, 20), cls: "yt-scraper-log-domain" });
		entry.createSpan({ text: message, cls: "yt-scraper-log-message" });
		
		this.logContainer.scrollTop = this.logContainer.scrollHeight;
		
		while (this.logContainer.children.length > 50) {
			this.logContainer.firstChild?.remove();
		}
	}

	async startScraping() {
		if (this.manager.isRunning) return;
		
		if (this.manager.pendingUrls.length === 0) {
			this.manager.reset();
			this.logContainer.empty();
			this.lastLogCount = 0;
		}
		
		this.showRunningUI();

		if (this.preloadedUrls && this.preloadedUrls.length > 0 && this.sourceFile) {
			this.statusEl.setText(`Scraping ${this.preloadedUrls.length} YouTube videos...`);
			void this.manager.startWithUrls(this.preloadedUrls, this.sourceFile);
		} else {
			this.statusEl.setText("Scanning...");
			void this.manager.start(this.folderPath);
		}
	}

	onClose() {
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
		
		if (this.manager.isRunning) {
			new Notice("Scraping continues in background");
		}
		
		const { contentEl } = this;
		contentEl.empty();
	}
}

// ============== Settings Tab ==============
class YouTubeScraperSettingTab extends PluginSettingTab {
	plugin: YouTubeScraperPlugin;

	constructor(app: App, plugin: YouTubeScraperPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Backend settings
		new Setting(containerEl).setName("Backend connection").setHeading();

		new Setting(containerEl)
			.setName("Backend URL")
			.setDesc("URL of the YouTube transcript scraper backend (e.g. http://192.168.1.100:8765)")
			.addText((text) =>
				text
					.setPlaceholder("http://localhost:8765")
					.setValue(this.plugin.settings.backendUrl)
					.onChange(async (value) => {
						this.plugin.settings.backendUrl = value || "http://localhost:8765";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Test connection")
			.setDesc("Verify that the backend is reachable")
			.addButton((button) =>
				button
					.setButtonText("Test")
					.onClick(() => this.plugin.testBackendConnection())
			);

		// Folder settings
		new Setting(containerEl).setName("Folder scope").setHeading();

		new Setting(containerEl)
			.setName("Output folder")
			.setDesc("Folder where transcripts will be saved")
			.addText((text) => {
				text
					.setPlaceholder("youtube-transcripts")
					.setValue(this.plugin.settings.outputFolder)
					.onChange(async (value) => {
						this.plugin.settings.outputFolder = value || "youtube-transcripts";
						await this.plugin.saveSettings();
					});
				new FolderSuggest(this.app, text.inputEl);
			});

		new Setting(containerEl)
			.setName("Include folders")
			.setDesc("Only scan these folders (comma-separated, empty = all)")
			.addText((text) => {
				text
					.setPlaceholder("Notes, Projects")
					.setValue(this.plugin.settings.includeFolders)
					.onChange(async (value) => {
						this.plugin.settings.includeFolders = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.addClass("yt-scraper-wide-input");
				new FolderSuggest(this.app, text.inputEl);
			});

		new Setting(containerEl)
			.setName("Exclude folders")
			.setDesc("Skip these folders (comma-separated)")
			.addText((text) => {
				text
					.setPlaceholder("Templates, Archive")
					.setValue(this.plugin.settings.excludeFolders)
					.onChange(async (value) => {
						this.plugin.settings.excludeFolders = value;
						await this.plugin.saveSettings();
					});
				text.inputEl.addClass("yt-scraper-wide-input");
				new FolderSuggest(this.app, text.inputEl);
			});

		// Backlinks
		new Setting(containerEl).setName("Backlinks").setHeading();

		new Setting(containerEl)
			.setName("Add backlinks")
			.setDesc("Automatically add [[link|text]] next to YouTube URLs in original notes")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.addBacklinks)
					.onChange(async (value) => {
						this.plugin.settings.addBacklinks = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Backlink text")
			.setDesc("Text/emoji displayed for backlink (e.g. '📺', 'transcript')")
			.addText((text) =>
				text
					.setPlaceholder("📺")
					.setValue(this.plugin.settings.backlinkText)
					.onChange(async (value) => {
						this.plugin.settings.backlinkText = value || "📺";
						await this.plugin.saveSettings();
					})
			);

		// Transcript settings
		new Setting(containerEl).setName("Transcript options").setHeading();

		new Setting(containerEl)
			.setName("Preferred languages")
			.setDesc("Comma-separated list of preferred transcript languages (e.g. 'pl, en, auto')")
			.addText((text) =>
				text
					.setPlaceholder("pl, en, auto")
					.setValue(this.plugin.settings.preferredLanguages)
					.onChange(async (value) => {
						this.plugin.settings.preferredLanguages = value || "pl, en, auto";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Include timestamps")
			.setDesc("Add timestamps before each transcript segment")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeTimestamps)
					.onChange(async (value) => {
						this.plugin.settings.includeTimestamps = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Include segments")
			.setDesc("Save transcript as separate segments (instead of continuous text)")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeSegments)
					.onChange(async (value) => {
						this.plugin.settings.includeSegments = value;
						await this.plugin.saveSettings();
					})
			);

		// General
		new Setting(containerEl).setName("General").setHeading();

		new Setting(containerEl)
			.setName("Skip already scraped")
			.setDesc("Skip videos that have already been scraped (file exists)")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.skipAlreadyScraped)
					.onChange(async (value) => {
						this.plugin.settings.skipAlreadyScraped = value;
						await this.plugin.saveSettings();
					})
			);
	}
}

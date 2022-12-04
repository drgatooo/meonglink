import type { Pool, Dispatcher } from 'undici';
import type { Node, Player } from './structures';

export interface MeongLinkOptions {
	nodes: NodeOptions[];
	shards?: number;
	clientId?: string;
	clientName?: string;
	searchOptions: SearchOptions;
	sendFunction: SendFunction;
	fallbackThumbnail?: string;
}

export interface NodeOptions {
	host: string;
	password: string;
	port?: number;
	name?: string;
	secure?: boolean;
	retryAmount?: number;
	retryDelay?: number;
	poolOptions?: Pool.Options;
}

export interface NodeStats {
	players: number;
	playingPlayers: number;
	uptime: number;
	memory: {
		free: number;
		used: number;
		allocated: number;
		reservable: number;
	};
	cpu: {
		cores: number;
		systemLoad: number;
		lavalinkLoad: number;
	};
}

export interface SearchOptions {
	defaultPlatform: Platform;
	spotify?: SpotifyOptions;
	deezer?: BasePluginOptions;
	appleMusic?: AppleMusicOptions;
}

export interface BasePluginOptions {
	enabled?: true;
	playlistLimit?: number;
	albumLimit?: number;
	artistLimit?: number;
}

export interface DeezerOptions extends BasePluginOptions {
	useISRC?: boolean;
	failIfNotFoundWithISRC?: boolean;
	templateArtistPopularPlaylist?: string;
}

export interface SpotifyOptions extends BasePluginOptions {
	clientId: string;
	clientSecret: string;
	useISRC?: boolean;
	failIfNotFoundWithISRC?: boolean;
	market?: string;
	templateArtistPopularPlaylist?: string;
}

export interface AppleMusicOptions extends BasePluginOptions {
	market?: string;
}

export type Platform = 'youtube' | 'youtube music' | 'soundcloud';
export type UnsupportedPlatforms = 'spotify' | 'deezer' | 'apple music';
export type SendFunction = (guildId: string, data: unknown) => void;

export type Unpartial<T> = {
	[P in keyof T]-?: T[P];
};

export type ModifyRequest = (options: Dispatcher.RequestOptions) => void;

// voice packets
export interface VoicePacket {
	t?: 'VOICE_SERVER_UPDATE' | 'VOICE_STATE_UPDATE';
	d: VoiceState | VoiceServer;
}

export interface VoiceServer {
	token: string;
	guild_id: string;
	endpoint: string;
}

export interface VoiceState {
	guild_id: string;
	user_id: string;
	session_id: string;
	channel_id: string;
	supress?: boolean;

	op: 'voiceUpdate';
	guildId: string;
	event: VoiceServer;
	sessionId?: string;
}

// player interfaces
export interface PlayerOptions {
	guildId: string;
	textChannelId: string;
	voiceChannelId: string;
	nodeId?: string;
	volume?: number;
	mute?: boolean;
	deafen?: boolean;
}

export interface PlayerSearchOptions {
	query: string;
	platform?: Platform | UnsupportedPlatforms;
	requester?: unknown;
}

export interface Track {
	track: string;
	identifier: string;
	title: string;
	authors: TrackAuthor[];
	duration: number;
	thumbnail?: string;
	uri: string;
	isSeekable: boolean;
	isStream: boolean;
	requester: any;
	explicit?: boolean;
}

export interface TrackAuthor {
	name: string;
	avatar?: string;
	url?: string;
}

export type LoadType =
	| 'TrackLoaded'
	| 'PlaylistLoaded'
	| 'SearchResult'
	| 'LoadFailed'
	| 'NoMatches';

export type LavalinkLoadType =
	| 'TRACK_LOADED'
	| 'PLAYLIST_LOADED'
	| 'SEARCH_RESULT'
	| 'LOAD_FAILED'
	| 'NO_MATCHES';

export interface LavalinkResponse {
	tracks?: LavalinkTrack[];
	loadType: LavalinkLoadType;
	exception?: {
		message: string;
		severity: string;
	};
	playlistInfo?: {
		name: string;
		selectedTrack: number;
	};
}

export interface LavalinkTrack {
	track: string;
	info: RawTrackInfo;
}

export interface RawTrackInfo {
	title: string;
	identifier: string;
	author: string;
	length: number;
	isSeekable: boolean;
	isStream: boolean;
	uri: string;
	thumbnail?: string | null;
}

export interface SearchResult
	extends Omit<LavalinkResponse, 'tracks' | 'playlistInfo' | 'loadType'> {
	loadType: LoadType;
	tracks: Track[];
	playlistInfo?: {
		name: string;
		duration: number;
		selectedTrack?: Track;
		thumbnail?: string;
		url?: string;
	};
}

export interface MeongEvents {
	NodeAdd: [node: Node];
	NodeConnect: [node: Node];
	NodeDisconnect: [node: Node, error: { code: number; reason: string }];
	NodeReconnect: [node: Node];
	NodeDestroy: [node: Node];
	NodeError: [node: Node, error: Error];
	Raw: [data: unknown];
	PlayerCreate: [player: Player];
	PlayerMove: [player: Player, oldChannel: string | undefined, newChannel: string];
	PlayerDisconnect: [player: Player, channelId: string | undefined];
	PlayerDestroy: [player: Player];
	TrackStart: [player: Player, track: Track, payload: TrackStartEvent];
	TrackEnd: [player: Player, track: Track, payload: TrackEndEvent];
	TrackStuck: [player: Player, track: Track, payload: TrackStuckEvent];
	TrackError: [player: Player, track: Track | null, payload: TrackExceptionEvent];
	QueueEnd: [player: Player, track: Track, payload: TrackEndEvent];
	SocketClosed: [player: Player, payload: WebSocketClosedEvent];
}

export type PlayerEventType =
	| 'TrackStartEvent'
	| 'TrackEndEvent'
	| 'TrackExceptionEvent'
	| 'TrackStuckEvent'
	| 'WebSocketClosedEvent';

export type Severity = 'COMMON' | 'SUSPICIOUS' | 'FAULT';

export interface PlayerEvent {
	op: 'event';
	type: PlayerEventType;
	guildId: string;
}

export interface Exception {
	severity: Severity;
	message: string;
	cause: string;
}

export type TrackEndReason = 'FINISHED' | 'LOAD_FAILED' | 'STOPPED' | 'REPLACED' | 'CLEANUP';

export type PlayerEvents =
	| TrackStartEvent
	| TrackEndEvent
	| TrackStuckEvent
	| TrackExceptionEvent
	| WebSocketClosedEvent;

export interface TrackStartEvent extends PlayerEvent {
	type: 'TrackStartEvent';
	track: string;
}

export interface TrackEndEvent extends PlayerEvent {
	type: 'TrackEndEvent';
	track: string;
	reason: TrackEndReason;
}

export interface TrackExceptionEvent extends PlayerEvent {
	type: 'TrackExceptionEvent';
	exception?: Exception;
	error: string;
}

export interface TrackStuckEvent extends PlayerEvent {
	type: 'TrackStuckEvent';
	thresholdMs: number;
}

export interface WebSocketClosedEvent extends PlayerEvent {
	type: 'WebSocketClosedEvent';
	code: number;
	byRemote: boolean;
	reason: string;
}

export type PlayerFilter =
	| 'Karaoke'
	| '8d'
	| 'Treblebass'
	| 'Soft'
	| 'Pop'
	| 'Bassboost'
	| 'Vaporwave'
	| 'Nightcore'
	| 'Tremolo'
	| 'Vibrato'
	| 'None';

export interface Filter {
	op: 'filters';
	[k: string]: any;
}

// Deezer
export interface DeezerSearchResult {
	data: PartialDeezerTrack[];
	total: number;
	next: string;
}

export interface DeezerTrack extends PartialDeezerTrack {
	error?: unknown;
	isrc: string;
	share: string;
	track_position: number;
	disk_number: number;
	release_date: string;
	bpm: number;
	gain: number;
	available_countries: string[];
	contributors: Array<Omit<DeezerArtist, 'nb_fan' | 'nb_album'> & { role: string }>;
	artist: Omit<DeezerArtist, 'nb_fan' | 'nb_album'> & { role: string };
	album: DeezerAlbum;
	type: 'track';
}

export interface PartialDeezerTrack {
	id: number;
	readable: boolean;
	title: string;
	title_short: string;
	title_version: string;
	link: string;
	duration: number;
	rank: number;
	explicit_lyrics: boolean;
	explicit_content_lyrics: number;
	explicit_content_cover: number;
	preview: string;
	md5_image: string;
	artist: PartialDeezerArtist;
	album: PartialDeezerAlbum;
	type: 'track';
}

export interface PartialDeezerGenre {
	id: number;
	name: string;
	picture: string;
	type: 'genre';
}

export interface CompleteDeezerAlbum extends DeezerAlbum {
	error?: unknown;
	genre_id: number;
	genres: {
		data: PartialDeezerGenre[];
	};
	label: string;
	nb_tracks: number;
	fans: number;
	available: boolean;
	contributors: Array<Omit<DeezerArtist, 'nb_fan' | 'nb_album'> & { role: string }>;
	artist: Omit<DeezerArtist, 'nb_fan' | 'nb_album'> & { role: string };
	tracks: {
		data: PartialDeezerTrack[];
	};
}

export interface DeezerAlbum extends PartialDeezerAlbum {
	link: string;
	release_date: string;
}

export interface PartialDeezerAlbum {
	id: number;
	title: string;
	cover: string;
	cover_small: string;
	cover_medium: string;
	cover_big: string;
	cover_xl: string;
	md5_image: string;
	tracklist: string;
	type: 'album';
}

export interface DeezerArtist extends PartialDeezerArtist {
	error?: unknown;
	share: string;
	nb_album: number;
	nb_fan: number;
	radio: boolean;
}

export interface PartialDeezerArtist {
	id: number;
	name: string;
	link: string;
	picture: string;
	picture_small: string;
	picture_medium: string;
	picture_big: string;
	picture_xl: string;
	tracklist: string;
	type: 'artist';
}

export interface DeezerPlaylist {
	error?: unknown;
	id: number;
	title: string;
	description: string;
	duration: number;
	public: boolean;
	is_loved_track: boolean;
	collaborative: boolean;
	nb_tracks: number;
	fans: number;
	link: string;
	share: string;
	picture: string;
	picture_small: string;
	picture_medium: string;
	picture_big: string;
	picture_xl: string;
	checksum: string;
	tracklist: string;
	creation_date: string;
	md5_image: string;
	picture_type: 'playlist';
	creator: {
		id: number;
		name: string;
		tracklist: string;
		type: 'user';
	};
	type: 'playlist';
	tracks: {
		data: PartialDeezerTrack[];
	};
}

export interface DeezerCustomResponse {
	error?: boolean;
	tracks: DeezerTrack[];
	name?: string;
	thumbnail?: string;
}

// Spotify
export interface SpotifyTokenResponse {
	access_token: string | null;
	expires_in: number | null;
}

export interface SpotifyArts {
	height: number;
	url: string;
	width: number;
}

export interface SpotifyAlbum extends SpotifyPartialAlbum {
	copyrights: Array<{
		text: string;
		type: string;
	}>;
	genres: string[];
	label: string;
	tracks: {
		href: string;
		items: SpotifyPartialTrack[];
		limit: number;
		next: null | string;
		offset: number;
		previous: null | string;
		total: number;
	};
}

export interface SpotifyPartialAlbum {
	album_type: string;
	artists: Artist[];
	available_markets: string[];
	external_urls: {
		spotify: string;
	};
	href: string;
	id: string;
	images: SpotifyArts[];
	name: string;
	release_date: string;
	release_date_precision: string;
	total_tracks: number;
	type: string;
	uri: string;
}

export interface SpotifyPartialTrack {
	artists: Artist[];
	available_markets: string[];
	disc_number: number;
	duration_ms: number;
	explicit: boolean;
	external_urls: {
		spotify: string;
	};
	href: string;
	id: string;
	is_local?: boolean;
	name: string;
	preview_url: string;
	track_number: number;
	type: string;
	uri: string;
}

export interface SpotifyTrack extends SpotifyPartialTrack {
	album: SpotifyPartialAlbum;
	external_ids: {
		isrc: string;
	};
	popularity: number;
}

export interface Artist {
	external_urls: {
		spotify: string;
	};
	href: string;
	id: string;
	name: string;
	type: string;
	uri: string;
}

export interface SpotifyArtist {
	external_urls: {
		spotify: string;
	};
	followers: {
		href: string | null;
		total: number;
	};
	genres: string[];
	href: string;
	id: string;
	images: SpotifyArts[];
	name: string;
	popularity: string;
	type: 'artist';
	uri: string;
}

export interface SpotifyAlbumTracks {
	items: SpotifyPartialTrack[];
	next: string | null;
}

export interface SpotifyPlaylistTracks {
	items: Array<{ track: SpotifyTrack }>;
	next: string | null;
	previous: string | null;
}

export interface SpotifyPlaylist {
	name: string;
	tracks: SpotifyPlaylistTracks;
	images: SpotifyArts[];
	id: string;
	type: 'playlist';
}

export interface SpotifyArtistTracks {
	tracks: SpotifyTrack[];
}

export interface SpotifySearchResult<T extends 'tracks' | 'albums' | 'playlists' | 'artists'> {
	href: string;
	items: T extends 'tracks'
		? SpotifyTrack[]
		: T extends 'albums'
		? SpotifyAlbum[]
		: T extends 'playlists'
		? SpotifyPlaylist[]
		: SpotifyArtist[];
	limit: number;
	next: string | null;
	offset: number;
	previous: string | null;
	total: number;
}

export interface SpotifyCustomResponse {
	error?: boolean;
	tracks: SpotifyTrack[];
	name?: string;
	thumbnail?: string;
}

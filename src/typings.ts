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
	cachePreviousTracks?: boolean;
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
	disableYoutube?: boolean;
	spotify?: SpotifyOptions;
	deezer?: BasePluginOptions;
	appleMusic?: AppleMusicOptions;
}

export interface BasePluginOptions {
	enabled?: boolean;
	playlistLimit?: number;
	albumLimit?: number;
	artistLimit?: number;
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
	thumbnail: string;
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
	thumbnail: string | null;
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

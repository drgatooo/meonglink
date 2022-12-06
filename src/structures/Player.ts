import { FilterString, platform_codes } from '../constants';
import type {
	Filter,
	LavalinkResponse,
	LavalinkTrack,
	PlayerFilter,
	PlayerOptions,
	PlayerSearchOptions,
	SearchResult,
	VoiceState
} from '../typings';
import type { MeongLink } from './MeongLink';
import type { Node } from './Node';
import { Queue } from './Queue';
import { Utils } from './Util';

export class Player {
	public constructor(private options: PlayerOptions, private manager: MeongLink) {
		if (!this.manager) throw new Error('Manager is not provided.');
		if (!this.options) throw new Error('Player options is not provided.');

		if (!options.guildId) throw new Error('Guild ID is not provided.');
		if (!options.textChannelId) throw new Error('Text channel ID is not provided.');
		if (!options.voiceChannelId) throw new Error('Voice channel ID is not provided.');

		this.options = Object.assign(
			{
				deafen: true,
				mute: false,
				volume: 90,
				nodeId: this.manager.nodes.first()?.options.name
			} as PlayerOptions,
			options
		);

		this.voiceChannelId = this.options.voiceChannelId;
		this.textChannelId = this.options.textChannelId;
		this.guildId = this.options.guildId;

		this.voiceState = Object.assign({
			op: 'voiceUpdate',
			guildId: options.guildId
		});

		const node = this.manager.nodes.get(this.options.nodeId!) || this.manager.nodes.first();
		if (!node) throw new Error('No available nodes.');

		this.node = node;
		this.manager.players.set(this.options.guildId, this);
		this.manager.emit('PlayerCreate', this);
		this.setVolume(this.options.volume || 90);
	}

	public voiceChannelId?: string;
	public textChannelId?: string;
	public guildId: string;
	public voiceState: Partial<VoiceState>;
	public state: PlayerState = 'Disconnected';
	public node: Node;
	public volume = this.options.volume || 90;
	public loopType: LoopType = 'disabled';
	public isPaused = false;
	public isPlaying = false;
	public queue = new Queue();
	public position = 0;
	private data: Record<string, any> = {};

	public getProp<T>(key: string) {
		return this.data[key] as T;
	}

	public setProp<T>(key: string, value: T) {
		this.data[key] = value;
		return this;
	}

	public async search({ query, requester, platform }: PlayerSearchOptions): Promise<SearchResult> {
		const node = this.node;
		if (!node?.connected) throw new Error('No available nodes.');

		if (!platform) platform = this.manager.options.searchOptions.defaultPlatform;
		const source = Utils.sourceFromUrl(query);
		const src = platform_codes[platform];

		if (source == 'query' && ['ytsearch', 'scsearch', 'ytmsearch'].includes(src)) {
			query = `${src}:${query}`;
		}

		const errorRes: (err?: string) => SearchResult = err => ({
			loadType: 'NoMatches',
			tracks: [],
			exception: {
				message: err ?? 'Unsupported platform.',
				severity: 'COMMON'
			},
			playlistInfo: undefined
		});

		if (
			source == 'youtube' ||
			source == 'soundcloud' ||
			(source == 'query' && !['spotify', 'deezer', 'appleMusic'].includes(platform)) ||
			source == 'url'
		) {
			return this._searchForSupportedSources(query, requester);
		} else {
			// TODO: Add support for other platforms
			if (source == 'spotify') {
				if (!this.manager.spotify?.ready) return errorRes('Spotify is not ready.');
				return this.manager.spotify.search(this, query, requester);
			}

			if (source == 'deezer') {
				if (!this.manager.deezer) return errorRes('Deezer is not ready.');
				return this.manager.deezer.search(this, query, requester);
			}

			if (source == 'query') {
				if (platform == 'spotify' && this.manager.spotify?.ready) {
					if (!this.manager.spotify?.ready) return errorRes('Spotify is not ready.');
					return this.manager.spotify.search(this, query, requester);
				}

				if (platform == 'deezer') {
					if (!this.manager.deezer) return errorRes('Deezer is not ready.');
					return this.manager.deezer.search(this, query, requester);
				}
			}
		}

		return errorRes();
	}

	private async _searchForSupportedSources(q: string, requester: unknown): Promise<SearchResult> {
		const res = await this.node.makeRequest<LavalinkResponse>(
			`/loadtracks?identifier=${encodeURIComponent(q)}`
		);

		if (!res) throw new Error('Query not found.');

		if (!res.tracks?.length) {
			return {
				loadType: 'NoMatches',
				tracks: [],
				exception: res.exception
			};
		}

		const lt = {
			TRACK_LOADED: 'TrackLoaded',
			PLAYLIST_LOADED: 'PlaylistLoaded',
			SEARCH_RESULT: 'SearchResult',
			NO_MATCHES: 'NoMatches',
			LOAD_FAILED: 'LoadFailed'
		} as const;

		const result: SearchResult = {
			loadType: lt[res.loadType],
			exception: res.exception ?? undefined,
			tracks: res.tracks.map((track: LavalinkTrack) =>
				Utils.buildTrackFromRaw(track, requester, undefined, this.manager)
			)
		};

		if (result.loadType == 'PlaylistLoaded') {
			result.playlistInfo = {
				name: res.playlistInfo?.name || 'Unknown',
				duration: result.tracks.reduce((acc, cur) => acc + (cur.duration || 0), 0),
				selectedTrack: result.tracks[res.playlistInfo?.selectedTrack || 0],
				url: q
			};
		}

		return result;
	}

	public async play(): Promise<void> {
		if (!this.queue.current) throw new RangeError('No current track.');

		const options = {
			op: 'play',
			guildId: this.guildId,
			track: this.queue.current.track
		};

		await this.node.send(options);
	}

	public setVolume(volume: number) {
		volume = +volume;
		if (isNaN(volume)) throw new Error('Volume must be a number.');
		this.volume = Math.max(Math.min(volume, 1000), 0);

		this.node.send({
			op: 'volume',
			guildId: this.options.guildId,
			volume: this.volume
		});

		return this;
	}

	public setLoopType(type: LoopType) {
		if (!['disabled', 'queue', 'track'].includes(type)) throw new Error('Invalid loop type.');
		this.loopType = type;
		return this;
	}

	public skip(amount?: number) {
		if (typeof amount === 'undefined') amount = 1;
		if (isNaN(amount)) throw new Error('Amount must be a number.');
		if (amount < 1) throw new Error('Amount must be greater than 0.');

		if (amount > this.queue.length) {
			throw new Error('Amount is greater than the queue size.');
		}

		this.queue.previous.push(...this.queue.splice(0, amount - 1));

		this.node.send({
			op: 'stop',
			guildId: this.options.guildId,
			amount
		});

		return this;
	}

	public pause(state?: boolean) {
		if (typeof state === 'undefined') state = !this.isPaused;
		if (typeof state !== 'boolean') throw new Error('State must be a boolean.');

		if (this.isPaused === state || !this.queue.totalLength) return this;

		this.isPlaying = !state;
		this.isPaused = state;

		this.node.send({
			op: 'pause',
			guildId: this.options.guildId,
			pause: state
		});

		return this;
	}

	public connect(): this {
		if (!this.voiceChannelId) throw new RangeError('No voice channel has been set.');
		this.state = 'Connecting';

		this.manager.options.sendFunction(this.guildId, {
			op: 4,
			d: {
				guild_id: this.guildId,
				channel_id: this.voiceChannelId,
				self_deaf: this.options.deafen || false,
				self_mute: this.options.mute || false,
				deaf: this.options.deafen || false,
				mute: this.options.mute || false,
				supress: false
			}
		});

		this.state = 'Connected';
		return this;
	}

	public disconnect(): this {
		if (this.voiceChannelId === null) return this;
		this.state = 'Disconnecting';

		this.pause(true);
		this.manager.options.sendFunction(this.guildId, {
			op: 4,
			d: {
				guild_id: this.guildId,
				channel_id: null,
				self_mute: false,
				self_deaf: false
			}
		});

		this.voiceChannelId = undefined;
		this.state = 'Disconnected';
		return this;
	}

	public destroy(disconnect = true): void {
		this.state = 'Destroying';
		if (disconnect) {
			this.disconnect();
		}

		this.node.send({
			op: 'destroy',
			guildId: this.guildId
		});

		this.manager.emit('PlayerDestroy', this);
		this.manager.players.delete(this.guildId);
	}

	// Filters
	public filter: PlayerFilter = 'None';
	public speed = 1;
	public pitch = 1;
	public rate = 1;
	public bands = new Array<number>(15).fill(0.0);
	public band = 0;
	public gain = 0;

	public setEQ({ band, gain }: EqualizerBand): this {
		if (!band || !gain) throw new Error('Invalid EQ. Must contain band and gain.');

		this.band = band;
		this.gain = gain;

		this.node.send({
			op: 'filters',
			guildId: this.guildId,
			equalizer: Array.from({ length: 6 }, () => ({ band, gain }))
		});

		return this;
	}

	public clearEQ(): this {
		this.bands = new Array(15).fill(0.0);

		this.node.send({
			op: 'equalizer',
			guildId: this.guildId,
			bands: this.bands.map((gain, band) => ({ band, gain }))
		});

		return this;
	}

	public setTimescale(speed?: number, pitch?: number, rate?: number): Player {
		this.speed = speed || this.speed;
		this.pitch = pitch || this.pitch;
		this.rate = rate || this.rate;

		this.node.send({
			op: 'filters',
			guildId: this.guildId,
			timescale: {
				speed: this.speed,
				pitch: this.pitch,
				rate: this.rate
			}
		});
		return this;
	}

	private capitalize(str: string) {
		if (typeof str !== 'string') return '';
		return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
	}

	public setFilter(filterName: PlayerFilter): boolean {
		filterName = this.capitalize(filterName) as PlayerFilter;
		if (this.filter == filterName) return false;
		if (!FilterString.includes(filterName)) return false;

		let data: Filter = { op: 'filters' };

		switch (filterName) {
			case 'Vaporwave': {
				data = {
					op: 'filters',
					equalizer: [
						{ band: 1, gain: 0.3 },
						{ band: 0, gain: 0.3 }
					],
					timescale: { pitch: 0.800000011920929, speed: 0.8500000238418579, rate: 1 }
				};
				break;
			}

			case '8d': {
				data = {
					op: 'filters',
					rotation: {
						rotationHz: 0.2
					}
				};
				break;
			}

			case 'Bassboost': {
				data = {
					op: 'filters',
					equalizer: [
						{ band: 0, gain: 0.6 },
						{ band: 1, gain: 0.7 },
						{ band: 2, gain: 0.8 },
						{ band: 3, gain: 0.55 },
						{ band: 4, gain: 0.25 },
						{ band: 5, gain: 0 },
						{ band: 6, gain: -0.25 },
						{ band: 7, gain: -0.45 },
						{ band: 8, gain: -0.55 },
						{ band: 9, gain: -0.7 },
						{ band: 10, gain: -0.3 },
						{ band: 11, gain: -0.25 },
						{ band: 12, gain: 0 },
						{ band: 13, gain: 0 },
						{ band: 14, gain: 0 }
					]
				};
				break;
			}

			case 'Karaoke': {
				data = {
					op: 'filters',
					karaoke: {
						level: 1.0,
						monoLevel: 1.0,
						filterBand: 220.0,
						filterWidth: 100.0
					}
				};
				break;
			}

			case 'Pop': {
				data = {
					op: 'filters',
					equalizer: [
						{ band: 0, gain: 0.65 },
						{ band: 1, gain: 0.45 },
						{ band: 2, gain: -0.45 },
						{ band: 3, gain: -0.65 },
						{ band: 4, gain: -0.35 },
						{ band: 5, gain: 0.45 },
						{ band: 6, gain: 0.55 },
						{ band: 7, gain: 0.6 },
						{ band: 8, gain: 0.6 },
						{ band: 9, gain: 0.6 },
						{ band: 10, gain: 0 },
						{ band: 11, gain: 0 },
						{ band: 12, gain: 0 },
						{ band: 13, gain: 0 }
					]
				};
				break;
			}

			case 'Soft': {
				data = {
					op: 'filters',
					lowPass: {
						smoothing: 20.0
					}
				};
				break;
			}

			case 'Treblebass': {
				data = {
					op: 'filters',
					equalizer: [
						{ band: 0, gain: 0.6 },
						{ band: 1, gain: 0.67 },
						{ band: 2, gain: 0.67 },
						{ band: 3, gain: 0 },
						{ band: 4, gain: -0.5 },
						{ band: 5, gain: 0.15 },
						{ band: 6, gain: -0.45 },
						{ band: 7, gain: 0.23 },
						{ band: 8, gain: 0.35 },
						{ band: 9, gain: 0.45 },
						{ band: 10, gain: 0.55 },
						{ band: 11, gain: 0.6 },
						{ band: 12, gain: 0.55 },
						{ band: 13, gain: 0 }
					]
				};
				break;
			}

			case 'Nightcore': {
				data = {
					op: 'filters',
					timescale: {
						speed: 1.2999999523162842,
						pitch: 1.2999999523162842,
						rate: 1
					}
				};
				break;
			}

			case 'Vibrato': {
				data = {
					op: 'filters',
					vibrato: {
						frequency: 10,
						depth: 0.9
					}
				};
				break;
			}

			case 'Tremolo': {
				data = {
					op: 'filters',
					tremolo: {
						frequency: 10,
						depth: 0.5
					}
				};
				break;
			}

			case 'Classical': {
				data = {
					op: 'filters',
					equalizer: [
						{ band: 0, gain: 0.375 },
						{ band: 1, gain: 0.35 },
						{ band: 2, gain: 0.125 },
						{ band: 3, gain: 0 },
						{ band: 4, gain: 0 },
						{ band: 5, gain: 0.125 },
						{ band: 6, gain: 0.55 },
						{ band: 7, gain: 0.05 },
						{ band: 8, gain: 0.125 },
						{ band: 9, gain: 0.25 },
						{ band: 10, gain: 0.2 },
						{ band: 11, gain: 0.25 },
						{ band: 12, gain: 0.3 },
						{ band: 13, gain: 0.25 },
						{ band: 14, gain: 0.3 }
					]
				};
				break;
			}

			case 'Lovenightcore': {
				data = {
					op: 'filters',
					timescale: {
						speed: 1.1,
						pitch: 1.2,
						rate: 1.0
					}
				};
				break;
			}

			default:
				break;
		}

		this.filter = filterName;
		this.node.send({ ...data, guildId: this.guildId });
		return true;
	}
}

type PlayerState = 'Connected' | 'Disconnected' | 'Connecting' | 'Disconnecting' | 'Destroying';
type LoopType = 'disabled' | 'queue' | 'track';

export interface EqualizerBand {
	/** The band number being 0 to 14. */
	band: number;
	/** The gain amount being -0.25 to 1.00, 0.25 being double. */
	gain: number;
}

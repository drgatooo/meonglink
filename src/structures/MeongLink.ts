import { Collection } from '@discordjs/collection';
import { EventEmitter } from 'node:events';
import { checkOptions } from '../check';
import { Spotify } from '../plugins/Spotify';
import type {
	MeongEvents,
	MeongLinkOptions,
	PlayerOptions,
	Unpartial,
	VoicePacket,
	VoiceServer,
	VoiceState
} from '../typings';
import { Node } from './Node';
import { Player } from './Player';

export interface MeongLink {
	on<T extends keyof MeongEvents>(event: T, listener: (...args: MeongEvents[T]) => void): this;
	once<T extends keyof MeongEvents>(event: T, listener: (...args: MeongEvents[T]) => void): this;
	emit<T extends keyof MeongEvents>(event: T, ...args: MeongEvents[T]): boolean;
}

export class MeongLink extends EventEmitter {
	public constructor(options: MeongLinkOptions) {
		super();
		checkOptions(options);

		this.options = Object.assign(
			{
				shards: 1,
				searchOptions: {
					defaultPlatform: 'youtube music'
				},
				fallbackThumbnail: 'https://discussions.apple.com/content/attachment/881765040',
				cachePreviousTracks: true
			},
			options
		);

		if (this.options.searchOptions.spotify?.enabled) {
			const options = this.options.searchOptions.spotify;

			this.spotify = new Spotify(
				{
					enabled: true,
					useISRC: true,
					failIfNotFoundWithISRC: true,
					market: 'US',
					playlistLimit: 1,
					albumLimit: 1,
					artistLimit: 1,
					templateArtistPopularPlaylist: 'Top Songs by {artist}',
					...options
				},
				this
			);
		}

		this.options.nodes.forEach(n => this.nodes.set(n.name || n.host, new Node(n, this)));

		this.clientId = options.clientId;
		this.clientName = options.clientName || 'discord bot';
	}

	public readonly nodes = new Collection<string, Node>();
	public readonly players = new Collection<string, Player>();
	public readonly options: Unpartial<Omit<MeongLinkOptions, 'clientId' | 'clientName'>>;
	public startedAt: Date | undefined;
	public clientId?: string;
	public clientName: string = 'Discord Bot';
	public readonly spotify?: Spotify;
	public readonly deezer?: Spotify;
	public readonly appleMusic?: Spotify;

	public init(clientId?: string) {
		if (clientId) this.clientId = clientId;
		if (typeof clientId != 'string') throw new Error('Client ID is not provided');

		for (const node of this.nodes.values()) {
			try {
				node.connect();
			} catch (err) {
				this.emit('NodeError', node, err instanceof Error ? err : new Error(`${err}`));
			}
		}

		this.startedAt = new Date();
		return this;
	}

	public updateVoiceState(data: VoicePacket | VoiceServer | VoiceState) {
		if ('t' in data && !['VOICE_STATE_UPDATE', 'VOICE_SERVER_UPDATE'].includes(data.t || ''))
			return;

		const update: VoiceServer | VoiceState = 'd' in data ? data.d : data;
		if (!update || (!('token' in update) && !('session_id' in update))) return;

		const player = this.players.get(update.guild_id)!;
		if (!player) return;

		if ('token' in update) {
			player.voiceState.event = update;
		} else {
			if (update.user_id !== this.clientId) {
				return;
			}

			if (update.channel_id) {
				if (player.voiceChannelId !== update.channel_id) {
					this.emit('PlayerMove', player, player.voiceChannelId, update.channel_id);
				}

				player.voiceState.sessionId = update.session_id;
				player.voiceChannelId = update.channel_id;
			} else {
				this.emit('PlayerDisconnect', player, player.voiceChannelId);
				player.voiceChannelId = undefined;
				player.voiceState = Object.assign({});
				player.pause(true);
			}
		}

		const REQUIRED_KEYS = ['event', 'guildId', 'op', 'sessionId'];
		if (REQUIRED_KEYS.every(key => key in player.voiceState)) {
			player.node.send(player.voiceState);
		}
	}

	public createPlayer(options: PlayerOptions) {
		if (this.players.has(options.guildId)) return this.players.get(options.guildId)!;
		return new Player(options, this);
	}
}

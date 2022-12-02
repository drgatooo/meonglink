import { checkNode } from '../check';
import { Dispatcher, Pool } from 'undici';
import ws from 'ws';

import type {
	ModifyRequest,
	NodeOptions,
	NodeStats,
	PlayerEvents,
	Track,
	TrackEndEvent,
	TrackExceptionEvent,
	TrackStartEvent,
	TrackStuckEvent,
	Unpartial,
	WebSocketClosedEvent
} from '../typings';
import type { MeongLink } from './MeongLink';
import type { Player } from './Player';

export class Node {
	public constructor(options: NodeOptions, private manager: MeongLink) {
		const checks = checkNode(options);
		if (checks.error) {
			throw new Error(checks.error);
		}

		this.options = {
			port: 2333,
			secure: false,
			name: options.host,
			retryAmount: 5,
			retryDelay: 30e3,
			poolOptions: {},
			...options
		};

		this.http = new Pool(`http${options.secure ? 's' : ''}://${this.fullHost}`);

		this.stats = {
			players: 0,
			playingPlayers: 0,
			uptime: 0,
			memory: {
				free: 0,
				used: 0,
				allocated: 0,
				reservable: 0
			},
			cpu: {
				cores: 0,
				systemLoad: 0,
				lavalinkLoad: 0
			}
		};

		this.manager.nodes.set(this.options.name, this);
		this.manager.emit('NodeAdd', this);
	}

	public connect() {
		if (this.connected) return;

		const headers = {
			'Authorization': this.options.password,
			'Num-Shards': this.manager.options.shards.toString(),
			'User-Id': this.manager.clientId,
			'Client-Name': this.manager.clientName
		};

		this.socket = new ws(`ws${this.options.secure ? 's' : ''}://${this.fullHost}`, { headers });
		this.socket.on('open', this.open.bind(this));
		this.socket.on('close', this.close.bind(this));
		this.socket.on('error', this.error.bind(this));
		this.socket.on('message', this.message.bind(this));
	}

	public socket: ws | undefined;
	public http: Pool;
	public options: Unpartial<NodeOptions>;
	public stats: NodeStats;
	private reconnectTimeout?: NodeJS.Timeout;
	private reconnectAttempts = 1;

	public get connected(): boolean {
		if (!this.socket) return false;
		return this.socket.readyState === ws.OPEN;
	}

	public get fullHost() {
		return `${this.options.host}:${this.options.port}`;
	}

	// websocket callback functions
	protected open() {
		if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
		this.manager.emit('NodeConnect', this);
	}

	protected close(code: number, reason: string): void {
		this.manager.emit('NodeDisconnect', this, { code, reason });
		if (code !== 1000 || reason !== 'destroy') this.reconnect();
	}

	protected error(err?: Error) {
		if (!err) return;
		this.manager.emit('NodeError', this, err);
	}

	protected message(d: Buffer | string) {
		if (Array.isArray(d)) d = Buffer.concat(d);
		else if (d instanceof ArrayBuffer) d = Buffer.from(d);

		const payload = JSON.parse(d.toString());

		if (!payload.op) return;
		this.manager.emit('Raw', payload);

		switch (payload.op) {
			case 'stats':
				delete payload.op;
				this.stats = { ...payload } as unknown as NodeStats;
				break;
			case 'playerUpdate':
				const player = this.manager.players.get(payload.guildId);
				if (player) player.position = payload.state.position || 0;
				break;
			case 'event':
				this.handleEvent(payload);
				break;
			default:
				this.manager.emit(
					'NodeError',
					this,
					new Error(`Unexpected op "${payload.op}" with data: ${payload}`)
				);
				return;
		}
	}

	protected handleEvent(payload: PlayerEvents) {
		if (!payload.guildId) return;

		const player = this.manager.players.get(payload.guildId);
		if (!player) return;

		const track = player.queue.current;
		const type = payload.type;

		if (payload.type === 'TrackStartEvent') {
			this.trackStart(player, track as Track, payload);
		} else if (payload.type === 'TrackEndEvent') {
			this.trackEnd(player, track as Track, payload);
		} else if (payload.type === 'TrackStuckEvent') {
			this.trackStuck(player, track as Track, payload);
		} else if (payload.type === 'TrackExceptionEvent') {
			this.trackError(player, track, payload);
		} else if (payload.type === 'WebSocketClosedEvent') {
			this.socketClosed(player, payload);
		} else {
			const error = new Error(`Node#event unknown event '${type}'.`);
			this.manager.emit('NodeError', this, error);
		}
	}

	protected trackStart(player: Player, track: Track, payload: TrackStartEvent): void {
		player.isPlaying = true;
		player.isPaused = false;
		this.manager.emit('TrackStart', player, track, payload);
	}

	protected trackEnd(player: Player, track: Track, payload: TrackEndEvent): void {
		// If a track had an error while starting
		if (['LOAD_FAILED', 'CLEAN_UP'].includes(payload.reason)) {
			player.queue.previous.push(player.queue.current!);
			const nextTrack = player.queue.shift();
			if (nextTrack) player.queue.current = nextTrack;
			else return this.queueEnd(player, track, payload);

			this.manager.emit('TrackEnd', player, track, payload);
			player.play();
			return;
		}

		// If a track was forcibly played
		if (payload.reason === 'REPLACED') {
			this.manager.emit('TrackEnd', player, track, payload);
			return;
		}

		// If a track ended and is track repeating
		if (track && player.loopType == 'track') {
			if (payload.reason === 'STOPPED') {
				player.queue.previous.push(player.queue.current!);
				player.queue.current = player.queue.shift()!;
			}

			if (!player.queue.current) return this.queueEnd(player, track, payload);

			this.manager.emit('TrackEnd', player, track, payload);
			player.play();
			return;
		}

		// If a track ended and is track repeating
		if (track && player.loopType == 'queue') {
			player.queue.previous.push(player.queue.current!);

			if (payload.reason === 'STOPPED') {
				player.queue.current = player.queue.shift()!;
				if (!player.queue.current) return this.queueEnd(player, track, payload);
			} else {
				player.queue.current = player.queue.shift()!;
				if (!player.queue.current) {
					player.queue.add(player.queue.previous);
					player.queue.previous = [];
				}
			}

			this.manager.emit('TrackEnd', player, track, payload);
			player.play();
			return;
		}

		// If there is another song in the queue
		if (player.queue.length) {
			if (player.queue.current) player.queue.previous.push(player.queue.current);

			const nextTrack = player.queue.shift();
			if (nextTrack) player.queue.current = nextTrack;

			this.manager.emit('TrackEnd', player, track, payload);
			player.play();
			return;
		}

		// If there are no songs in the queue
		if (!player.queue.length) return this.queueEnd(player, track, payload);
	}

	protected queueEnd(player: Player, track: Track, payload: TrackEndEvent): void {
		player.queue.current = null;
		player.isPlaying = false;
		this.manager.emit('QueueEnd', player, track, payload);
	}

	protected trackStuck(player: Player, track: Track, payload: TrackStuckEvent): void {
		player.skip();
		this.manager.emit('TrackStuck', player, track, payload);
	}

	protected trackError(player: Player, track: Track | null, payload: TrackExceptionEvent): void {
		player.skip();
		this.manager.emit('TrackError', player, track, payload);
	}

	protected socketClosed(player: Player, payload: WebSocketClosedEvent): void {
		this.manager.emit('SocketClosed', player, payload);
	}

	// node functions
	private reconnect(): void {
		this.reconnectTimeout = setTimeout(() => {
			if (this.reconnectAttempts >= this.options.retryAmount) {
				const error = new Error(`Unable to connect after ${this.options.retryAmount} attempts.`);

				this.manager.emit('NodeError', this, error);
				return this.destroy();
			}

			this.socket?.removeAllListeners();
			this.socket = undefined;
			this.manager.emit('NodeReconnect', this);
			this.connect();
			this.reconnectAttempts++;
		}, this.options.retryDelay);
	}

	public destroy() {
		if (!this.connected) return;

		this.socket?.close(1000, 'destroy');
		this.socket?.removeAllListeners();
		this.socket = undefined;

		this.reconnectAttempts = 1;
		clearTimeout(this.reconnectTimeout);

		this.manager.emit('NodeDestroy', this);
		this.manager.nodes.delete(this.options.name);
	}

	public send(data: unknown): Promise<boolean> {
		return new Promise((rs, rj) => {
			if (!this.connected) return rj(false);
			if (!data || !JSON.stringify(data).startsWith('{')) rj(false);

			this.socket?.send(JSON.stringify(data), err => {
				if (err) rj(err);
				else rs(true);
			});
		});
	}

	public async makeRequest<T>(endpoint: string, modify?: ModifyRequest): Promise<T> {
		const options: Dispatcher.RequestOptions = {
			path: `/${endpoint.replace(/^\//gm, '')}`,
			method: 'GET',
			headers: {
				Authorization: this.options.password
			},
			headersTimeout: 30e3
		};

		modify?.(options);

		const request = await this.http.request(options);
		return await request.body.json();
	}
}

import { fetch } from 'undici';
import { platform_codes } from '../../constants';
import type { MeongLink, Player } from '../../structures';
import type {
	DeezerOptions,
	LavalinkResponse,
	LavalinkTrack,
	SearchResult,
	Track,
	Unpartial,
	CompleteDeezerAlbum,
	DeezerCustomResponse,
	DeezerPlaylist,
	DeezerSearchResult,
	DeezerTrack,
	PartialDeezerTrack
} from '../..';

export class Deezer {
	private BASE_URL = 'https://api.deezer.com';
	private regexp =
		/^(?:https?:\/\/|)?(?:www\.)?deezer\.com\/(?:\w{2}\/)?(track|album|playlist|artist)\/(\d+)/;

	public constructor(public options: Unpartial<DeezerOptions>, public manager: MeongLink) {}

	private async makeRequest<T>(endpoint: string): Promise<T> {
		const url = endpoint.startsWith('https://')
			? endpoint
			: `${this.BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

		const res: any = await fetch(url, {
			method: 'GET'
		});

		return res;
	}

	// Plugin Search
	public async search(
		player: Player,
		query: string,
		requester: unknown,
		type?: SearchType
	): Promise<SearchResult> {
		if (!player.node.connected) throw new Error('Node is not connected');
		if (!type) type = 'track';

		let id: string | undefined = undefined;
		let response: SearchResult = {
			loadType: 'LoadFailed',
			tracks: [],
			exception: {
				message: 'No tracks found.',
				severity: 'COMMON'
			}
		};

		if (query.match(this.regexp)) {
			const [, queryType, queryId] = query.match(this.regexp)!;
			id = queryId!;
			type = queryType as SearchType;
		}

		if (!id) {
			const search = await this.searchDeezer(query);
			const item = search.data[0];

			if (!item) return response;

			id = item.id.toString();
			type = 'track';
		}

		switch (type) {
			case 'track': {
				const track = await this.getTrack(id!);
				if (!track || track.error) break;

				console.log(track);
				const resolved = await this.resolve(track.tracks[0]!, player, requester);

				if (!resolved) {
					return {
						loadType: 'LoadFailed',
						exception: {
							message: 'No tracks found.',
							severity: 'COMMON'
						},
						tracks: []
					};
				} else {
					return {
						loadType: 'TrackLoaded',
						tracks: [resolved]
					};
				}
			}

			case 'album': {
				const tracks = await this.getAlbum(id!);
				if (!tracks || tracks.error) break;

				const tracksToPush = [];

				for (const track of tracks.tracks) {
					const resolved = await this.resolve(track, player, requester);
					if (resolved) tracksToPush.push(resolved);
				}

				if (tracksToPush.length) {
					response = {
						loadType: 'PlaylistLoaded',
						tracks: tracksToPush,
						playlistInfo: {
							duration: tracksToPush.reduce((acc, cur) => acc + cur.duration, 0),
							name: tracks.name || tracksToPush[0]!.title
						}
					};
				}

				break;
			}

			case 'playlist': {
				const tracks = await this.getPlaylist(id!);
				if (!tracks || tracks.error) break;

				const tracksToPush = [];

				for (const track of tracks.tracks) {
					const resolved = await this.resolve(track, player, requester);
					if (resolved) tracksToPush.push(resolved);
				}

				if (tracksToPush.length) {
					response = {
						loadType: 'PlaylistLoaded',
						tracks: tracksToPush,
						playlistInfo: {
							duration: tracksToPush.reduce((acc, cur) => acc + cur.duration, 0),
							name: tracks.name || tracksToPush[0]!.title
						}
					};
				}

				break;
			}

			case 'artist': {
				const tracks = await this.getArtistTopTracks(id!);
				if (!tracks || tracks.error) break;

				const tracksToPush = [];

				for (const track of tracks.tracks) {
					const resolved = await this.resolve(track, player, requester);
					if (resolved) tracksToPush.push(resolved);
				}

				if (tracksToPush.length) {
					response = {
						loadType: 'PlaylistLoaded',
						tracks: tracksToPush,
						playlistInfo: {
							duration: tracksToPush.reduce((acc, cur) => acc + cur.duration, 0),
							name: tracks.name || tracksToPush[0]!.title
						}
					};
				}

				break;
			}

			default:
				break;
		}

		return response;
	}

	// Deezer Search
	public async searchDeezer(query: string): Promise<DeezerSearchResult> {
		const res = await this.makeRequest<DeezerSearchResult>(`/search?q=${query}`);
		return res;
	}

	// Deezer Track
	public async getTrack(id: string): Promise<DeezerCustomResponse> {
		const res = await this.makeRequest<DeezerTrack>(`/track/${id}`).catch(() => null);
		if (!res || res.error) return { tracks: [], error: true };

		return {
			tracks: [res]
		};
	}

	// Deezer Album
	public async getAlbum(id: string): Promise<DeezerCustomResponse> {
		const album = await this.makeRequest<CompleteDeezerAlbum>(`/album/${id}`).catch(() => null);
		if (!album || album.error) return { tracks: [], error: true };

		const tracks = await this.makeRequest<DeezerTrack[]>(`/album/${id}/tracks`);

		return {
			tracks: tracks.slice(0, this.options.albumLimit ?? 50),
			name: album.title,
			thumbnail: album.cover_xl
		};
	}

	// Deezer Playlist
	public async getPlaylist(id: string): Promise<DeezerCustomResponse> {
		const playlist = await this.makeRequest<DeezerPlaylist>(`/playlist/${id}`).catch(() => null);
		if (!playlist || playlist.error) return { tracks: [], error: true };

		const tracks = (
			await Promise.all(playlist.tracks.data.map(x => this.getTrack(`${x.id}`).catch(() => null)))
		)
			.filter(x => !!x)
			.map(x => x!.tracks[0]!);

		return {
			tracks: tracks.slice(0, this.options.playlistLimit ?? 50),
			name: playlist.title,
			thumbnail: playlist.picture_xl
		};
	}

	// Deezer Artist
	public async getArtistTopTracks(id: string): Promise<DeezerCustomResponse> {
		const baseTracks = await this.makeRequest<{ data: PartialDeezerTrack[]; error?: unknown }>(
			`/artist/${id}/top?limit=${this.options.artistLimit || 50}`
		).catch(() => null);
		if (!baseTracks || baseTracks.error) return { tracks: [], error: true };

		const tracks = (
			await Promise.all(baseTracks.data.map(x => this.getTrack(`${x.id}`).catch(() => null)))
		)
			.filter(x => !!x && !x.error)
			.map(x => x!.tracks)
			.flat();

		return {
			tracks: tracks.slice(0, this.options.artistLimit ?? 50),
			name: this.options.templateArtistPopularPlaylist.replaceAll(
				'{artist}',
				baseTracks.data[0]?.artist.name || 'Unknown Artist'
			),
			thumbnail: baseTracks.data[0]?.artist.picture_xl
		};
	}

	// Utilities
	private async build(track: DeezerTrack, data: LavalinkTrack, requester: unknown): Promise<Track> {
		const artists = (track.contributors || []).map(x => ({
			name: x.name,
			avatar: x.picture_big,
			url: x.link
		}));

		return {
			authors: artists,
			duration: data.info.length,
			identifier: `${track.id}`,
			requester,
			thumbnail: track.album.cover_xl || this.manager.options.fallbackThumbnail,
			title: track.title,
			uri: track.link,
			explicit: track.explicit_lyrics,
			isSeekable: data.info.isSeekable,
			isStream: data.info.isStream,
			track: data.track
		};
	}

	private async resolve(
		track: DeezerTrack,
		player: Player,
		requester: unknown
	): Promise<Track | undefined> {
		const platform = this.manager.options.searchOptions.defaultPlatform;
		const src = platform_codes[platform] || 'ytsearch';

		const query = this.options.useISRC
			? `\\"${track.isrc}"\\`
			: `${track.title} - ${track.contributors.map(x => x.name).join(', ')}`;

		const searchParams = new URLSearchParams({
			identifier: `${this.options.useISRC ? 'ytsearch' : src}:${query}`
		});
		let data = await player.node.makeRequest<LavalinkResponse>(
			`/loadtracks?${searchParams.toString()}`
		);

		if (!data.tracks?.length && this.options.useISRC && !this.options.failIfNotFoundWithISRC) {
			const nsp = new URLSearchParams({
				identifier: `${src}:${track.title} - ${track.contributors.map(x => x.name).join(', ')}`
			});
			data = await player.node.makeRequest<LavalinkResponse>(`/loadtracks?${nsp.toString()}`);
		}

		const lavatrack = data.tracks?.[0];
		if (lavatrack) {
			return this.build(track, lavatrack, requester);
		} else return undefined;
	}
}

type SearchType = 'track' | 'playlist' | 'album' | 'artist';

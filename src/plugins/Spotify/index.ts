import type {
	LavalinkResponse,
	LavalinkTrack,
	SearchResult,
	SpotifyOptions,
	Track,
	Unpartial,
	SpotifyAlbum,
	SpotifyAlbumTracks,
	SpotifyArtist,
	SpotifyArtistTracks,
	SpotifyArts,
	SpotifyCustomResponse,
	SpotifyPlaylist,
	SpotifyPlaylistTracks,
	SpotifySearchResult,
	SpotifyTrack,
	SpotifyTokenResponse
} from '../../typings';
import { fetch } from 'undici';
import type { MeongLink } from '../../structures/MeongLink';
import { Utils } from '../../structures/Util';
import type { Player } from '../../structures/Player';
import { platform_codes } from '../../constants';

export class Spotify {
	private BASE_URL = 'https://api.spotify.com/v1';
	private regexp =
		/(?:https:\/\/open\.spotify\.com\/|spotify:)(?:.+)?(track|playlist|album|artist)[\/:]([A-Za-z0-9]+)/;

	public ready = false;
	public token = '';
	public authorization: string;

	public constructor(public options: Unpartial<SpotifyOptions>, public manager: MeongLink) {
		this.authorization = `Basic ${Buffer.from(
			`${options.clientId}:${options.clientSecret}`
		).toString('base64')}`;

		void this.renew();
	}

	// Spotify token request
	private async renew() {
		const expiresIn = await this.renewToken();
		setTimeout(
			() =>
				this.renew().catch(() =>
					this.manager.emit('Debug', '[meonglink#Spotify] Error while renewing Spotify token :c')
				),
			expiresIn
		);
	}

	private async renewToken() {
		const { data }: { data: SpotifyTokenResponse } = await fetch(
			'https://accounts.spotify.com/api/token?grant_type=client_credentials',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
					'Authorization': this.authorization
				}
			}
		)
			.then(x => x.json())
			.then(x => ({ data: x as any }))
			.catch(() => {
				return { data: { access_token: null, expires_in: null } };
			});

		const { access_token, expires_in } = data;
		if (!access_token || !expires_in) {
			throw new Error('Invalid Spotify client.');
		}

		this.token = `Bearer ${access_token}`;
		if (!this.ready) this.ready = true;
		this.manager.emit('Debug', '[meonglink#Spotify] Spotify token renewed.');
		return expires_in * 1000;
	}

	// Main search function
	public async search(
		player: Player,
		query: string,
		requester: unknown,
		type?: SearchType
	): Promise<SearchResult> {
		if (!this.ready) throw new Error('Spotify is not ready yet.');
		if (!player.node?.connected) throw new Error('Player node is not connected.');

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
			const search = await this.searchSpotify(query, type, 1);
			const item = search.items[0]!;

			if (
				this.isTrack(item) ||
				this.isAlbum(item) ||
				this.isArtist(item) ||
				this.isPlaylist(item)
			) {
				id = item.id;
				type = this.isTrack(item)
					? 'track'
					: this.isAlbum(item)
					? 'album'
					: this.isPlaylist(item)
					? 'playlist'
					: 'artist';
			}
		}

		switch (type) {
			case 'track': {
				const track = await this.getTrack(id!);
				if (!track || track.error) break;

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
				const tracks = await this.getAlbumTracks(id!);
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
				const tracks = await this.getPlaylistTracks(id!);
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

	// Spotify API search
	public async searchSpotify(
		query: string,
		type: 'track' | 'playlist' | 'album' | 'artist',
		limit = 1
	) {
		const typePlural = `${type}s` as const;

		const params = new URLSearchParams({
			q: query,
			type,
			market: this.options.market,
			limit: limit.toString()
		});

		const data: { [k: string]: SpotifySearchResult<typeof typePlural> } = await fetch(
			`https://api.spotify.com/v1/search?${params.toString()}`,
			{
				method: 'GET',
				headers: {
					Authorization: this.token
				}
			}
		).then(x => x.json() as Promise<any>);

		return data[typePlural]!;
	}

	// Spotify track search
	public async getTrack(id: string): Promise<SpotifyCustomResponse> {
		const res = await this.makeRequest<SpotifyTrack>(`/tracks/${id}`).catch(() => null);
		if (!res) return { tracks: [], error: true };
		return {
			tracks: [res]
		};
	}

	// Spotify album search
	public async getAlbumTracks(id: string): Promise<SpotifyCustomResponse> {
		const album = await this.makeRequest<SpotifyAlbum>(`/albums/${id}`).catch(() => null);
		if (!album) return { tracks: [], error: true };
		const tracks = await Promise.all(
			Utils.filterNullOrUndefined(album.tracks.items).map(item => this.getTrack(item.id))
		);
		let next = album.tracks.next;

		while (
			next != null &&
			(!this.options.albumLimit ? true : tracks.length < (this.options.albumLimit || 50))
		) {
			const nextPage = await this.makeRequest<SpotifyAlbumTracks>(next!);
			const nextTracks = await Promise.all(
				Utils.filterNullOrUndefined(nextPage.items).map(item => this.getTrack(item.id))
			);
			tracks.push(...nextTracks);
			next = nextPage.next;
		}

		return {
			tracks: tracks.map(x => x.tracks[0]!).slice(0, this.options.albumLimit || 50),
			name: album.name,
			thumbnail: this.getThumbnail(album.images)
		};
	}

	// Spotify playlist search
	public async getPlaylistTracks(id: string): Promise<SpotifyCustomResponse> {
		const playlist = await this.makeRequest<SpotifyPlaylist>(`/playlists/${id}`).catch(() => null);
		if (!playlist) return { tracks: [], error: true };
		const tracks = Utils.filterNullOrUndefined(playlist.tracks.items).map(x => x.track);

		let next = playlist.tracks.next;

		while (
			next != null &&
			(!this.options.albumLimit ? true : tracks.length < (this.options.playlistLimit || 50))
		) {
			const nextPage = await this.makeRequest<SpotifyPlaylistTracks>(next!);
			const nextTracks = Utils.filterNullOrUndefined(nextPage.items).map(x => x.track);

			tracks.push(...nextTracks);
			next = nextPage.next;
		}

		return {
			tracks,
			name: playlist.name,
			thumbnail: playlist.images.sort((a, b) => b.width - a.width)[0]?.url
		};
	}

	// Spotify artist top tracks search
	public async getArtistTopTracks(id: string): Promise<SpotifyCustomResponse> {
		const artist = await this.makeRequest<SpotifyArtist>(`/artists/${id}`).catch(() => null);
		if (!artist) return { tracks: [], error: true };
		const playlist = await this.makeRequest<SpotifyArtistTracks>(`/artists/${id}/top-tracks`);
		const tracks = Utils.filterNullOrUndefined(playlist.tracks);

		return {
			tracks: tracks.slice(0, this.options.artistLimit || 50),
			name: this.options.templateArtistPopularPlaylist.replace('{artist}', artist.name),
			thumbnail: artist.images.sort((a, b) => b.width - a.width)[0]?.url
		};
	}

	// Spotify artist search
	public async getArtistInfo(id: string): Promise<SpotifyArtist | null> {
		try {
			return await this.makeRequest<SpotifyArtist>(`/artists/${id}`);
		} catch {
			return null;
		}
	}

	// Utilities
	private async build(
		track: SpotifyTrack,
		data: LavalinkTrack,
		requester: unknown
	): Promise<Track> {
		const artists = (
			await Promise.all(track.artists.map(artist => this.getArtistInfo(artist.id)))
		).map(x => (!!x ? x : { name: 'Unknown', external_urls: { spotify: '' }, images: [] }));

		return {
			authors: artists.map(artist => ({
				name: artist.name,
				url: artist.external_urls.spotify,
				avatar: artist.images.sort((a, b) => b.width - a.width)[0]?.url
			})),
			duration: data.info.length,
			identifier: track.id,
			requester,
			thumbnail:
				track.album.images.sort((a, b) => b.width - a.width)[0]?.url ||
				this.manager.options.fallbackThumbnail,
			title: track.name,
			uri: track.external_urls.spotify,
			explicit: track.explicit,
			isSeekable: data.info.isSeekable,
			isStream: data.info.isStream,
			track: data.track
		};
	}

	private async resolve(
		track: SpotifyTrack,
		player: Player,
		requester: unknown
	): Promise<Track | undefined> {
		const platform = this.manager.options.searchOptions.defaultPlatform;
		const src = platform_codes[platform] || 'ytsearch';

		const query = this.options.useISRC
			? `\\"${track.external_ids.isrc}"\\`
			: `${track.name} - ${track.artists.map(x => x.name).join(', ')}`;

		const searchParams = new URLSearchParams({
			identifier: `${this.options.useISRC ? 'ytsearch' : src}:${query}`
		});
		let data = await player.node.makeRequest<LavalinkResponse>(
			`/loadtracks?${searchParams.toString()}`
		);

		if (!data.tracks?.length && this.options.useISRC && !this.options.failIfNotFoundWithISRC) {
			const nsp = new URLSearchParams({
				identifier: `${src}:${track.name} - ${track.artists.map(x => x.name).join(', ')}`
			});
			data = await player.node.makeRequest<LavalinkResponse>(`/loadtracks?${nsp.toString()}`);
		}

		const lavatrack = data.tracks?.[0];
		if (lavatrack) {
			return this.build(track, lavatrack, requester);
		} else return undefined;
	}

	private isTrack(data: Record<string, any>): data is SpotifyTrack {
		return data['type'] == 'track';
	}

	private isAlbum(data: Record<string, any>): data is SpotifyAlbum {
		return data['type'] == 'album';
	}

	private isPlaylist(data: Record<string, any>): data is SpotifyPlaylist {
		return data['type'] == 'playlist';
	}

	private isArtist(data: Record<string, any>): data is SpotifyArtist {
		return data['type'] == 'artist';
	}

	// Request function
	private async makeRequest<T>(endpoint: string): Promise<T> {
		const url = endpoint.startsWith('https://')
			? endpoint
			: `${this.BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

		const res: any = await fetch(
			`${url}${endpoint.includes('?') ? '&' : '?'}market=${this.options.market}`,
			{
				method: 'GET',
				headers: {
					Authorization: this.token
				}
			}
		).then(x => x.json());

		return res;
	}

	// Get biggest thumbnail
	private getThumbnail(images: SpotifyArts[]): string {
		return (
			images.sort((a, b) => b.width - a.width)[0]?.url || this.manager.options.fallbackThumbnail
		);
	}
}

type SearchType = 'track' | 'playlist' | 'album' | 'artist';

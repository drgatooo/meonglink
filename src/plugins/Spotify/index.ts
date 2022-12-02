import type {
	LavalinkResponse,
	LavalinkTrack,
	SearchResult,
	SpotifyOptions,
	Track,
	Unpartial
} from '../../typings';
import type {
	SpotifyAlbum,
	SpotifyAlbumTracks,
	SpotifyArtist,
	SpotifyArtistTracks,
	SpotifyArts,
	SpotifyCustomResponse,
	SpotifyPlaylist,
	SpotifyPlaylistTracks,
	SpotifySearchResult,
	SpotifyTrack
} from './typings';
import axios from 'axios';
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
		setTimeout(() => this.renew(), expiresIn);
	}
	private async renewToken() {
		const { data }: { data: SpotifyTokenResponse } = await axios({
			method: 'POST',
			url: 'https://accounts.spotify.com/api/token',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
				'Authorization': this.authorization
			},
			params: {
				grant_type: 'client_credentials'
			}
		}).catch(() => {
			return { data: { access_token: null, expires_in: null } };
		});

		const { access_token, expires_in } = data;
		if (!access_token || !expires_in) {
			throw new Error('Invalid Spotify client.');
		}

		this.token = `Bearer ${access_token}`;
		if (!this.ready) this.ready = true;
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

		const {
			data
		}: {
			data: {
				[k: string]: SpotifySearchResult<typeof typePlural>;
			};
		} = await axios({
			method: 'GET',
			url: 'https://api.spotify.com/v1/search',
			headers: {
				Authorization: this.token
			},
			params: {
				q: query,
				type,
				market: this.options.market,
				limit
			}
		});

		return data[typePlural]!;
	}

	// Spotify track search
	private async getTrack(id: string): Promise<SpotifyCustomResponse> {
		const res = await this.makeRequest<SpotifyTrack>(`/tracks/${id}`);
		return {
			tracks: [res]
		};
	}

	// Spotify album search
	private async getAlbumTracks(id: string): Promise<SpotifyCustomResponse> {
		const album = await this.makeRequest<SpotifyAlbum>(`/albums/${id}`);
		const tracks = await Promise.all(
			Utils.filterNullOrUndefined(album.tracks.items).map(item => this.getTrack(item.id))
		);
		let next = album.tracks.next;
		let page = 1;

		while (
			next != null &&
			(!this.options.albumLimit ? true : page < (this.options.albumLimit || 50))
		) {
			const nextPage = await this.makeRequest<SpotifyAlbumTracks>(next!);
			const nextTracks = await Promise.all(
				Utils.filterNullOrUndefined(nextPage.items).map(item => this.getTrack(item.id))
			);
			tracks.push(...nextTracks);
			next = nextPage.next;
			page++;
		}

		return {
			tracks: tracks.map(x => x.tracks[0]!),
			name: album.name,
			thumbnail: this.getThumbnail(album.images)
		};
	}

	// Spotify playlist search
	private async getPlaylistTracks(id: string): Promise<SpotifyCustomResponse> {
		const playlist = await this.makeRequest<SpotifyPlaylist>(`/playlists/${id}`);
		const tracks = Utils.filterNullOrUndefined(playlist.tracks.items).map(x => x.track);

		let next = playlist.tracks.next;
		let page = 1;

		while (
			next != null &&
			(!this.options.albumLimit ? true : page < (this.options.albumLimit || 50))
		) {
			const nextPage = await this.makeRequest<SpotifyPlaylistTracks>(next!);
			const nextTracks = Utils.filterNullOrUndefined(nextPage.items).map(x => x.track);

			tracks.push(...nextTracks);
			next = nextPage.next;
			page++;
		}

		return {
			tracks,
			name: playlist.name,
			thumbnail: playlist.images.sort((a, b) => b.width - a.width)[0]?.url
		};
	}

	// Spotify artist top tracks search
	private async getArtistTopTracks(id: string): Promise<SpotifyCustomResponse> {
		const artist = await this.makeRequest<SpotifyArtist>(`/artists/${id}`);
		const playlist = await this.makeRequest<SpotifyArtistTracks>(`/artists/${id}/top-tracks`);
		const tracks = Utils.filterNullOrUndefined(playlist.tracks);

		return {
			tracks,
			name: this.options.templateArtistPopularPlaylist.replace('{artist}', artist.name),
			thumbnail: artist.images.sort((a, b) => b.width - a.width)[0]?.url
		};
	}

	// Spotify artist search
	public getArtistInfo(id: string): Promise<SpotifyArtist> {
		return this.makeRequest<SpotifyArtist>(`/artists/${id}`);
	}

	// Utilities
	private async build(
		track: SpotifyTrack,
		data: LavalinkTrack,
		requester: unknown
	): Promise<Track> {
		const artists = await Promise.all(track.artists.map(artist => this.getArtistInfo(artist.id)));

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
		const src = platform_codes[platform] || 'ytmsearch';

		const query = this.options.useISRC
			? track.external_ids.isrc
			: `${track.name} - ${track.artists.map(x => x.name).join(', ')}`;

		const searchParams = new URLSearchParams({
			identifier: `${src}:${query}`
		});
		let data = await player.node.makeRequest<LavalinkResponse>(
			`/loadtracks?${searchParams.toString()}`
		);

		if (!data.tracks?.length && this.options.useISRC && !this.options.failIfNotFoundWithISRC) {
			const nsp = new URLSearchParams({
				identifier: `${track.name} - ${track.artists.map(x => x.name).join(', ')}`
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
		const res = await axios({
			method: 'GET',
			url: endpoint.startsWith('https://')
				? endpoint
				: `${this.BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`,
			headers: {
				Authorization: this.token
			},
			params: {
				market: this.options.market
			}
		});

		return res.data;
	}

	// Get biggest thumbnail
	private getThumbnail(images: SpotifyArts[]): string {
		return (
			images.sort((a, b) => b.width - a.width)[0]?.url || this.manager.options.fallbackThumbnail
		);
	}
}

export interface SpotifyTokenResponse {
	access_token: string | null;
	expires_in: number | null;
}

type SearchType = 'track' | 'playlist' | 'album' | 'artist';

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

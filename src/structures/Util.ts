import type { LavalinkTrack, Track } from '../typings';

export class Utils {
	public static buildTrackFromRaw(
		raw: LavalinkTrack,
		requester: any,
		data: Record<string, any> = {}
	): typeof raw extends undefined ? undefined : Track {
		// @ts-ignore
		if (!raw) return undefined;

		return {
			authors: Array.isArray(data['artists'])
				? data['artists']
				: [
						{
							name: data['artist']?.name ?? raw.info.author,
							avatar: data['artist']?.['avatar'],
							url: data['artist']?.['url']
						}
				  ],
			duration: raw.info.length,
			identifier: data['identifier'] ?? raw.info.identifier,
			isSeekable: raw.info.isSeekable,
			isStream: raw.info.isStream,
			thumbnail: data['thumbnail'] ?? raw.info.thumbnail,
			title: data['title'] ?? raw.info.title,
			track: raw.track,
			uri: data['uri'] ?? raw.info.uri,
			explicit: data['explicit'] ?? false,
			requester
		};
	}

	public static sourceFromUrl(url: string) {
		try {
			if (!url) return undefined;
			const parsed = new URL(url);

			switch (parsed.hostname) {
				case 'www.youtube.com':
				case 'youtube.com':
				case 'm.youtube.com':
				case 'music.youtube.com':
				case 'youtu.be':
					return 'youtube';

				case 'soundcloud.com':
				case 'm.soundcloud.com':
					return 'soundcloud';

				case 'open.spotify.com':
					return 'spotify';

				case 'music.apple.com':
					return 'apple';

				case 'deezer.com':
				case 'www.deezer.com':
					return 'deezer';

				default:
					return 'url';
			}
		} catch {
			return 'query';
		}
	}

	public static filterYoutube(track: LavalinkTrack) {
		try {
			const parsed = new URL(track.info.uri);
			return parsed.hostname == 'www.youtube.com' || parsed.hostname == 'youtube.com';
		} catch {
			return false;
		}
	}

	public static validate(track: Track | Track[]) {
		if (!Array.isArray(track)) {
			track = [track];
		}

		for (const t of track) {
			if ('string' != typeof t.track) return false;
			if ('string' != typeof t.title) return false;
			if (!Array.isArray(t.authors)) return false;
			if ('number' != typeof t.duration) return false;
			if ('string' != typeof t.identifier) return false;
			if ('boolean' != typeof t.isSeekable) return false;
			if ('boolean' != typeof t.isStream) return false;
			if ('string' != typeof t.thumbnail) return false;
			if ('string' != typeof t.uri) return false;
			if ('boolean' != typeof t.explicit) return false;
		}

		return true;
	}

	public static filterNullOrUndefined<T>(array: (T | undefined | null)[]): T[] {
		return array.filter(x => !!x) as T[];
	}

	public static toDurationString(ms: number) {
		const seconds = Math.floor(ms / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);

		const s = seconds % 60;
		const m = minutes % 60;
		const h = hours % 24;

		return `${h > 0 ? `${Utils.padNumber(h)}:` : ''}${Utils.padNumber(m)}:${Utils.padNumber(s)}`;
	}

	public static padNumber(num: number, length = 2) {
		return `${'0'.repeat(length)}${num}`.slice(-length);
	}
}

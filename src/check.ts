import type { MeongLinkOptions, NodeOptions } from '.';

export function checkOptions(options: MeongLinkOptions) {
	if (!Array.isArray(options.nodes) || !options.nodes.length) {
		throw new Error('MeongLinkOptions.nodes must be an array with at least one node.');
	}

	options.nodes.forEach((node, index) => {
		if (options.nodes.some((n, i) => i !== index && n.host === node.host)) {
			throw new Error(`Node #${index} is duplicated.`);
		}

		const { error } = checkNode(node);
		if (error) {
			throw new Error(`MeongLinkOptions.nodes[${index}] is invalid: ${error}`);
		}
	});

	if (options.shards && typeof options.shards !== 'number') {
		throw new Error('MeongLinkOptions.shards must be a number.');
	}

	if (options.clientId && typeof options.clientId !== 'string') {
		throw new Error('MeongLinkOptions.clientId must be a string.');
	}

	if (options.clientName && typeof options.clientName !== 'string') {
		throw new Error('MeongLinkOptions.clientName must be a string.');
	}

	if (options.searchOptions) {
		if (typeof options.searchOptions !== 'object') {
			throw new Error('MeongLinkOptions.searchOptions must be an object.');
		}

		if (
			!options.searchOptions.defaultPlatform ||
			typeof options.searchOptions.defaultPlatform !== 'string'
		) {
			throw new Error('MeongLinkOptions.searchOptions.defaultPlatform must be a string.');
		}

		if (options.searchOptions.spotify) {
			if (typeof options.searchOptions.spotify !== 'object') {
				throw new Error('MeongLinkOptions.searchOptions.spotify must be an object.');
			}

			if (typeof options.searchOptions.spotify.clientId !== 'string') {
				throw new Error('MeongLinkOptions.searchOptions.spotify.clientId must be a string.');
			}

			if (typeof options.searchOptions.spotify.clientSecret !== 'string') {
				throw new Error('MeongLinkOptions.searchOptions.spotify.clientSecret must be a string.');
			}

			if (
				options.searchOptions.spotify.useISRC &&
				typeof options.searchOptions.spotify.useISRC !== 'boolean'
			) {
				throw new Error('MeongLinkOptions.searchOptions.spotify.useISRC must be a boolean.');
			}

			if (
				options.searchOptions.spotify.failIfNotFoundWithISRC &&
				typeof options.searchOptions.spotify.failIfNotFoundWithISRC !== 'boolean'
			) {
				throw new Error(
					'MeongLinkOptions.searchOptions.spotify.failIfNotFoundWithISRC must be a boolean.'
				);
			}

			if (
				options.searchOptions.spotify.market &&
				typeof options.searchOptions.spotify.market !== 'string'
			) {
				throw new Error('MeongLinkOptions.searchOptions.spotify.market must be a string.');
			}

			if (
				options.searchOptions.spotify.playlistLimit &&
				typeof options.searchOptions.spotify.playlistLimit !== 'number'
			) {
				throw new Error('MeongLinkOptions.searchOptions.spotify.playlistLimit must be a number.');
			}

			if (
				options.searchOptions.spotify.albumLimit &&
				typeof options.searchOptions.spotify.albumLimit !== 'number'
			) {
				throw new Error('MeongLinkOptions.searchOptions.spotify.albumLimit must be a number.');
			}

			if (
				options.searchOptions.spotify.artistLimit &&
				typeof options.searchOptions.spotify.artistLimit !== 'number'
			) {
				throw new Error('MeongLinkOptions.searchOptions.spotify.artistLimit must be a number.');
			}
		}

		if (options.searchOptions.appleMusic) {
			if (typeof options.searchOptions.appleMusic !== 'object') {
				throw new Error('MeongLinkOptions.searchOptions.appleMusic must be an object.');
			}

			if (
				options.searchOptions.appleMusic.playlistLimit &&
				typeof options.searchOptions.appleMusic.playlistLimit !== 'number'
			) {
				throw new Error(
					'MeongLinkOptions.searchOptions.appleMusic.playlistLimit must be a number.'
				);
			}

			if (
				options.searchOptions.appleMusic.albumLimit &&
				typeof options.searchOptions.appleMusic.albumLimit !== 'number'
			) {
				throw new Error('MeongLinkOptions.searchOptions.appleMusic.albumLimit must be a number.');
			}

			if (
				options.searchOptions.appleMusic.artistLimit &&
				typeof options.searchOptions.appleMusic.artistLimit !== 'number'
			) {
				throw new Error('MeongLinkOptions.searchOptions.appleMusic.artistLimit must be a number.');
			}
		}

		if (options.searchOptions.deezer) {
			if (typeof options.searchOptions.deezer !== 'object') {
				throw new Error('MeongLinkOptions.searchOptions.deezer must be an object.');
			}

			if (
				options.searchOptions.deezer.playlistLimit &&
				typeof options.searchOptions.deezer.playlistLimit !== 'number'
			) {
				throw new Error('MeongLinkOptions.searchOptions.deezer.playlistLimit must be a number.');
			}

			if (
				options.searchOptions.deezer.albumLimit &&
				typeof options.searchOptions.deezer.albumLimit !== 'number'
			) {
				throw new Error('MeongLinkOptions.searchOptions.deezer.albumLimit must be a number.');
			}

			if (
				options.searchOptions.deezer.artistLimit &&
				typeof options.searchOptions.deezer.artistLimit !== 'number'
			) {
				throw new Error('MeongLinkOptions.searchOptions.deezer.artistLimit must be a number.');
			}
		}
	}

	if (typeof options.sendFunction != 'function') {
		throw new Error('MeongLinkOptions.sendFunction must be a function.');
	}

	if (options.fallbackThumbnail && typeof options.fallbackThumbnail != 'string') {
		throw new Error('MeongLinkOptions.fallbackThumbnail must be a string.');
	}
}

export function checkNode(node: NodeOptions) {
	if (typeof node.host != 'string') {
		return {
			error: 'Node.host must be a string.'
		};
	}

	if (typeof node.password != 'string') {
		return {
			error: 'Node.password must be a string.'
		};
	}

	if (node.port && typeof node.port != 'number') {
		return {
			error: 'Node.port must be a number.'
		};
	}

	if (node.secure && typeof node.secure != 'boolean') {
		return {
			error: 'Node.secure must be a boolean.'
		};
	}

	return { error: undefined, success: true };
}

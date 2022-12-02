import type { Track } from '../typings';
import { Utils } from './Util';

export class Queue extends Array<Track> {
	public get duration(): number {
		const current = this.current?.duration ?? 0;
		return this.reduce((acc: number, cur: Track) => acc + (cur.duration || 0), current);
	}

	public get totalLength(): number {
		return this.length + (this.current ? 1 : 0);
	}

	public current: Track | null = null;
	public previous: Track[] = [];

	public add(track: Track | Track[], offset?: number): void {
		if (!Utils.validate(track)) {
			throw new RangeError('Track must be a "Track" or "Track[]".');
		}

		if (!this.current) {
			if (!Array.isArray(track)) {
				this.current = track;
				return;
			} else {
				this.current = (track = [...track]).shift() ?? null;
			}
		}

		if (typeof offset !== 'undefined' && typeof offset === 'number') {
			if (isNaN(offset)) {
				throw new RangeError('Offset must be a number.');
			}

			if (offset < 0 || offset > this.length) {
				throw new RangeError(`Offset must be or between 0 and ${this.length}.`);
			}
		}

		if (typeof offset === 'undefined' && typeof offset !== 'number') {
			if (track instanceof Array) this.push(...track);
			else this.push(track);
		} else {
			if (track instanceof Array) this.splice(offset, 0, ...track);
			else this.splice(offset, 0, track);
		}
	}

	/**
	 * Removes a track from the queue. Defaults to the first track, returning the removed track, EXCLUDING THE `current` TRACK.
	 * @param [position=0]
	 */
	public remove(position?: number): Track[];

	/**
	 * Removes an amount of tracks using a exclusive start and end exclusive index, returning the removed tracks, EXCLUDING THE `current` TRACK.
	 * @param start
	 * @param end
	 */
	public remove(start: number, end: number): Track[];
	public remove(startOrPosition = 0, end?: number): Track[] {
		if (typeof end !== 'undefined') {
			if (isNaN(Number(startOrPosition))) {
				throw new RangeError(`Missing "start" parameter.`);
			} else if (isNaN(Number(end))) {
				throw new RangeError(`Missing "end" parameter.`);
			} else if (startOrPosition >= end) {
				throw new RangeError('Start can not be bigger than end.');
			} else if (startOrPosition >= this.length) {
				throw new RangeError(`Start can not be bigger than ${this.length}.`);
			}

			return this.splice(startOrPosition, end - startOrPosition);
		}

		return this.splice(startOrPosition, 1);
	}

	/** Clears the queue. */
	public clear(): void {
		this.splice(0);
	}

	/** Shuffles the queue. */
	public shuffle(): void {
		for (let i = this.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[this[i], this[j]] = [this[j]!, this[i]!];
		}
	}
}

// Variables usable in title / description / tags (see template.ts).
export const VARS = ['name', 'bpm', 'n', 'date', 'year', 'filename', 'producer', 'txt', 'track1', 'trackcount', 'artists'];
export const VIDEO_EXT = /\.(mp4|mov|mkv|avi|webm|m4v|wmv|flv|3gp|mpe?g)$/i;
export const TXT_EXT = /\.txt$/i;
export const IMG_EXT = /\.(jpe?g|png|gif|bmp|webp)$/i;
export const THUMB_MAX = 2 * 1024 * 1024; // YouTube accepts thumbnails up to 2 MB
export const DESC_MAX = 5000;
export const SCHEDULE_MIN_LEAD = 15 * 60 * 1000; // YouTube needs roughly 15 minutes of lead time
export const TITLE_MAX = 100;

export type Visibility = 'PRIVATE' | 'UNLISTED' | 'PUBLIC';
export const VISIBILITIES: Visibility[] = ['PRIVATE', 'UNLISTED', 'PUBLIC'];

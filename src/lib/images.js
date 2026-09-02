// Single source of truth for the image host.
//
// Images live in the Backblaze B2 bucket `staging-briansmasonry-img`, served
// through Cloudflare at img.staging.briansmasonry.net. A transform rule on the
// zone rewrites /<path> to /file/staging-briansmasonry-img/<path>, so the paths
// used at each call site are the original wp-content/uploads paths, unchanged —
// which is what keeps the gate 18 redirects one-to-one.
//
// Never reference *.backblazeb2.com directly: traffic has to go through
// Cloudflare or the client is billed for every image view.
export const IMG = 'https://img.staging.briansmasonry.net';

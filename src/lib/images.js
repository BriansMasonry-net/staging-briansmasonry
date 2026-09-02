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
//
// This hostname is permanent, not staging-only. The conventional
// img.briansmasonry.net is already taken by the gallery project — it has its
// own bucket (briansmasonry-img) and its own transform rule on the same zone —
// so this site keeps img.staging.briansmasonry.net through go-live. Nothing
// here changes at gate 13.
export const IMG = 'https://img.staging.briansmasonry.net';

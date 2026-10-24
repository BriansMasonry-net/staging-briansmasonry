// Single source of truth for the image host.
//
// Images live in the Backblaze B2 bucket `briansmasonry-img`, served through
// Cloudflare at img.briansmasonry.net. A transform rule on the zone rewrites
// /<path> to /file/briansmasonry-img/<path>, so the paths used at each call
// site are the original wp-content/uploads paths, unchanged — which is what
// keeps the gate 14 images redirect one-to-one.
//
// Never reference *.backblazeb2.com directly: traffic has to go through
// Cloudflare or the client is billed for every image view.
//
// The bucket also holds a dozen `_derivatives/` files left by the retired
// gallery project (now gallery.briansmasonry.net, on Railway). They share no
// keys with this site's images; leave them where they are.
//
// img.staging.briansmasonry.net (bucket staging-briansmasonry-img) is the
// earlier copy of the same files and still answers, but nothing references it.
export const IMG = 'https://img.briansmasonry.net';

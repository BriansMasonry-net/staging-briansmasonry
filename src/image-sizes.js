/* ------------------------------------------------------------------
   Intrinsic pixel dimensions of every image the site puts in an <img>,
   keyed by filename. Measured from the files themselves, not from the
   markup the live site happens to emit.

   Every <img> spreads size(src) so the browser can reserve the correct
   box before the file arrives. The attributes only set the aspect ratio
   here: `img { max-width: 100%; height: auto }` in Base.astro means CSS
   still decides the rendered size.

   Adding an image without an entry fails the build rather than shipping
   an <img> with no dimensions.
   ------------------------------------------------------------------ */

const SIZES = {
  'BOA-2024.png':                                 [1920, 2112],
  'Brians-Masonry-About-Us-Image.webp':           [1200, 1200],
  'Brians-Masonry-Logo-Only0-e1737996026967.webp': [1050, 368],
  'Brick-Work.webp':                              [512, 512],
  'b10.jpg':                                      [640, 480],
  'b2.jpg':                                       [480, 640],
  'b3.jpg':                                       [640, 480],
  'b4.jpg':                                       [640, 480],
  'b5.jpg':                                       [480, 640],
  'b6.jpg':                                       [480, 640],
  'b7.jpg':                                       [480, 640],
  'b8.jpg':                                       [640, 480],
  'bm-about-us.jpg':                              [2000, 2000],
  'brickwall.png':                                [512, 512],
  'chimney-e1738015791924.png':                   [747, 740],
  'chimney-new.png':                              [512, 512],
  'deck.png':                                     [512, 512],
  'historic-site-new.png':                        [512, 512],
  'homestars-BOA-2023.webp':                      [931, 1024],
  'homestars-boa-2022-black.webp':                [1113, 1224],
  'pillar-after.png':                             [750, 1334],
  'pillar-before.png':                            [750, 1334],
  'retaining-walls.png':                          [512, 512],
  'road.png':                                     [512, 512],
  'stones.png':                                   [512, 512],
  'tower-after.jpg':                              [1119, 2000],
  'tower-before.jpg':                             [750, 1334],
  'trowel-1.png':                                 [225, 225],
  'verified-badge.png':                           [324, 312],
  'window-sills.png':                             [512, 512],
};

/** width/height attributes for an image URL. Spread onto the <img>. */
export function size(src) {
  const file = String(src).split('/').pop().split('?')[0];
  const dims = SIZES[file];
  if (!dims) {
    throw new Error(
      `image-sizes: no dimensions recorded for "${file}". ` +
      `Measure the file and add it to src/image-sizes.js.`
    );
  }
  return { width: dims[0], height: dims[1] };
}

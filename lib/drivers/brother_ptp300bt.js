'use strict';

const fs = require('fs');
const AppError = require('../app_error');
//const glob = require('glob');
//const debug = require('debug')('print');
const { PNG } = require('pngjs');


module.exports.mm2px = (mm) => {
  if (mm === 12) return 64;
  if (mm === 9) return 48;
  if (mm === 6) return 32;

  throw new AppError(`Invalid type width (${mm}). Allowed values are 6, 9, 12.`);
};

// Pixels on print head
const max_width_px = 64;
module.exports.max_width_px = max_width_px;

// End feed (space between print head and knife)
const end_feed_px = 50;

// Start feed (printer always feed before start printing)
const start_feed_px = 100;
module.exports.start_feed_px = start_feed_px;

// Minimal possible length (space between knife and from hole + 5mm)
// Needed to guarantee extraction
module.exports.min_length_px = 120;

module.exports.description = 'Brother PT-P300BT';


function get_serial() {
  // TODO: check that it is a recognized printer
  return fs.existsSync('/dev/rfcomm0') ? '/dev/rfcomm0' : null;
}


module.exports.find = () => Boolean(get_serial());


module.exports.print = async (image/*, args*/) => {
  const dev = get_serial();
  if (!dev) throw new AppError('Can\'t find device');

  const png = PNG.sync.read(image);

  // Protocol requires 128 points per line regardless of actual image size
  // Print head is placed in the middle (32 dummy points from rfcoboth sides)
  const protocol_width = 128;

  // Center image to support narrow types automatically.
  const width = png.width;
  let height, src_offset, dst_offset;

  if (png.height > max_width_px) {
    height = max_width_px;
    src_offset = Math.floor((png.height - max_width_px) / 2);
    dst_offset = 0;
  } else {
    height = png.height;
    src_offset = 0;
    dst_offset = Math.floor((max_width_px - png.height) / 2);
  }

  let label_rows = [];

  for (let x = 0; x < width; x++) {
    const row = (new Array(protocol_width / 8)).fill(0);

    for (let y = 0; y < height; y++) {
      // `y` should be mirrored
      const val = png.data[(x + ((height - 1 - y) + src_offset) * width) * 4];
      const bit = val > 127 ? 0 : 1;
      let y_out = 32 + y + dst_offset;
      row[y_out >> 3] = row[y_out >> 3] | (bit << (7 - (y_out & 0x7)));
    }

    label_rows.unshift(row);
  }

  // Feed to knife
  for (let i = 0; i < end_feed_px; i++) label_rows.push(Array(protocol_width / 8).fill(0));

  const high = (num) => (num >> 8) & 0xFF;
  const low  = (num) => num & 0xFF;

  // Sources:
  // https://gist.github.com/stecman/ee1fd9a8b1b6f0fdd170ee87ba2ddafd
  // https://gist.github.com/dogtopus/64ae743825e42f2bb8ec79cea7ad2057
  // https://github.com/robby-cornelissen/pt-p710bt-label-maker
  // http://www.undocprint.org/formats/page_description_languages/brother_p-touch
  // http://etc.nkadesign.com/uploads/Printers/95CRRASE.pdf

  let data = []

    // 64 bytes of 0x0 (to clear print buffer?)
    .concat(Array(64).fill(0))

    // Initialise Clear print buffer
    // ESC @
    .concat([ 0x1B, 0x40 ])

    // Enter raster mode (aka. PTCBP)
    // ESC i a #
    .concat([ 0x1B, 0x69, 0x61, 0x01 ])

    // Set media & quality
    // ESC i z #1 #2 #3 #4 #5 #6 NUL NUL NUL NUL
    // #1, bit 6: Print quality: 0=fast, 1=high
    // #2, bit 0: Media type: 0=continuous roll, 1=pre-cut labels
    // #3: Tape width in mm
    // #4: Label height in mm (0 for continuous roll)
    // #5 #6: Page consists of N=#5+256*#6 pixel lines
    .concat([ 0x1B, 0x69, 0x7A ])
    .concat([ 0xC4, 0x01 ])
    .concat([ 0x0C ])
    .concat([ 0x00 ])
    .concat([ low(label_rows.length), high(label_rows.length) ])
    .concat([ 0x00, 0x00, 0x00, 0x00 ])

    // Set half cut bit 2: 0=full cut, 1=half cut
    // ESC i K #
    .concat([ 0x1B, 0x69, 0x4B, 0x08 ])

    // Set mode bit 0-4: Feed amount (default=large): 0-7=none, 8-11=small, 12-25=medium, 26-31=large
    // bit 6: Auto cut/cut mark (default=on): 0=off, 1=on
    // bit 7: Mirror print (default=off): 0=off, 1=on.
    // (note that it seems that QL devices do not reverse the data stream themselves, but rely on the driver doing it!)
    // ESC i M #
    .concat([ 0x1B, 0x69, 0x4D, 0x00 ])

    // Set size of right(?) margin to N=#1+256*#2 pixels
    // ESC i d #1 #2
    .concat([ 0x1B, 0x69, 0x64, 0x00, 0x00 ])

    // Set compression #: 0 - no compression, 2 - TIFF
    // M #
    .concat([ 0x4D, 0x00 ])

    // Send raster line data consists of N=#1+256*#2 bytes of raster data.
    // G #1 #2 [data]
    .concat(label_rows.map(row =>
      [ 0x47, low(row.length), high(row.length) ].concat(row)
    ).flat())

    // Eject Print buffer data and ejects.
    // SUB
    .concat([ 0x1A ]);

  // Write to printer
  let file = fs.openSync(dev, 'r+');
  fs.writeSync(file, Buffer.from(data));
  fs.closeSync(file);
};

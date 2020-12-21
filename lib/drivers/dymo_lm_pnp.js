'use strict';

const fs = require('fs');
const AppError = require('../app_error');
const glob = require('glob');
const debug = require('debug')('print');
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

module.exports.description = 'DYMO LabelManager PnP';


function get_serial() {
  // Search DEV_CLASS:DEV_VENDOR:DEV_PRODUCT.????
  let dirs = glob.sync('0003:0922:1002.????', { cwd: '/sys/bus/hid/devices' });
  if (!dirs.length) return null;

  const id = dirs[0];
  debug(`device id = ${id}`);

  dirs = glob.sync('*', { cwd: `/sys/bus/hid/devices/${id}/hidraw` });
  if (!dirs.length) return null;

  const dev_name = dirs[0];
  debug(`device name = ${dev_name}`);

  const serial_id = fs.readFileSync(`/sys/bus/hid/devices/${id}/hidraw/${dev_name}/dev`, 'utf-8').trim();
  if (!/^\d+:\d+$/.test(serial_id)) return null;
  debug(`serial id = ${serial_id}`);

  // Try to find matching serial device

  let filepath = `/dev/char/${serial_id}`;
  debug(`device file: ${filepath}`);
  if (fs.existsSync(filepath)) return fs.realpathSync(filepath);

  return null;
}


module.exports.find = () => Boolean(get_serial());


module.exports.print = async (image/*, args*/) => {
  const dev = get_serial();
  if (!dev) throw new AppError('Can\'t find device');

  const png = PNG.sync.read(image);

  // Head height is fixed - 64px, 8 bytes per line.
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
    const row = (new Array(max_width_px / 8)).fill(0);

    for (let y = 0; y < height; y++) {
      const val = png.data[(x + (y + src_offset) * width) * 4];
      const bit = val > 127 ? 0 : 1;
      let y_out = y + dst_offset;
      row[y_out >> 3] = row[y_out >> 3] | (bit << (7 - (y_out & 0x7)));
    }

    label_rows.unshift(row);
  }

  // Feed to knife
  for (let i = 0; i < end_feed_px; i++) label_rows.push([ 0, 0, 0, 0, 0, 0, 0, 0 ]);


  // Join all data
  const ESC = 0x1B;
  const SYN = 0x16;
  const code = (char) => char.codePointAt(0);

  let data = []
    // Not actual things
    .concat([ ESC, code('C'), 0 ]) // tape color = 0
    .concat([ ESC, code('B'), 0 ]) // bias text height = 0
    // Bytes per line
    .concat([ ESC, code('D'), label_rows[0].length ])
    // Lines
    .concat(label_rows.map(row => [ SYN ].concat(row)).flat());


  // Write to printer
  let file = fs.openSync(dev, 'r+');
  fs.writeSync(file, Buffer.from(data));
  fs.closeSync(file);
};

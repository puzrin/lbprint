'use strict';

const fs = require('fs');
const AppError = require('../app_error');
const glob = require('glob');
const debug = require('debug')('print');
const { PNG } = require('pngjs');


module.exports.mm2px = (mm) => mm * 64 / 12;

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
  const ESC = 0x1B;
  const SYN = 0x16;

  const dev = get_serial();
  if (!dev) throw new AppError('Can\'t find device');

  const png = PNG.sync.read(image);

  // Height is fixed - 64px, 8 bytes per line
  const height = png.height > max_width_px ? max_width_px : png.height;
  const width = png.width;

  let labelmatrix = [];

  for (let x = 0; x < width; x++) {
    const row = (new Array(max_width_px / 8)).fill(0);
    for (let y = 0; y < height; y++) {
      const val = png.data[(x + y * width) * 4];
      const bit = val > 127 ? 0 : 1;
      row[y >> 3] = row[y >> 3] | (bit << (7 - (y & 0x7)));
    }
    labelmatrix.unshift(row);
  }

  // Feed o knife
  for (let i = 0; i < end_feed_px; i++) labelmatrix.push([ 0, 0, 0, 0, 0, 0, 0, 0 ]);

  // Join all data
  let data = []
    // Not actual things
    .concat([ ESC, 'C'.codePointAt(0), 0 ]) // tape color = 0
    .concat([ ESC, 'B'.codePointAt(0), 0 ]) // bias text height = 0
    // Bytes per line
    .concat([ ESC, 'D'.codePointAt(0), labelmatrix[0].length ])
    // Lines
    .concat(labelmatrix.map(row => [ SYN ].concat(row)).flat());

  // Write to printer
  let file = fs.openSync(dev, 'r+');
  fs.writeSync(file, Buffer.from(data));
  fs.closeSync(file);
};

'use strict';

const fs  = require('fs');
const tmp = require('tmp');
const { execSync } = require('child_process');
const AppError = require('../app_error');


module.exports.mm2px = (mm) => mm * 64 / 12;

// Pixels on print head
module.exports.max_width_px = 64;

// Required for real printers only
module.exports.start_feed_px = 0;
module.exports.min_length_px = 0;

// Hidden for `--scan` and auto-detect
module.exports.find = () => false;

module.exports.description = 'Image viewer (for debug)';

module.exports.print = async (image, args) => {
  try {
    execSync(`which '${args.viewer}'`);
  } catch (e) {
    throw new AppError(`Can't find viewer '${args.viewer}'`);
  }

  const tmpobj = tmp.fileSync({ postfix: '.png' });

  fs.writeFileSync(tmpobj.name, image);

  require('child_process').execSync(`${args.viewer} '${tmpobj.name}'`);

  tmpobj.removeCallback();
};

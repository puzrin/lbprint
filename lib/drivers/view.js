'use strict';

const fs  = require('fs');
const tmp = require('tmp');
const { execSync } = require('child_process');
const open = require('open');
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

  const tmpobj = tmp.fileSync({ postfix: '.png' });

  fs.writeFileSync(tmpobj.name, image);

  //require('child_process').execSync(`${args.viewer} '${tmpobj.name}'`);

  try {
    if (args.viewer) {
      execSync(`${args.viewer} '${tmpobj.name}'`);
    } else {
      await open(tmpobj.name, { wait: true });
    }
  } catch (e) {
    throw new AppError(`Can't find viewer '${args.viewer}'`);
  }


  tmpobj.removeCallback();
};

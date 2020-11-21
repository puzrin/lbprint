'use strict';


const { join, basename } = require('path');
const glob = require('glob');
const fs = require('fs');


module.exports.list_fonts = () => {
  return [].concat(
    glob.sync(join(__dirname, '../fonts') + '/**/*.bdf')
  ).concat(
    glob.sync(join(__dirname, '../node_modules/roboto-fontface') + '/**/*.woff')
  );
};


module.exports.search_font = (name) => {
  if (fs.existsSync(name)) return name;

  // Continue only if name is without path and special characters
  if (/[*?!(|)+@\\/]/.test(name)) return null;

  const result = [].concat(
    glob.sync(join(__dirname, '../fonts') + `/**/${name}`)
  ).concat(
    glob.sync(join(__dirname, '../node_modules/roboto-fontface') + `/**/${name}`)
  );

  if (!result.length) return null;

  if (basename(result[0]) === name) return result[0];

  return null;
};

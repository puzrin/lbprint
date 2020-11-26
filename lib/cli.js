// Parse input arguments and execute convertor

'use strict';


const argparse = require('argparse');
const drivers  = require('./drivers');
const render   = require('./render');
const utils    = require('./utils');
const path     = require('path');
const AppError = require('./app_error');


// Formatter with support of `\n` in Help texts.
class RawTextHelpFormatter2 extends argparse.RawDescriptionHelpFormatter {
  // executes parent _split_lines for each line of the help, then flattens the result
  _split_lines(text, width) {
    return [].concat(...text.split('\n').map(line => super._split_lines(line, width)));
  }
}


module.exports.run = async function (argv, debug = false) {

  //
  // Configure CLI
  //

  let parser = new argparse.ArgumentParser({
    add_help: true,
    formatter_class: RawTextHelpFormatter2
  });

  if (debug) {
    parser.exit = function (status, message) {
      throw new Error(message);
    };
  }

  parser.add_argument('-v', '--version', {
    action: 'version',
    version: require('../package.json').version
  });

  parser.add_argument('-s', '--font-size', {
    metavar: '<px>',
    type: 'int',
    help: 'font size (pixels, use max possible if not set)'
  });

  parser.add_argument('-g', '--line-gap', {
    metavar: '<line-gap>',
    default: '0.1rem',
    help: 'space between lines (pixels or "rem", %(default)s by default)'
  });

  parser.add_argument('-m', '--margin', {
    metavar: '<px>',
    type: 'int',
    default: 30,
    help: 'text horizontal margin (pixels, %(default)s by default)'
  });

  parser.add_argument('-p', '--printer', {
    choices: Object.keys(drivers),
    //required: true,
    help: 'printer to use (auto-detect by default)'
  });

  parser.add_argument('-t', '--type-width', {
    metavar: '<mm>',
    type: 'int',
    default: 12,
    help: 'label type width (%(default)s by default)'
  });

  parser.add_argument('-f', '--font', {
    metavar: '<name>',
    help: 'font to use (file name for embedded, or full path for the rest)'
  });

  parser.add_argument('--list-fonts', {
    action: 'store_true',
    help: 'list available embedded fonts'
  });

  parser.add_argument('--scan', {
    action: 'store_true',
    help: 'search & show available printers'
  });

  parser.add_argument('--viewer', {
    metavar: '<program>',
    default: 'display',
    help: "program to use for image view ('%(default)s' by default)"
  });

  // Offset (for debug)
  parser.add_argument('--shift', {
    default: 0,
    type: 'int',
    help: argparse.SUPPRESS
  });

  parser.add_argument('text', {
    nargs: '*',
    help: 'text to print, each parameter gives a new line'
  });

  //
  // Process CLI options
  //

  const args = parser.parse_args(argv.length ? argv : [ '-h' ]);

  //
  // Special cases
  //

  // list fonts
  if (args.list_fonts) {
    let fonts = utils.list_fonts().map(name => path.basename(name));

    let output = '';

    for (let i = 0, chunk = 3; i < fonts.length; i += chunk) {
      output += fonts.slice(i, i + chunk).join(' ') + '\n';
    }

    /* eslint-disable no-console */
    console.log(output);
    return;
  }


  // Scan and show printers
  if (args.scan) {
    let printers = [];
    for (let p of Object.keys(drivers)) {
      if (await drivers[p].find()) printers.push(`${p} (${drivers[p].description})`);
    }

    if (!printers.length) console.log('No printers found');
    else console.log(printers.join('\n'));
    return;
  }


  // Auto-detect printer if not set
  if (!args.printer) {
    for (let p of Object.keys(drivers)) {
      if (await drivers[p].find()) { args.printer = p; break; }
    }
    if (!args.printer) {
      throw new AppError("Printer not found, use '--printer view' to see image");
    }
  }

  //
  // Create image
  //

  const image = await render(args);

  //
  // Print
  //

  await drivers[args.printer].print(image, args);
};

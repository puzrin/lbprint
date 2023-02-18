'use strict';


const fs = require('fs');
const AppError = require('./app_error');
const { PNG } = require('pngjs');
const drivers  = require('./drivers');
const { GlobalFonts, createCanvas } = require('@napi-rs/canvas');
const opentype  = require('opentype.js');
const debug = require('debug')('render');
const BDFFont = require('bdf-canvas').BDFFont;
const utils = require('./utils');


function get_ttf_metrics(args, printer) {
  let lg = args.line_gap;

  // Fixed size font
  if (args.font_size) {
    let font_size = args.font_size;
    let font_line_gap = Math.round(/rem$/i.test(lg) ? font_size * lg.slice(0, -3) : lg);

    return { font_size, font_line_gap };
  }

  //
  // Auto-scaled font
  //

  const max_height = printer.mm2px(args.type_width);
  const lines = args.text.length;

  // Proportional gap
  if (/rem$/i.test(lg)) {
    // font_size * lines +  font_size * (lines - 1) * gap = max_height
    const rem_gap = +lg.slice(0, -3);
    const font_size = Math.floor(max_height / (lines + (lines - 1) * rem_gap));
    // Calculate via max_height & font_size ot avoid overflow
    const font_line_gap = lines === 1 ? 0 : Math.floor((max_height - font_size * lines) / (lines - 1));

    return {
      font_size,
      font_line_gap
    };
  }

  // Fixed gap
  const font_size = Math.floor((max_height - (lines - 1) * Math.floor(+lg)) / lines);

  return { font_size, font_line_gap: Math.floor(+lg) };
}


function get_text_width(data, width, height) {
  let result = 0;
  for (let pos = 0, y = 0; y < height; y++) {
    for (let x = 0; x < width; x++, pos += 4) {
      if (data[pos] < 127) result = Math.max(x, result);
    }
  }
  return result;
}


module.exports = async (args) => {
  const default_font = utils.search_font('Roboto-Regular.woff');

  if (args.font && !utils.search_font(args.font)) {
    throw new AppError(`Can't locate font ${args.font}`);
  }

  const font_path = utils.search_font(args.font) || default_font;

  if (!fs.existsSync(font_path)) throw new AppError('Font not found');

  const printer = drivers[args.printer];

  const size = {
    w: 1000, // We don't know real width at this moment
    h: printer.mm2px(args.type_width)
  };

  const canvas = createCanvas(size.w, size.h);
  const ctx = canvas.getContext('2d');

  let font_size, font_line_gap, font_ascent;
  let draw_text;

  const is_bdf = /STARTFONT /.test(fs.readFileSync(font_path, 'utf8'));

  //
  // Prepare to draw
  //

  if (!is_bdf) {
    debug('font is OTF-like');

    font_size = get_ttf_metrics(args, printer).font_size;
    font_line_gap  = get_ttf_metrics(args, printer).font_line_gap;

    const ot_font  = await opentype.load(font_path);
    const ot_ascent = ot_font.tables.os2.sTypoAscender;
    const ot_descent = ot_font.tables.os2.sTypoDescender;

    font_ascent = Math.round(ot_ascent / (ot_ascent - ot_descent) * font_size);

    GlobalFonts.registerFromPath(font_path, 'MyFont');
    ctx.font = `${font_size}px "MyFont"`;
    draw_text = (text, x, y) => ctx.fillText(text, x, y);

  } else {
    debug('font is BDF');

    if (args.font_size) throw new AppError('Fon size option not allowed for BDF fonts');

    const font = new BDFFont(fs.readFileSync(font_path, 'utf8'));

    font_size = font.properties.PIXEL_SIZE;
    font_ascent = font.properties.FONT_ASCENT;

    let lg = args.line_gap;
    font_line_gap = Math.round(/rem$/i.test(lg) ? font_size * lg.slice(0, -3) : lg);

    draw_text = (text, x, y) => font.drawText(ctx, text, x, y);
  }

  debug(`font size = ${font_size}px`);
  debug(`font ascent = ${font_ascent}px`);
  debug(`font line gap = ${font_line_gap}px`);

  const lines = args.text.length;
  const total_height = (font_size + font_line_gap) * lines - font_line_gap;
  // Canvas draw by baseline, we need shift by font_ascent, not font_size.
  const offset = (printer.mm2px(args.type_width) - total_height) / 2 + font_ascent + args.shift;

  //
  // First pass to detect text width
  //

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, size.w, size.h);
  ctx.fillStyle = 'black';

  for (let i = 0, ofs = offset; i < args.text.length; i++) {
    draw_text(args.text[i], 0, ofs);
    ofs += font_size + font_line_gap;
  }

  const text_width = get_text_width(ctx.getImageData(0, 0, size.w, size.h).data, size.w, size.h);
  debug(`text width = ${text_width}px`);

  //
  // Second pass
  //
  const margin_left = args.margin;
  let margin_right = args.margin;

  // Enlarge margin_right to minimal allowed value
  if (margin_right < printer.start_feed_px) margin_right = printer.start_feed_px;

  if (margin_left + text_width + margin_right < printer.min_length_px) {
    margin_right = printer.min_length_px - margin_left - text_width;
  }

  const result_width = margin_left + text_width + margin_right;

  debug(`margin left = ${margin_left}px`);
  debug(`margin right = ${margin_right}px`);
  debug(`final size = ${result_width}*${size.h}px`);

  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, size.w, size.h);
  ctx.fillStyle = 'black';

  for (let i = 0, ofs = offset; i < args.text.length; i++) {
    draw_text(args.text[i], margin_left, ofs);
    ofs += font_size + font_line_gap;
  }


  // Convert to png
  const png = new PNG({ width: result_width, height: size.h });
  const raw_data = ctx.getImageData(0, 0, result_width, size.h).data;

  for (let pos = 0, y = size.h - 1; y >= 0; y--) {
    for (let x = 0; x < result_width; x++) {
      const color = raw_data[pos] > 127 ? 255 : 0;
      png.data[pos++] = color;
      png.data[pos++] = color;
      png.data[pos++] = color;
      png.data[pos++] = 255;
    }
  }

  const out = PNG.sync.write(png);

  return out;
};

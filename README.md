lbprint
=======

[![NPM version](https://img.shields.io/npm/v/lbprint.svg?style=flat)](https://www.npmjs.org/package/lbprint)

> Label printing CLI tool or linux


## Install dependencies

__Ubuntu__

Viewer & `node_canvas` build packages:

```
sudo apt-get install imagemagick build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

Setup `udev` and `modeswitch` rules:

```
sudo cp support/91-dymo-labelmanager-pnp.rules /etc/udev/rules.d/
sudo cp support/dymo-labelmanager-pnp.conf /etc/usb_modeswitch.d/
sudo systemctl restart udev.service
```


## Install the script

[node.js](https://nodejs.org/en/download/) v14+ required.

```sh
# install release from npm registry
npm i lbprint -g
# install from github's repo, master branch
npm i puzrin/lbprint -g
```

**run via [npx](https://www.npmjs.com/package/npx) without install**

```sh
# run from npm registry
npx lbprint -h
# run from github master
npx github:puzrin/lbprint -h
```

Note, runing via `npx` may take some time until modules installed, be patient.


## Use

```
usage: lbprint.js [-h] [-v] [-s <px>] [-g <line-gap>] [-m <px>]
                  [-p {dymo_lm_pnp,view}] [-t <mm>] [-f <path>] [--list-fonts]
                  [--scan] [--viewer <program>]
                  [text ...]

positional arguments:
  text                  Text Parameter, each parameter gives a new line

optional arguments:
  -h, --help            show this help message and exit
  -v, --version         show program's version number and exit
  -s <px>, --font-size <px>
                        font size (pixels, use max possible if not set)
  -g <line-gap>, --line-gap <line-gap>
                        space between lines (pixels or "rem", 0.1rem by default)
  -m <px>, --margin <px>
                        text horizontal margin (pixels, 30 by default)
  -p {dymo_lm_pnp,view}, --printer {dymo_lm_pnp,view}
                        printer to use (auto-detect by default)
  -t <mm>, --type-width <mm>
                        label type width (12 by default)
  -f <path>, --font <path>
                        font path
  --list-fonts          list available embedded fonts (file names can be used
                        without path)
  --scan                scan for available printers
  --viewer <program>    program to use for image view ('display' by default)
```

Note:

- By default `Roboto Regular` (scaleable) font is used. Use `--list-fonts` for
embedded alternatives.
- For small sizes you may wish o use `helvR<08|10|12|14>.bdf`
font.

Any external BDF/TTF/WOFF fonts are allowed too, if full path provided.


## Examples

Print 2 lines of max possible size with default font:

```sh
lbprint 'foo bar' baz
```

Print 2 lines with fixxed size Helvetica font, and minimal line gap.

```sh
lbprint -f helvR14.bdf -g0 'foo bar' baz
```

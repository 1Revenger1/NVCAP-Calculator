# NVCAP Calculator

This is a simple script which reads an Nvidia GPU VBIOS and calculates an NVCAP value for use in macOS.

This is compatible with GTX 4xx series GPUs and older, and works with both laptop and desktop GPUs.

To use this program, you need node.js. To run, you'll want to clone this project, run `npm install`, then `npm run run` OR `node index.js`. Building is not required, but this can be built using typescript. `tsc` will automatically generate `index.js`, but `npm run build` will compile and run in one command if preferred.

Once running, give it a VBIOS file, and then select `3` once it dumps you to the main menu again. From there, you need to assign each Display (at the top) to a head.

When parsing the VBIOS, the script automatically merges DCB entries with the same type and bus index and presents them as a single Display. If the bus index is the same, but are differing types, this will be presented as a single DVI Display.

When parsing the VBIOS file, this can automatically put some entries into different heads in the following situations:

1. If there is a TV/Composite out, that will automatically be put into the HeadTVMask field
2. If there is an LVDS out, that will be assigned to head 1, with all other outputs being put on the second head.

Each head only supports displaying one output at a time. So make sure that the displays you plan to use are on different heads!.

There exists other fields which can be edited within the NVCAP value as well:
* Version - 5 starting with the 8000-series, 4 for 6000 and 7000 series.
* Composite - Does a Composite out exist?
* Script based Backlight/Power - Unknown
* Field f - Unknown
  * 07: Clover's default
  * 0A: Desktop-class GPU (Chameleon default)
  * 0B: Laptop-class GPU
  * 0E: 300 series+ MacBook Air/Low end
  * 0F: 300 series+ MacBook Pro/iMac/High End

![](/images/8800m-example.png)  
Example from an 8800M GTX

Once the values are set as you want, select `c` and it will dump the NVCAP value.

## Credits
* Khronokernel - For answering way to many questions about old graphics cards and macs
* Acidanthera - [NVCAP fields](https://github.com/acidanthera/WhateverGreen/blob/master/Manual/NVCAP.bt)

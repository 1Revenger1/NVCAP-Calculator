import chalk from "chalk";
import {existsSync, readFileSync} from "fs";

// Based off of https://github.com/torvalds/linux/blob/master/drivers/gpu/drm/nouveau/nouveau_bios.c
let romFile = "9600MGT.rom";

// Write question string, and then wait for a user response (ie when they press enter)
async function prompt (question : string) : Promise<string> {
    let stdin = process.stdin;
    let stdout = process.stdout;

    stdin.resume();
    stdout.write(question.concat(": "));

    return new Promise ((res, rej) => {
        stdin.once('data', data => {
            stdin.pause();
            res(data.toString());
        });
    });
}

interface NVCAP {
    version: number;
    isMobile: boolean;
    composite: boolean,
    tvDCBMask: number,
    head0DCBMask: number,
    head1DCBMask: number,
    // Only for GK107 and older (which this script doesn't support)
    head2DCBMask: number,
    head3DCBMask: number,
    scriptBasedPowerAndBacklight: boolean,
    /*
      07: Clover's default
      0A: Desktop-class GPU (Chameleon default)
      0B: Laptop-class GPU
      0E: 300 series+ MacBook Air/Low end
      0F: 300 series+ MacBook Pro/iMac/High End
    */
    fieldF: number
}

// DCB connector type
enum ConnectorType {
    CRT = 0,
    TV,
    TMDS,
    LVDS,
    Reserved,
    SDI,
    DisplayPort,
    EOL,
    SkipEntry
}

interface DCBEntry {
    type: ConnectorType,
    edidPort: number,
    headBitmask: number,
    con: number,
    bus: number,
    loc: number,
    bdr: boolean,
    bbdr: boolean,
    outputResources: number,
    virtual: boolean,
    reserved: number,
    entry: number,
    merged: boolean,
}

// Parsed display type
enum DisplayType {
    LVDS = 0,
    TV,
    Analog,
    Digital,
    DVI
}

// A display is the parsed version of a DCB entry
// A display can represent 1 or more DCB entries (ie DVI is generally 2 entries)
interface Display {
    type: DisplayType,
    dcbEntries: number[],
    headBitmask: number
}

function parseSignature (version: number, rom: Buffer, offset: number) : boolean {    
    if (version >= 0x42) {
         console.log("Unknown version");
         return false;
    } else if (version >= 0x30) {
        if (rom.readUInt32LE(offset + 6) != 0x4edcbdcb) {
            console.error("Corrupt VBIOS");
            return false;
        }
    } else {
        console.error("To old version - GPU incompatible with macOS");
        return false;
    }
    
    return true;
}

let nvcap: NVCAP = {
    version: 5,
    isMobile: false,
    composite: false,
    tvDCBMask: 0,
    head0DCBMask: 0,
    head1DCBMask: 0,
    head2DCBMask: 0,
    head3DCBMask: 0,
    scriptBasedPowerAndBacklight: false,
    /*
      07: Clover's default
      0A: Desktop-class GPU (Chameleon default)
      0B: Laptop-class GPU
      0E: 300 series+ MacBook Air/Low end
      0F: 300 series+ MacBook Pro/iMac/High End
    */
    fieldF: 0x0F,
};

// DCB entries
let parsedEntries: DCBEntry[] = [];
// Displays (display can represent multiple DCB entries)
let filteredEntries: Display[] = [];
let headTV: number[] = [];
let head0: number[] = [];
let head1: number[] = [];


function readRom() {
    parsedEntries = [];
    filteredEntries = [];
    headTV = [];
    head0 = [];
    head1 = [];

    if (!existsSync(romFile)) {
        console.error("Rom file not found");
        return false;
    }

    let rom: Buffer = readFileSync(romFile);
    console.log(`Read ROM file ${romFile}, which is ${rom.byteLength} bytes long`);

    const dcbHeader = rom.readUInt16LE(0x36);
    const version = rom.readUInt8(dcbHeader);
    if (version == 0) {
        console.error("Version is zero");
        return false;
    }
    
    const versionMajor = version >> 4;
    const versionMinor = version & 0xf;

    // DCB 3.0 and 4.0 are very similar, just treat them the same
    const size = rom.readUInt8(dcbHeader + 1);
    console.log(`DCB Header is at 0x${dcbHeader.toString(16)} with length 0x${size.toString(16)}`);
    console.log(`DCB Version ${versionMajor}.${versionMinor}`);

    if (!parseSignature(version, rom, dcbHeader)) {
        console.error("Invalid DCB Signature");
        return false;
    }

    const dcbEntries = rom.readUInt8(dcbHeader + 2);
    const dcbEntrySize = rom.readUInt8(dcbHeader + 3);

    console.log(`${dcbEntries} DCB entries of size ${dcbEntrySize.toString(16)} bytes\n`);

    for (let i = 0; i < dcbEntries; i++) {
        let offset = dcbHeader + size + (dcbEntrySize * i);
        let conn = rom.readUInt32LE(offset);

        const dcbHead: DCBEntry = {
            type: conn & 0xf,
            edidPort: (conn >> 4) & 0xf,
            headBitmask: (conn >> 8) & 0xf,
            con: (conn >> 12) & 0xf,
            bus: (conn >> 16) & 0xf,
            loc: (conn >> 20) & 0x3,
            bdr: !!((conn >> 22) & 0x1),
            bbdr: !!((conn >> 23) & 0x1),
            outputResources: (conn >> 24) & 0xf,
            virtual: !!((conn >> 28) & 0x1),
            reserved: (conn >> 29) & 0x7,
            entry: i,
            merged: false
        }

        // Skip entry
        if (dcbHead.type == 0xf)
            continue;

        if (dcbHead.type == ConnectorType.LVDS)
            nvcap.isMobile = true;

        // EOL (End of Line) - stop parsing entries
        if (dcbHead.type == 0xE)
            break;

        parsedEntries.push(dcbHead);
    }

    console.log();
    console.log(`Found ${parsedEntries.length} populated DCB Entries`);
    
    // Merge displays with the same connector ID
    
    parsedEntries.forEach((entry: DCBEntry, index, parsedEntries: DCBEntry[]) => {
        if (entry.merged)
            return;
    
        /*
         * https://nvidia.github.io/open-gpu-doc/DCB/DCB-4.x-Specification.html#_dcb_device_entries
         * Use Bus id, not connector index, to merge devices together
         */
        let similarDCBs = parsedEntries.filter((value: DCBEntry, filterIndex: number) => (entry.bus == value.bus && filterIndex != index));
        if (similarDCBs.length != 1) {
            let type = DisplayType.Digital;
            switch (entry.type) {
                case ConnectorType.LVDS:
                    type = DisplayType.LVDS;
                    break;
                case ConnectorType.CRT:
                    type = DisplayType.Analog;
                    break;
                case ConnectorType.TV:
                    type = DisplayType.TV;
                    break;
            }
    
            filteredEntries.push({
                type: type,
                dcbEntries: [index],
                headBitmask: entry.headBitmask
            });
        } else {
            let mergingEntry = similarDCBs[0];
            mergingEntry.merged = true;
    
            let type = DisplayType.DVI;
            if (entry.type == mergingEntry.type) {
                type = DisplayType.Digital;
                switch (entry.type) {
                    case ConnectorType.LVDS:
                        type = DisplayType.LVDS;
                        break;
                    case ConnectorType.CRT:
                        type = DisplayType.Analog;
                        break;
                    case ConnectorType.TV:
                        type = DisplayType.TV;
                        break;
                }
            }
    
            filteredEntries.push({
                type: type,
                dcbEntries: [index, mergingEntry.entry],
                headBitmask: entry.headBitmask & mergingEntry.headBitmask
            })
        }
    });

    let lvdsExists = false;

    // Help the user by doing some preliminary placement of displays.
    // Important thing is that TV goes to the TV head and that LVDS gets it's own head!
    filteredEntries.forEach((display: Display, index: number) => {
        if (display.type == DisplayType.TV) {
            headTV.push(index);
            return;
        }
        
        // If there is an LVDS display, put any other displays
        if (lvdsExists) {
            if (display.headBitmask & 0x2) {
                head1.push(index);
            }
        }
        
        // Assign LVDS to it's own head
        if (display.type == DisplayType.LVDS) {
            if (display.headBitmask & 0x1) {
                head0.push(index);
                lvdsExists = true;
            }
        }
    });
}

function header() {
    console.log(chalk.green(`+${new Array(26).fill("-").join("")}+`));
    console.log(chalk.green("|") + chalk.cyan("     NVCAP Calculator     ") + chalk.green("|"));
    console.log(chalk.green(`+${new Array(26).fill("-").join("")}+`));
    console.log(); //new line
}

async function dumpDCBEntries() {
    parsedEntries.forEach((dcbHead: DCBEntry, i: number) => {
        console.log(chalk.blueBright(`DCB Entry ${i.toString(16)}`));
        let output = "";
        output += chalk.green("Type: ") + ConnectorType[dcbHead.type] + " ";
        output += chalk.green("EdidPort: ") + dcbHead.edidPort + " ";
        output += chalk.green("Head: ") + dcbHead.headBitmask + " ";
        output += chalk.green("Connector: ") + dcbHead.con + " ";
        output += chalk.green("Bus: ") + dcbHead.bus + " ";
        output += chalk.green("Loc: ") + dcbHead.loc + " ";
    
        output += "\n";
    
        output += chalk.green("BDR: ") + dcbHead.bdr + " ";
        output += chalk.green("BBDR: ") + dcbHead.bbdr + " ";
        output += chalk.green("Resources: ") + dcbHead.outputResources + " ";
        output += chalk.green("Virtual: ") + dcbHead.virtual + " ";
    
        console.log(output);
    });

    await prompt("\nPress enter to continue");
}

async function chooseROM() {
    while (true) {
        console.clear();
        header();

        console.log("Enter in the location of your VBIOS\n");
        console.log(chalk.cyan("Windows Tip: ") + " Shift + Right click your VBIOS and click \"Copy Path\"");
        console.log(chalk.cyan("Linooox/macOS: ") + " Drag and drop your VBIOS into this prompt\n");
        
        let res = await prompt("New ROM Location (q to go to the menu)");
        res = res.replace(/[\n\r"]/g, "").trim();
        console.log(`Parsed Path: ${res}`);
        if (res == "q") return;
        if (existsSync(res)) {
            romFile = res;
            break;
        } else {
            await prompt("Unable to find ROM! Press enter to continue");
        }
    }
    readRom();
    await prompt("\nPress enter to continue");
}

function listDisplaysAndNvcap() {
    console.log("Displays");
    filteredEntries.forEach((display: Display, index: number) => {
        let output = chalk.blueBright(`(${index + 1})`);
        output += chalk.green(" Type: ");
        output += DisplayType[display.type];
        output += chalk.green("\tSupported Heads: ");
    
        // Max of 4 heads
        for (let i = 0; i < 4; i++) {
            if (display.headBitmask & (1 << i)) {
                output += `${i + 1},`
            }
        }
    
        // trim last comma
        output = output.substring(0, output.length - 1);
    
        if (display.type == DisplayType.TV) {
            output += ",TV";
        }
    
        console.log(output);
    });

    console.log();

    console.log("Heads");
    let headTVOut = chalk.blueBright("(TV) ") + "["
    let head0Out = chalk.blueBright("(1)  ") + "["
    let head1Out = chalk.blueBright("(2)  ") + "["

    headTV.forEach((dcbEntry: number) => headTVOut += (dcbEntry + 1) + ",");
    head0.forEach((dcbEntry: number) => head0Out += (dcbEntry + 1) + ",");
    head1.forEach((dcbEntry: number) => head1Out += (dcbEntry + 1) + ",");
    
    // trim last comma
    if (headTV.length > 0) headTVOut = headTVOut.substring(0, headTVOut.length - 1);
    if (head0.length > 0) head0Out = head0Out.substring(0, head0Out.length - 1);
    if (head1.length > 0) head1Out = head1Out.substring(0, head1Out.length - 1);

    headTVOut += "]";
    head0Out += "]";
    head1Out += "]";
    console.log(headTVOut);
    console.log(head0Out);
    console.log(head1Out);


    console.log();
    console.log("NVCAP:");
    console.log(chalk.blueBright("(n1)") + chalk.green(" Version: ") + nvcap.version);
    console.log(chalk.blueBright("(n2)") + chalk.green(" Composite: ") + nvcap.composite);
    console.log(chalk.blueBright("(n3)") + chalk.green(" Script Based Power/Backlight: ") + nvcap.scriptBasedPowerAndBacklight);
    console.log(chalk.blueBright("(n4)") + chalk.green(" Field F: ") + "0x" + nvcap.fieldF.toString(16));

    console.log();
    console.log("To add/remove a display to/from a head, type <display> <head> (ex: \"1 1\")");
    console.log("To change an NVCAP value, do n<number> <new value> (ex: \"n2 true\")");
    console.log("To calculate the NVCAP value, type c/create");
}

async function drawNVCap() {
    while (true) {
        console.clear();
        header();
        listDisplaysAndNvcap();   
        let result = await prompt("To return to the previous menu, use q/quit");
        console.log();

        if (result.length == 0) continue;
        // quit
        if (result.toLowerCase().startsWith("q")) return;
        // Create NVCAP
        if (result.toLowerCase().startsWith("c")) {
            console.log();
            createNVCap();
            if((await prompt("Press enter to continue (or q/quit to exit)")).toLowerCase().startsWith("q")) {
                showGoodbye();
                process.exit(0);
            }
            continue;
        }

        // Handle commands like "2 1" where display 2 gets put on head 1
        // If the first letter is "n", then that is ignored here
        let splitArr = result.split(" ");
        if (splitArr.length == 2 && parseInt(splitArr[0]) && 
            (parseInt(splitArr[1]) || splitArr[1].toLowerCase().startsWith("tv"))) {
            
            let arr: number[] | null = null;;

            let display = parseInt(splitArr[0]);
            if (display < 1 || display > filteredEntries.length) {
                await prompt("Unknown display - press enter to continue");
                continue;
            }
            display--;

            if (splitArr[1].toLowerCase().startsWith("tv")) {
                if (filteredEntries[display].type != DisplayType.TV) {
                    await prompt("Only a display of type TV can be put in the TV Mask - Pres enter to continue");
                    continue;
                }
                arr = headTV;
            } else {
                let head = parseInt(splitArr[1]);
                if (head == 1) {
                    arr = head0;
                } else if (head == 2) {
                    arr = head1;
                }
            }

            if (arr == null) {
                await prompt("Unknown head - press enter to continue");
                continue;
            }
            
            if (arr.includes(display)) {
                arr.splice(arr.indexOf(display), 1);
            } else {
                arr.push(display);
            }
            continue;
        }

        // Handle other options with "n" in front
        splitArr[0] = splitArr[0].replace("n", "");
        if (parseInt(splitArr[0])) {
            let command = parseInt(splitArr[0]) - 1;
            switch (command) {
                case 0:
                case 3:
                    let newValue = parseInt(splitArr[1]);
                    if (newValue < 0 || newValue > 0xf) {
                        await prompt("New value is out of bounds! Must be between 0 and 0xf - press enter to continue");
                        continue;
                    }

                    if (command == 0) nvcap.version = newValue;
                    if (command == 3) nvcap.fieldF = newValue;
                    break;
                case 1:
                case 2:
                    if (splitArr.length < 2) {
                        if (command == 1) {
                            nvcap.composite = !nvcap.composite;
                        } else {
                            nvcap.scriptBasedPowerAndBacklight = !nvcap.scriptBasedPowerAndBacklight;
                        }
                        continue;
                    }
                    splitArr[1] = splitArr[1].replace("\n", "").toLowerCase();
                    let bool = false;
                    if (splitArr[1].startsWith("t")) {
                        bool = true;
                    } else if (!splitArr[1].startsWith("f")) {
                        await prompt ("Unrecognized new value! Must be true or false - press enter to continue");
                        continue;
                    }

                    if (command == 1) {
                        nvcap.composite = bool;
                    } else {
                        nvcap.scriptBasedPowerAndBacklight = bool;
                    }
                    break;
            }
        }

        await prompt("Unknown command - press enter to continue"); 
    }
}

function createHeadMask(displays: number[]) {
    let mask = 0;
    displays.forEach((displayIndex: number) => {
        let dcbEntries: number[] = filteredEntries[displayIndex]!.dcbEntries;
        dcbEntries.forEach((dcbIndex: number) => {
            mask |= (1 << dcbIndex);
        });
    });

    return mask;
}

function createNVCap() {
    nvcap.tvDCBMask = createHeadMask(headTV);
    nvcap.head0DCBMask = createHeadMask(head0);
    nvcap.head1DCBMask = createHeadMask(head1);
    console.log(`TV Mask: 0x${nvcap.tvDCBMask.toString(16)}`);
    console.log(`Head 1 Mask: 0x${nvcap.head0DCBMask.toString(16)}`);
    console.log(`Head 2 Mask: 0x${nvcap.head1DCBMask.toString(16)}`);

    let buffer = Buffer.alloc(20);
    buffer.writeInt8(nvcap.version, 0);
    buffer.writeInt8(nvcap.isMobile ? 1 : 0, 1);
    buffer.writeInt8(nvcap.composite ? 1 : 0, 2);
    // Unknown field - backlight related?
    buffer.writeInt8(0, 3);

    buffer.writeInt16LE(nvcap.tvDCBMask, 4);
    buffer.writeInt16LE(nvcap.head0DCBMask, 6);
    buffer.writeInt16LE(nvcap.head1DCBMask, 8);
    buffer.writeInt16LE(nvcap.head2DCBMask, 10);
    buffer.writeInt16LE(nvcap.head3DCBMask, 12);

    buffer.writeInt8(nvcap.scriptBasedPowerAndBacklight ? 1 : 0, 14);
    buffer.writeInt8(nvcap.fieldF, 15);
    
    // Unknwon field - 10bit/EDID_Manufacturer_Reserved_timings support?
    buffer.writeInt8(0, 16);
    buffer.writeInt8(0, 17);
    buffer.writeInt8(0, 18);
    buffer.writeInt8(0, 19);

    let output = "NVCAP: ";
    // Pad to always be 8 digits long
    for (let i = 0; i < 5; i++) {
        let number = buffer.readInt32BE(i * 4);
        output += ("00000000" + number.toString(16)).slice(-8);
        output += " ";
        
    }
    console.log(output);
}

function showGoodbye() {
    console.clear();
    header();

    console.log("By 1Revenger1\n");
    console.log("Thanks for using this program - if you have any issues,");
    console.log("visit github.com/1Revenger1/NVCAPCalculator");
    console.log("For more projects, visit github.com/1Revenger1\n");

    let hour = new Date().getHours();
    if (hour > 3 && hour < 12) {
        console.log("Have a nice morning!\n");
    } else if (hour >= 12 && hour < 17) {
        console.log("Have a nice afternoon!\n");
    } else if (hour >= 17 && hour < 21) {
        console.log("Have a nice evening!\n");
    } else {
        console.log("Have a nice night!\n");
    }
}

async function main() {
    // Ask user for path if rom does not exist
    if (!existsSync(romFile)) {
        await chooseROM();
    }
    
    readRom();

    while (true) {
        let romExists = existsSync(romFile);
        console.clear();
        header();
        
        
        let output = chalk.cyan("(1) ") + "Choose VBIOS/ROM file\n";
        if (romExists) {
            output += chalk.cyan("(2) ") + "Show DCB Entries\n";
            output += chalk.cyan("(3) ") + "Calculate NVCAP\n";
        }
        output += "\n";

        if (romExists) {
            output += "Current ROM file: " + chalk.green(romFile);
        } else {
            output += "Current ROM file (not found): " + chalk.red(romFile);
        }
        console.log(output);

        let result = await prompt("Type in the number to select your option, or \"q\"/\"quit\" to quit");
        if (result.toLowerCase().startsWith("q")) break;
        if (result.toLowerCase().startsWith("1")) await chooseROM();
        if (romExists) {
            if (result.toLowerCase().startsWith("2")) await dumpDCBEntries();
            if (result.toLowerCase().startsWith("3")) await drawNVCap();
        }
    }

    showGoodbye();
}

main();
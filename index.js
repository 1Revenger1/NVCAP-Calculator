"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var chalk_1 = __importDefault(require("chalk"));
var fs_1 = require("fs");
// Based off of https://github.com/torvalds/linux/blob/master/drivers/gpu/drm/nouveau/nouveau_bios.c
var romFile = "9600MGT.rom";
function prompt(question) {
    return __awaiter(this, void 0, void 0, function () {
        var stdin, stdout;
        return __generator(this, function (_a) {
            stdin = process.stdin;
            stdout = process.stdout;
            stdin.resume();
            stdout.write(question.concat(": "));
            return [2 /*return*/, new Promise(function (res, rej) {
                    stdin.once('data', function (data) {
                        stdin.pause();
                        res(data.toString());
                    });
                })];
        });
    });
}
var ConnectorType;
(function (ConnectorType) {
    ConnectorType[ConnectorType["CRT"] = 0] = "CRT";
    ConnectorType[ConnectorType["TV"] = 1] = "TV";
    ConnectorType[ConnectorType["TMDS"] = 2] = "TMDS";
    ConnectorType[ConnectorType["LVDS"] = 3] = "LVDS";
    ConnectorType[ConnectorType["Reserved"] = 4] = "Reserved";
    ConnectorType[ConnectorType["SDI"] = 5] = "SDI";
    ConnectorType[ConnectorType["DisplayPort"] = 6] = "DisplayPort";
    ConnectorType[ConnectorType["EOL"] = 7] = "EOL";
    ConnectorType[ConnectorType["SkipEntry"] = 8] = "SkipEntry";
})(ConnectorType || (ConnectorType = {}));
var DisplayType;
(function (DisplayType) {
    DisplayType[DisplayType["LVDS"] = 0] = "LVDS";
    DisplayType[DisplayType["TV"] = 1] = "TV";
    DisplayType[DisplayType["Analog"] = 2] = "Analog";
    DisplayType[DisplayType["Digital"] = 3] = "Digital";
    DisplayType[DisplayType["DVI"] = 4] = "DVI";
})(DisplayType || (DisplayType = {}));
function parseSignature(version, rom, offset) {
    if (version >= 0x42) {
        console.log("Unknown version");
        return false;
    }
    else if (version >= 0x30) {
        if (rom.readUInt32LE(offset + 6) != 0x4edcbdcb) {
            console.error("Corrupt VBIOS");
            return false;
        }
    }
    else {
        console.error("To old version - GPU incompatible with macOS");
        return false;
    }
    return true;
}
var nvcap = {
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
var parsedEntries = [];
// Displays (display can represent multiple DCB entries)
var filteredEntries = [];
var headTV = [];
var head0 = [];
var head1 = [];
function readRom() {
    parsedEntries = [];
    filteredEntries = [];
    headTV = [];
    head0 = [];
    head1 = [];
    if (!fs_1.existsSync(romFile)) {
        console.error("Rom file not found");
        return false;
    }
    var rom = fs_1.readFileSync(romFile);
    console.log("Read ROM file " + romFile + ", which is " + rom.byteLength + " bytes long");
    var dcbHeader = rom.readUInt16LE(0x36);
    var version = rom.readUInt8(dcbHeader);
    if (version == 0) {
        console.error("Version is zero");
        return false;
    }
    var versionMajor = version >> 4;
    var versionMinor = version & 0xf;
    // DCB 3.0 and 4.0 are very similar, just treat them the same
    var size = rom.readUInt8(dcbHeader + 1);
    console.log("DCB Header is at 0x" + dcbHeader.toString(16) + " with length 0x" + size.toString(16));
    console.log("DCB Version " + versionMajor + "." + versionMinor);
    if (!parseSignature(version, rom, dcbHeader)) {
        console.error("Invalid DCB Signature");
        return false;
    }
    var dcbEntries = rom.readUInt8(dcbHeader + 2);
    var dcbEntrySize = rom.readUInt8(dcbHeader + 3);
    console.log(dcbEntries + " DCB entries of size " + dcbEntrySize.toString(16) + " bytes\n");
    for (var i = 0; i < dcbEntries; i++) {
        var offset = dcbHeader + size + (dcbEntrySize * i);
        var conn = rom.readUInt32LE(offset);
        var dcbHead = {
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
        };
        // Skip entry
        if (dcbHead.type == 0xf)
            continue;
        if (dcbHead.type == ConnectorType.LVDS)
            nvcap.isMobile = true;
        // EOL (End of Line) - start parsing entries
        if (dcbHead.type == 0xE)
            break;
        parsedEntries.push(dcbHead);
    }
    console.log();
    console.log("Found " + parsedEntries.length + " populated DCB Entries");
    // Merge displays with the same connector ID
    parsedEntries.forEach(function (entry, index, parsedEntries) {
        if (entry.merged)
            return;
        /*
         * https://nvidia.github.io/open-gpu-doc/DCB/DCB-4.x-Specification.html#_dcb_device_entries
         * Use Bus id, not connector index, to merge devices together
         */
        var similarDCBs = parsedEntries.filter(function (value, filterIndex) { return (entry.bus == value.bus && filterIndex != index); });
        if (similarDCBs.length != 1) {
            var type = DisplayType.Digital;
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
        }
        else {
            var mergingEntry = similarDCBs[0];
            mergingEntry.merged = true;
            var type = DisplayType.DVI;
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
            });
        }
    });
    var lvdsExists = false;
    // Help the user by doing some preliminary placement of displays.
    // Important thing is that TV actually goes on TV and that LVDS gets it's own head!
    filteredEntries.forEach(function (display, index) {
        if (display.type == DisplayType.TV) {
            headTV.push(index);
            return;
        }
        // If there is an LVDS display, shove everything else on the other head
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
    console.log(chalk_1.default.green("+" + new Array(26).fill("-").join("") + "+"));
    console.log(chalk_1.default.green("|") + chalk_1.default.cyan("     NVCAP Calculator     ") + chalk_1.default.green("|"));
    console.log(chalk_1.default.green("+" + new Array(26).fill("-").join("") + "+"));
    console.log(); //new line
}
function dumpDCBEntries() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    parsedEntries.forEach(function (dcbHead, i) {
                        console.log(chalk_1.default.blueBright("DCB Entry " + i.toString(16)));
                        var output = "";
                        output += chalk_1.default.green("Type: ") + ConnectorType[dcbHead.type] + " ";
                        output += chalk_1.default.green("EdidPort: ") + dcbHead.edidPort + " ";
                        output += chalk_1.default.green("Head: ") + dcbHead.headBitmask + " ";
                        output += chalk_1.default.green("Connector: ") + dcbHead.con + " ";
                        output += chalk_1.default.green("Bus: ") + dcbHead.bus + " ";
                        output += chalk_1.default.green("Loc: ") + dcbHead.loc + " ";
                        output += "\n";
                        output += chalk_1.default.green("BDR: ") + dcbHead.bdr + " ";
                        output += chalk_1.default.green("BBDR: ") + dcbHead.bbdr + " ";
                        output += chalk_1.default.green("Resources: ") + dcbHead.outputResources + " ";
                        output += chalk_1.default.green("Virtual: ") + dcbHead.virtual + " ";
                        console.log(output);
                    });
                    return [4 /*yield*/, prompt("\nPress enter to continue")];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function chooseROM() {
    return __awaiter(this, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!true) return [3 /*break*/, 5];
                    console.clear();
                    header();
                    console.log("Enter in the location of your VBIOS\n");
                    console.log(chalk_1.default.cyan("Windows Tip: ") + " Shift + Right click your VBIOS and click \"Copy Path\"");
                    console.log(chalk_1.default.cyan("Linooox/macOS: ") + " Drag and drop your VBIOS into this prompt\n");
                    return [4 /*yield*/, prompt("New ROM Location (q to go to the menu)")];
                case 1:
                    res = _a.sent();
                    res = res.replace(/[\n\r"]/g, "").trim();
                    console.log("Parsed Path: " + res);
                    if (res == "q")
                        return [2 /*return*/];
                    if (!fs_1.existsSync(res)) return [3 /*break*/, 2];
                    romFile = res;
                    return [3 /*break*/, 5];
                case 2: return [4 /*yield*/, prompt("Unable to find ROM! Press enter to continue")];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [3 /*break*/, 0];
                case 5:
                    readRom();
                    return [4 /*yield*/, prompt("\nPress enter to continue")];
                case 6:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function listDisplaysAndNvcap() {
    console.log("Displays");
    filteredEntries.forEach(function (display, index) {
        var output = chalk_1.default.blueBright("(" + (index + 1) + ")");
        output += chalk_1.default.green(" Type: ");
        output += DisplayType[display.type];
        output += chalk_1.default.green("\tSupported Heads: ");
        // Max of 4 heads
        for (var i = 0; i < 4; i++) {
            if (display.headBitmask & (1 << i)) {
                output += i + 1 + ",";
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
    var headTVOut = chalk_1.default.blueBright("(TV) ") + "[";
    var head0Out = chalk_1.default.blueBright("(1)  ") + "[";
    var head1Out = chalk_1.default.blueBright("(2)  ") + "[";
    headTV.forEach(function (dcbEntry) { return headTVOut += (dcbEntry + 1) + ","; });
    head0.forEach(function (dcbEntry) { return head0Out += (dcbEntry + 1) + ","; });
    head1.forEach(function (dcbEntry) { return head1Out += (dcbEntry + 1) + ","; });
    // trim last comma
    if (headTV.length > 0)
        headTVOut = headTVOut.substring(0, headTVOut.length - 1);
    if (head0.length > 0)
        head0Out = head0Out.substring(0, head0Out.length - 1);
    if (head1.length > 0)
        head1Out = head1Out.substring(0, head1Out.length - 1);
    headTVOut += "]";
    head0Out += "]";
    head1Out += "]";
    console.log(headTVOut);
    console.log(head0Out);
    console.log(head1Out);
    console.log();
    console.log("NVCAP:");
    console.log(chalk_1.default.blueBright("(n1)") + chalk_1.default.green(" Version: ") + nvcap.version);
    console.log(chalk_1.default.blueBright("(n2)") + chalk_1.default.green(" Composite: ") + nvcap.composite);
    console.log(chalk_1.default.blueBright("(n3)") + chalk_1.default.green(" Script Based Power/Backlight: ") + nvcap.scriptBasedPowerAndBacklight);
    console.log(chalk_1.default.blueBright("(n4)") + chalk_1.default.green(" Field F: ") + "0x" + nvcap.fieldF.toString(16));
    console.log();
    console.log("To add/remove a display to/from a head, type <display> <head> (ex: \"1 1\")");
    console.log("To change an NVCAP value, do n<number> <new value> (ex: \"n2 true\")");
    console.log("To calculate the NVCAP value, type c/create");
}
function drawNVCap() {
    return __awaiter(this, void 0, void 0, function () {
        var result, splitArr, arr, display, head, command, _a, newValue, bool;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!true) return [3 /*break*/, 22];
                    console.clear();
                    header();
                    listDisplaysAndNvcap();
                    return [4 /*yield*/, prompt("To return to the previous menu, use q/quit")];
                case 1:
                    result = _b.sent();
                    console.log();
                    if (result.length == 0)
                        return [3 /*break*/, 0];
                    if (result.toLowerCase().startsWith("q"))
                        return [2 /*return*/];
                    if (!result.toLowerCase().startsWith("c")) return [3 /*break*/, 3];
                    console.log();
                    createNVCap();
                    return [4 /*yield*/, prompt("Press enter to continue (or q/quit to exit)")];
                case 2:
                    if ((_b.sent()).toLowerCase().startsWith("q")) {
                        showGoodbye();
                        process.exit(0);
                    }
                    return [3 /*break*/, 0];
                case 3:
                    splitArr = result.split(" ");
                    if (!(splitArr.length == 2 && parseInt(splitArr[0]) &&
                        (parseInt(splitArr[1]) || splitArr[1].toLowerCase().startsWith("tv")))) return [3 /*break*/, 12];
                    arr = null;
                    ;
                    display = parseInt(splitArr[0]);
                    if (!(display < 1 || display > filteredEntries.length)) return [3 /*break*/, 5];
                    return [4 /*yield*/, prompt("Unknown display - press enter to continue")];
                case 4:
                    _b.sent();
                    return [3 /*break*/, 0];
                case 5:
                    display--;
                    if (!splitArr[1].toLowerCase().startsWith("tv")) return [3 /*break*/, 8];
                    if (!(filteredEntries[display].type != DisplayType.TV)) return [3 /*break*/, 7];
                    return [4 /*yield*/, prompt("Only a display of type TV can be put in the TV Mask - Pres enter to continue")];
                case 6:
                    _b.sent();
                    return [3 /*break*/, 0];
                case 7:
                    arr = headTV;
                    return [3 /*break*/, 9];
                case 8:
                    head = parseInt(splitArr[1]);
                    if (head == 1) {
                        arr = head0;
                    }
                    else if (head == 2) {
                        arr = head1;
                    }
                    _b.label = 9;
                case 9:
                    if (!(arr == null)) return [3 /*break*/, 11];
                    return [4 /*yield*/, prompt("Unknown head - press enter to continue")];
                case 10:
                    _b.sent();
                    return [3 /*break*/, 0];
                case 11:
                    if (arr.includes(display)) {
                        arr.splice(arr.indexOf(display), 1);
                    }
                    else {
                        arr.push(display);
                    }
                    return [3 /*break*/, 0];
                case 12:
                    splitArr[0] = splitArr[0].replace("n", "");
                    if (!parseInt(splitArr[0])) return [3 /*break*/, 20];
                    command = parseInt(splitArr[0]) - 1;
                    _a = command;
                    switch (_a) {
                        case 0: return [3 /*break*/, 13];
                        case 3: return [3 /*break*/, 13];
                        case 1: return [3 /*break*/, 16];
                        case 2: return [3 /*break*/, 16];
                    }
                    return [3 /*break*/, 20];
                case 13:
                    newValue = parseInt(splitArr[1]);
                    if (!(newValue < 0 || newValue > 0xf)) return [3 /*break*/, 15];
                    return [4 /*yield*/, prompt("New value is out of bounds! Must be between 0 and 0xf - press enter to continue")];
                case 14:
                    _b.sent();
                    return [3 /*break*/, 0];
                case 15:
                    if (command == 0)
                        nvcap.version = newValue;
                    if (command == 3)
                        nvcap.fieldF = newValue;
                    return [3 /*break*/, 20];
                case 16:
                    if (splitArr.length < 2) {
                        if (command == 1) {
                            nvcap.composite = !nvcap.composite;
                        }
                        else {
                            nvcap.scriptBasedPowerAndBacklight = !nvcap.scriptBasedPowerAndBacklight;
                        }
                        return [3 /*break*/, 0];
                    }
                    splitArr[1] = splitArr[1].replace("\n", "").toLowerCase();
                    bool = false;
                    if (!splitArr[1].startsWith("t")) return [3 /*break*/, 17];
                    bool = true;
                    return [3 /*break*/, 19];
                case 17:
                    if (!!splitArr[1].startsWith("f")) return [3 /*break*/, 19];
                    return [4 /*yield*/, prompt("Unrecognized new value! Must be true or false - press enter to continue")];
                case 18:
                    _b.sent();
                    return [3 /*break*/, 0];
                case 19:
                    if (command == 1) {
                        nvcap.composite = bool;
                    }
                    else {
                        nvcap.scriptBasedPowerAndBacklight = bool;
                    }
                    return [3 /*break*/, 20];
                case 20: return [4 /*yield*/, prompt("Unknown command - press enter to continue")];
                case 21:
                    _b.sent();
                    return [3 /*break*/, 0];
                case 22: return [2 /*return*/];
            }
        });
    });
}
function createHeadMask(displays) {
    var mask = 0;
    displays.forEach(function (displayIndex) {
        var dcbEntries = filteredEntries[displayIndex].dcbEntries;
        dcbEntries.forEach(function (dcbIndex) {
            mask |= (1 << dcbIndex);
        });
    });
    return mask;
}
function createNVCap() {
    nvcap.tvDCBMask = createHeadMask(headTV);
    nvcap.head0DCBMask = createHeadMask(head0);
    nvcap.head1DCBMask = createHeadMask(head1);
    console.log("TV Mask: 0x" + nvcap.tvDCBMask.toString(16));
    console.log("Head 1 Mask: 0x" + nvcap.head0DCBMask.toString(16));
    console.log("Head 2 Mask: 0x" + nvcap.head1DCBMask.toString(16));
    var buffer = Buffer.alloc(20);
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
    var output = "NVCAP: ";
    // Pad to always be 8 digits long
    for (var i = 0; i < 5; i++) {
        var number = buffer.readInt32BE(i * 4);
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
    var hour = new Date().getHours();
    if (hour > 3 && hour < 12) {
        console.log("Have a nice morning!\n");
    }
    else if (hour >= 12 && hour < 17) {
        console.log("Have a nice afternoon!\n");
    }
    else if (hour >= 17 && hour < 21) {
        console.log("Have a nice evening!\n");
    }
    else {
        console.log("Have a nice night!\n");
    }
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var romExists, output, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!!fs_1.existsSync(romFile)) return [3 /*break*/, 2];
                    return [4 /*yield*/, chooseROM()];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2:
                    readRom();
                    _a.label = 3;
                case 3:
                    if (!true) return [3 /*break*/, 11];
                    romExists = fs_1.existsSync(romFile);
                    console.clear();
                    header();
                    output = chalk_1.default.cyan("(1) ") + "Choose VBIOS/ROM file\n";
                    if (romExists) {
                        output += chalk_1.default.cyan("(2) ") + "Show DCB Entries\n";
                        output += chalk_1.default.cyan("(3) ") + "Calculate NVCAP\n";
                    }
                    output += "\n";
                    if (romExists) {
                        output += "Current ROM file: " + chalk_1.default.green(romFile);
                    }
                    else {
                        output += "Current ROM file (not found): " + chalk_1.default.red(romFile);
                    }
                    console.log(output);
                    return [4 /*yield*/, prompt("Type in the number to select your option, or \"q\"/\"quit\" to quit")];
                case 4:
                    result = _a.sent();
                    if (result.toLowerCase().startsWith("q"))
                        return [3 /*break*/, 11];
                    if (!result.toLowerCase().startsWith("1")) return [3 /*break*/, 6];
                    return [4 /*yield*/, chooseROM()];
                case 5:
                    _a.sent();
                    _a.label = 6;
                case 6:
                    if (!romExists) return [3 /*break*/, 10];
                    if (!result.toLowerCase().startsWith("2")) return [3 /*break*/, 8];
                    return [4 /*yield*/, dumpDCBEntries()];
                case 7:
                    _a.sent();
                    _a.label = 8;
                case 8:
                    if (!result.toLowerCase().startsWith("3")) return [3 /*break*/, 10];
                    return [4 /*yield*/, drawNVCap()];
                case 9:
                    _a.sent();
                    _a.label = 10;
                case 10: return [3 /*break*/, 3];
                case 11:
                    showGoodbye();
                    return [2 /*return*/];
            }
        });
    });
}
main();

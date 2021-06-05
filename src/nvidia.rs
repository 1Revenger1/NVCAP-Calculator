
use colored::*;
use std::fs;
use crate::util::{self, NVErrors};

// DCB numbers
const DCB_SIGNATURE: u32    = 0x4edcbdcb;
const DCB_MAX_VERSION: u8   = 0x42;
const DCB_MIN_VERSION: u8   = 0x30;

const DCB_HEADER_ADDR: usize        = 0x36;

// DCB offsets
const DCB_SIZE_OFFSET: usize        = 0x1;
const DCB_ENTRY_COUNT_OFFSET: usize = 0x2;
const DCB_ENTRY_SIZE_OFFSET: usize  = 0x3;
const DCB_SIGNATURE_OFFSET: usize   = 0x6;

// DCB connector types
const DCB_CONN_CRT: u32     = 0; // VGA
const DCB_CONN_TV: u32      = 1; // Composite
const DCB_CONN_TMDS: u32    = 2; // DVI, HDMI, etc
const DCB_CONN_LVDS: u32    = 3; // Laptop Disp
const DCB_CONN_SDI: u32     = 5; // SDI
const DCB_CONN_DP: u32      = 6; // DisplayPort

pub struct DcbEntry {
    pub entry_type: u32,
    pub edid_port: u32,
    pub head_bitmask: u32,
    pub con: u32,
    pub bus: u32,
    pub loc: u32,
    pub bdr: u32,
    pub bbdr: u32,
    pub output_resources: u32,
    pub entry_is_virtual: bool,
    pub reserved: u32,
    pub entry: u8,
}

pub fn dcb_type_to_string(dcb_type: u32) -> &'static str {
    match dcb_type {
        DCB_CONN_CRT => "CRT",
        DCB_CONN_TV => "TV",
        DCB_CONN_TMDS => "TMDS",
        DCB_CONN_LVDS => "LVDS",
        DCB_CONN_SDI => "SDI",
        DCB_CONN_DP => "DisplayPort",
        _ => "Unknown",
    }
}

pub fn parse_signature(version: u8, rom: &Vec<u8>, offset: usize) -> bool {
    if version >= DCB_MAX_VERSION {
        println!("Unknown version");
        return false;
    } 
    
    if version < DCB_MIN_VERSION {
        println!("To old version - GPU incompatible with macOS");
        return false;
    }

    if util::read_uint_32_le(rom, offset + DCB_SIGNATURE_OFFSET) != DCB_SIGNATURE {
        println!("Corrupt VBIOS");
        return false;
    }

    true
}

fn parse_dcb_entries(rom: &Vec<u8>, offset: usize, dcb_size: usize, parsed_entries: &mut Vec<DcbEntry>) {
    let dcb_entries: u8 = rom[offset + DCB_ENTRY_COUNT_OFFSET];
    let dcb_entry_size: u8 = rom[offset + DCB_ENTRY_SIZE_OFFSET];

    println!("{} DCB entries of size {:#x} bytes\n", dcb_entries, dcb_entry_size);

    for number in 0..dcb_entries {
        let entry_offset = offset + dcb_size + (dcb_entry_size * number) as usize;
        let conn: u32 = util::read_uint_32_le(rom, entry_offset);
        
        let dcb_head = DcbEntry {
            entry_type: conn & 0xf,
            edid_port: (conn >> 4) & 0xf,
            head_bitmask: (conn >> 8) & 0xf,
            con: (conn >> 12) & 0xf,
            bus: (conn >> 16) & 0xf,
            loc: (conn >> 20) & 0x3,
            bdr: (conn >> 22) & 0x1,
            bbdr: (conn >> 23) & 0x1,
            output_resources: (conn >> 24) & 0xf,
            entry_is_virtual: ((conn >> 28) & 0x1) == 1,
            reserved: (conn >> 28) & 0x7,
            entry: number,
        };

        // Skip entry
        if dcb_head.entry_type == 0xf {
            continue;
        }

        // EOL - stop parsing entries
        if dcb_head.entry_type == 0xe {
            break;
        }

        parsed_entries.push(dcb_head);
    }

    println!("Found {} populated DCB Entries", parsed_entries.len());
}

fn get_display_type(entry: &DcbEntry) -> util::DisplayType {
    match entry.entry_type {
        DCB_CONN_LVDS => util::DisplayType::LVDS,
        DCB_CONN_CRT => util::DisplayType::Analog,
        DCB_CONN_TV => util::DisplayType::TV,
        _ => util::DisplayType::Digital,
    }
}

// Merge DVI entries together and condense into info we just need for the user
fn merge_dcb_entries(parsed_dcb_entries: &mut Vec<DcbEntry>, filtered_pub_entries: &mut Vec<util::Display>) {
    let mut merged_entries: Vec<u8> = Vec::new();
    for dcb_entry in parsed_dcb_entries.iter() {
        if merged_entries.contains(&dcb_entry.entry) {
            continue;
        }

        // https://nvidia.github.io/open-gpu-doc/DCB/DCB-4.x-Specification.html#_dcb_device_entries
        // Use Bus id, not connector index, to merge devices together
        let dcb_entry_2 = parsed_dcb_entries.iter().find(|x| (x.bus == dcb_entry.bus) && (x.entry != dcb_entry.entry));

        match dcb_entry_2 {
            Some(x) => {
                merged_entries.push(x.entry);

                let mut disp_type = util::DisplayType::DVI;
                if dcb_entry.entry_type == x.entry_type {
                    disp_type = get_display_type(x)
                }

                let display = util::Display {
                    disp_type: disp_type,
                    dcb_entries: vec![dcb_entry.entry, x.entry],
                    head_bitmask: dcb_entry.head_bitmask & x.head_bitmask,
                };

                filtered_pub_entries.push(display);
            }
            None => {
                let display = util::Display {
                    disp_type: get_display_type(dcb_entry),
                    dcb_entries: vec![dcb_entry.entry],
                    head_bitmask: dcb_entry.head_bitmask,
                };

                filtered_pub_entries.push(display);
            }
        }
    }
}

pub fn read_rom(filename: &str) -> Result<(Vec<DcbEntry>, Vec<util::Display>), NVErrors> {
    let rom: Vec<u8>;
    let mut parsed_dcb_entries: Vec<DcbEntry> = Vec::new();
    let mut filtered_disp_entries: Vec<util::Display> = Vec::new();


    let rom_res = fs::read(filename);
    match rom_res {
        Ok(bytes) => {
            println!("Read ROM file {}, which is {} bytes long", filename, bytes.len());
            rom = bytes;    
        }
        Err(e) => {
            println!("{}", "Rom file not found!".red());
            println!("{}", e);
            return Err(NVErrors::FileNotFound);
        }
    }

    // DCB 3.0 and 4.0 are very similar, just treat them the same
    let dcb_header_offset: usize = util::read_uint_16_le(&rom, DCB_HEADER_ADDR) as usize;
    let dcb_version: u8 = rom[dcb_header_offset];
    let ver_maj: u8 = dcb_version >> 4;
    let ver_min: u8 = dcb_version & 0xf;
    let dcb_size: usize = rom[dcb_header_offset + DCB_SIZE_OFFSET] as usize;
    
    println!("DCB header is at {:#x} with length {:#x}", dcb_header_offset, dcb_size);
    println!("DCB Version {}.{}", ver_maj, ver_min);

    if !parse_signature(dcb_version, &rom, dcb_header_offset) {
        println!("{}", "Invalid DCB Signature".red());
        return Err(NVErrors::Corrupted);
    }

    parse_dcb_entries(&rom, dcb_header_offset, dcb_size, &mut parsed_dcb_entries);
    merge_dcb_entries(&mut parsed_dcb_entries, &mut filtered_disp_entries);
    Ok((parsed_dcb_entries, filtered_disp_entries))
}
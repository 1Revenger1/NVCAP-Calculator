mod nvidia;
mod util;
use colored::*;
use std::{io};
use std::io::prelude::*;

fn main() {
    let dcb_entries_opt: Vec<nvidia::DcbEntry>;
    let display_entries_opt: Vec<util::Display>;
    let mut filename = "NVIDIA.GTX480.1536.100414.rom".to_owned();

    let res = choose_rom();
    match res {
        Ok(tuple) => {
            filename = tuple.0;
            dcb_entries_opt = tuple.1;
            display_entries_opt = tuple.2;
        },
        Err(_) => {
            util::goodbye();
            return;
        }
    }

    loop {
        let mut input = String::new();
        util::header();

        println!("{} Show DCB Entries", "(1)".cyan());
        println!("{} Calculate NVCAP", "(2)".cyan());
        println!("");
        println!("Current ROM file: {}", filename.green());

        util::prompt("Type in the number to select your option, or \"q\"/\"quit\" to quit: ", &mut input);
        input = input.trim_end().to_owned();
        println!("{}", input);

        if "1".eq(&input) {
            dump_dcb_entries(&dcb_entries_opt);
        } else if "2".eq(&input) {
            continue;
        } else if input.starts_with("q") {
            break;
        }
    }
    
    util::press_any_key();

    util::goodbye();
}

fn choose_rom () -> Result<(String, Vec<nvidia::DcbEntry>, Vec<util::Display>), util::NVErrors> {
    let mut filename = String::new();
    loop {
        util::clear_console();
        util::header();

        println!("Enter in the location of your VBIOS (or q/quit to exit to menu)\n");
        println!("{} Shift + Right click your VBIOS and click \"Copy Path\"", "Windows Tip: ".cyan());
        println!("{} Drag and drop your VBIOS into this prompt", "Linooox/macOS: ".cyan());
        print!("Location of VBIOS: ");

        io::stdout().flush().unwrap();

        let result = io::stdin().read_line(&mut filename);
        match result {
            Err(_) => {
                continue;
            }

            Ok(_) => {
                // Remove newline at end and quotes as those mess up finding the ROM
                filename = filename.trim_end().replace("\"", "").to_owned();
            }
        }

        if filename.to_lowercase().starts_with("q") {
            return Err(util::NVErrors::FileNotFound);
        }

        let read_result = nvidia::read_rom(&filename);
        match read_result {
            Err(_) => {
                util::press_any_key();
                continue;
            }
            Ok(res) => {
                util::press_any_key();
                return Ok((filename, res.0, res.1));
            }
        }
    }
}

fn dump_dcb_entries(dcb_entries: &Vec<nvidia::DcbEntry>) {
    util::header();
    for i in 0..dcb_entries.len() {
        let dcb_entry = &dcb_entries[i];
        println!("{} {:#x}", "DCB Entry".bright_blue(), i);
        println!("{} {} {} {} {} {} {} {} {} {} {} {}",
            "Type:".green(), nvidia::dcb_type_to_string(dcb_entry.entry_type),
            "EdidPort:".green(), dcb_entry.edid_port,
            "Head:".green(), dcb_entry.head_bitmask,
            "Connector:".green(), dcb_entry.con,
            "Bus:".green(), dcb_entry.bus,
            "Loc:".green(), dcb_entry.loc,
        );

        println!("{} {} {} {} {} {} {} {}",
            "BDR:".green(), dcb_entry.bdr,
            "BBDR:".green(), dcb_entry.bbdr,
            "Resources:".green(), dcb_entry.output_resources,
            "Virtual:".green(), dcb_entry.entry_is_virtual,
        );
    }

    util::press_any_key();
}

fn list_displays_and_nvcap(displays: &Vec<util::Display>) {
    for i in 0..displays.len() {
        let display = displays[i];
    }
    for display in displays {
        println!("Type: {:?} - Entries: {:?} - Head Bitmask {}", display.disp_type, display.dcb_entries, display.head_bitmask);
    }
}
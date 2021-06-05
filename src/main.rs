mod nvidia;
mod util;
use colored::*;
use std::{io};
use std::io::prelude::*;

fn main() {
    // let filename = "9600MGT.rom";
    let dcb_entries: Option<Vec<nvidia::DcbEntry>>;
    let display_entries: Option<Vec<util::Display>>;
    let filename = "11NVIDIA.GTX480.1536.100414.rom";
    let res = nvidia::read_rom(filename);

    match res {
        Err(_) => {
            let tuple = choose_rom();
            dcb_entries = tuple.0;
            display_entries = tuple.1;
        }
        Ok(tuple) => {
            dcb_entries = Some(tuple.0);
            display_entries = Some(tuple.1);
        }
    }
    
    if dcb_entries.is_none() {
        util::goodbye();
        return;
    }

    util::header();

    dump_dcb_entries(&dcb_entries.unwrap());
    println!("");

    for display in display_entries.unwrap() {
        println!("Type: {:?} - Entries: {:?} - Head Bitmask {}", display.disp_type, display.dcb_entries, display.head_bitmask);
    }
    
    util::press_any_key();

    util::goodbye();
}

fn choose_rom () -> (Option<Vec<nvidia::DcbEntry>>, Option<Vec<util::Display>>) {
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
                filename = filename.trim_end().replace("\"", "");
            }
        }

        if filename.to_lowercase().starts_with("q") {
            return (None, None);
        }

        let read_result = nvidia::read_rom(&filename);
        match read_result {
            Err(_) => {
                util::press_any_key();
                continue;
            }
            Ok(res) => {
                util::press_any_key();
                return (Some(res.0), Some(res.1));
            }
        }
    }
}

fn dump_dcb_entries(dcb_entries: &Vec<nvidia::DcbEntry>) {
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
mod nvidia;
mod util;
use colored::*;
use std::process::exit;
use std::{io};
use std::io::prelude::*;

use crate::nvidia::{NVCAP_VERSION_MODERN};

fn main() {
    let dcb_entries_opt: Vec<nvidia::DcbEntry>;
    let display_entries_opt: Vec<util::Display>;
    let filename;

    ctrlc::set_handler(move || {
        util::clear_console();
        util::goodbye();
        exit(0);
    }).expect("Error setting Ctrl-c handler");

    #[cfg(target_os = "windows")]
    control::set_virtual_terminal(true).unwrap();

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
        let mut opt: u32 = 0;
        util::header();

        println!("{} Show DCB Entries", "(1)".cyan());
        println!("{} Calculate NVCAP", "(2)".cyan());
        println!("");
        println!("Current ROM file: {}", filename.green());

        util::prompt("Type in the number to select your option, or \"q\"/\"quit\" to quit: ", &mut input);
        input = input.trim().to_owned();
        match input.parse::<u32>() {
            Ok(val) => { opt = val; }
            Err(_) => {}
        }

        if opt == 1 {
            dump_dcb_entries(&dcb_entries_opt);
        } else if opt == 2 {
            draw_nvcap(&display_entries_opt);
        } else if input.starts_with("q") {
            break;
        }
    }

    util::goodbye();
}

fn choose_rom () -> Result<(String, Vec<nvidia::DcbEntry>, Vec<util::Display>), util::NVErrors> {
    loop {
        let mut filename = String::new();
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

        println!("{}", filename);

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
        println!("{} {} ({:#x}) {} {} {} {} {} {} {} {} {} {}",
            "Type:".green(), nvidia::dcb_type_to_string(dcb_entry.entry_type), dcb_entry.entry_type,
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

fn draw_nvcap(displays: &Vec<util::Display>) {
    // Store indexes to displays
    let mut head_tv: Vec<usize> = vec![];
    let mut head_0: Vec<usize> = vec![];
    let mut head_1: Vec<usize> = vec![];

    filter_displays(displays, &mut head_tv, &mut head_0, &mut head_1);

    let mut nvcap = nvidia::NVCAP {
        version: NVCAP_VERSION_MODERN,
        is_mobile: util::is_mobile(displays),
        is_composite: util::has_tv(displays),
        unknown_1: 0,
        dcb_tv_mask: 0,
        dcb_0_mask: 0,
        dcb_1_mask: 0,
        dcb_2_mask: 0,
        dcb_3_mask: 0,
        script_based_power_and_backlight: false,
        field_f: 0x0f,
        edid_bitness: 0,
        unknown_2: [0, 0, 0]
    };

    loop {
        util::clear_console();
        util::header();

        list_displays(displays, &head_tv, &head_0, &head_1, false);
        list_options(&nvcap);        

        let mut input = String::new();
        let mut opt: u32 = 0;

        util::prompt("Select one of the above options (1-5, q, or c): ", &mut input);
        input = input.trim().to_lowercase().to_owned();
        match input.parse::<u32>() {
            Ok(val) => { opt = val; }
            Err(_) => {}
        }

        match opt {
            1 => { choose_heads(displays, &mut head_tv, &mut head_0, &mut head_1) }
            2 => { nvcap.is_mobile = !nvcap.is_mobile }
            3 => { choose_version(&mut nvcap); }
            4 => { nvcap.is_composite = !nvcap.is_composite }
            5 => { nvcap.script_based_power_and_backlight = !nvcap.script_based_power_and_backlight }
            6 => { choose_f(&mut nvcap); }
            _ => { /* Do nothing */ }
        }

        if input.eq("c") {    
            nvidia::create_nvcap_value(&mut nvcap, displays, &head_tv, &head_0, &head_1);
        } else if input.eq("q") {
            break;
        } 
    }
}

// Automatically assign displays to heads when they should obviously be there
fn filter_displays(displays: &Vec<util::Display>, head_tv: &mut Vec<usize>, head_0: &mut Vec<usize>, head_1: &mut Vec<usize>) {

    // If mobile, then the internal display should be on one head with everything else on another head
    let is_mobile = util::is_mobile(displays);

    for i in 0..displays.len() {
        let display = &displays[i];
        // Composite/TV can exist on it's own head
        if display.disp_type == util::DisplayType::TV {
            head_tv.push(i);
            continue;
        }

        if !is_mobile {
            continue;
        }

        if display.disp_type == util::DisplayType::LVDS &&
           display.head_bitmask & nvidia::HEAD_0_BITMASK != 0 {
            head_0.push(i);
        } else if display.head_bitmask & nvidia::HEAD_1_BITMASK != 0 {
            head_1.push(i);
        }
    }
}

fn list_displays(displays: &Vec<util::Display>, head_tv: &Vec<usize>, head_0: &Vec<usize>, head_1: &Vec<usize>, color: bool) {

    let mut head_tv_out = format!("{} - [", "TV");
    let mut head_1_out = format!("{} - [", "1");
    let mut head_2_out = format!("{} - [", "2");

    if color {
        head_tv_out = format!("{} - [", "TV".green());
        head_1_out = format!("{} - [", "1".green());
        head_2_out = format!("{} - [", "2".green());
    }

    println!("Displays:");
    for i in 0..displays.len() {
        let display = &displays[i];
        let mut heads = "".to_owned();

        for i in 0..4 {
            if display.head_bitmask & (1 << i) != 0 {
                heads += &format!("{}, ", i + 1);
            }
        }

        heads = heads[0..(heads.len() - 2)].to_owned();

        if display.disp_type == util::DisplayType::TV {
            heads += ", TV";
        }


        let idx_str = &format!("({})", i + 1);
        if color {
            print!("{} ", idx_str.bright_blue());
        } else {
            print!("{} ", idx_str);
        }

        println!("{} {:?}    {} {}",
            "Type:",
            display.disp_type,
            "\tSupported Heads:",
            heads
        );
    }

    println!();

    head_tv.iter().for_each(|disp| head_tv_out += &format!("{},", disp + 1));
    head_0.iter().for_each(|disp| head_1_out += &format!("{},", disp + 1));
    head_1.iter().for_each(|disp| head_2_out += &format!("{},", disp + 1));
    
    if head_tv.len() > 0 { head_tv_out = head_tv_out[0..(head_tv_out.len() - 1)].to_owned(); }
    if head_0.len() > 0 { head_1_out = head_1_out[0..(head_1_out.len() - 1)].to_owned(); }
    if head_1.len() > 0 { head_2_out = head_2_out[0..(head_2_out.len() - 1)].to_owned(); }

    head_tv_out += "]";
    head_1_out += "]";
    head_2_out += "]";

    println!("NVCAP Heads:");
    if util::has_tv(displays) {
        println!("{}", head_tv_out);
    }
    println!("{}", head_1_out);
    println!("{}", head_2_out);
    println!();
}

fn list_options(nvcap: &nvidia::NVCAP) {
    println!("{} Add/remove displays from head", "(1)".bright_blue());
    println!("{} Mobile: {}", "(2)".bright_blue(), nvcap.is_mobile);
    println!("{} Version: {}", "(3)".bright_blue(), nvcap.version);
    println!("{} Composite: {}", "(4)".bright_blue(),  nvcap.is_composite);
    println!("{} Script Based Power/Backlight: {}", "(5)".bright_blue(),
             nvcap.script_based_power_and_backlight);
    println!("{} Field F: {:#x}", "(6)".bright_blue(),  nvcap.field_f);
    println!();
    println!("{} Return to previous menu", "(q)".bright_blue());
    println!("{} Print out current NVCAP value", "(c)".bright_blue());
}

fn toggle_display(head: &mut Vec<usize>, disp_idx: usize) {
    match head.iter().position(|&x| x == disp_idx) {
        Some(idx) => { head.remove(idx); }
        None => { head.push(disp_idx); }
    }
}

fn choose_heads(displays: &Vec<util::Display>, head_tv: &mut Vec<usize>,
                head_0: &mut Vec<usize>, head_1: &mut Vec<usize>) {
    let has_tv = util::has_tv(displays);
    
    loop {
        let mut input = String::new();
        let mut disp_idx: usize;
        let mut head: usize = 0;

        util::header();
        list_displays(displays, head_tv, head_0, head_1, true);
        
        println!("Select a display and head to add/remove it from the chosen head");
        println!("The input should look like \"{} {}\"", "<display>".bright_blue(), "<head>".green());
        println!("For example, \"1 2\" for display 1, head 2");
        println!();
        println!("{} Return to previous menu", "(q)".bright_blue());

        util::prompt("Display/Head: ", &mut input);
        input = input.trim().to_lowercase();

        if input.eq("q") {
            break;
        }

        let args: Vec<&str> = input.split(" ").collect();
        
        if args.len() != 2 {
            continue;
        }

        // Parse display
        match args[0].parse::<usize>() {
            Ok(opt) => { disp_idx = opt; }
            Err(_) => { continue; }
        }

        if disp_idx > displays.len() {
            // Out of index display
            continue;
        }

        // Add/remove display from head
        match args[1].parse::<usize>() {
            Ok(opt) => { head = opt; }
            Err(_) => { /* Could be TV, handled below */ }
        }

        // Vec is 0 based idx, we start at 1 when displaying though
        disp_idx -= 1;
        let disp = &displays[disp_idx];

        match head {
            1 => {
                if disp.head_bitmask & nvidia::HEAD_0_BITMASK == 0 {
                    continue;
                } 

                toggle_display(head_0, disp_idx); }
            2 => { 
                if disp.head_bitmask & nvidia::HEAD_1_BITMASK == 0 {
                    continue;
                }
                
                toggle_display(head_1, disp_idx); }
            _ => {
                // Maybe TV
                if !has_tv || !args[1].eq("tv") {
                    continue;
                }

                toggle_display(head_tv, disp_idx);
             }
        }
    }
}

fn choose_f(nvcap: &mut nvidia::NVCAP) {
    loop {
        let mut input = String::new();
        util::header();

        println!("Select f (unknown) field");
        println!("0x0F for 300 series and newer GPUs");
        println!("0x07 for older GPUs");
        println!();
        println!("{} Return to previous menu", "(q)".bright_blue());
    
        util::prompt("New Value: ", &mut input);
        input = input.trim().to_lowercase();
    
        if input.eq("q") {
            break;
        }

        let no_prefix = input.trim_start_matches("0x");

        match u8::from_str_radix(no_prefix, 16) {
            Ok(val) => { nvcap.field_f = val; break; }
            Err(_) => { continue; }
        }
    }
}

fn choose_version(nvcap: &mut nvidia::NVCAP) {
    loop {
        let mut input = String::new();
        util::header();

        println!("Select version");
        println!("5 for 8000 series cards or newer (Most new cards)");
        println!("4 for 6000/7000 series cards");
        println!();
        println!("{} Return to previous menu", "(q)".bright_blue());
    
        util::prompt("New Value: ", &mut input);
        input = input.trim().to_lowercase();
    
        if input.eq("q") {
            break;
        }

        let no_prefix = input.trim_start_matches("0x");

        match u8::from_str_radix(no_prefix, 16) {
            Ok(val) => { nvcap.version = val; break; }
            Err(_) => { continue; }
        }
    }
}
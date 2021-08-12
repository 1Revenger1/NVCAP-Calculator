use std::{io};
use colored::*;
use std::io::prelude::*;
use chrono::{Local, Timelike};

#[derive(Debug)]
#[derive(PartialEq)]
pub enum DisplayType {
    LVDS,
    TV,
    Analog,
    Digital,
    DVI,
}

pub enum NVErrors {
    FileNotFound,
    Corrupted,
}

pub struct Display {
    pub disp_type: DisplayType,
    pub dcb_entries: Vec<u8>,
    pub head_bitmask: u32,
}

pub fn read_uint_16_le(rom: &Vec<u8>, offset: usize) -> u16 {
    return ((rom[offset] as u16)) + ((rom[offset + 1] as u16) << 8);
}

pub fn read_uint_32_le(rom: &Vec<u8>, offset: usize) -> u32 {
    return (rom[offset] as u32) + 
           ((rom[offset + 1] as u32) << 8) + 
           ((rom[offset + 2] as u32) << 16) + 
           ((rom[offset + 3] as u32) << 24);
}

pub fn press_any_key() {
    let mut buf = String::new();
    prompt("Press the enter key to continue...", &mut buf);
}

pub fn prompt(prompt: &str, input: &mut String) {
    let mut stdout = io::stdout();
    let stdin = io::stdin();

    write!(stdout, "{}", prompt).unwrap();
    stdout.flush().unwrap();
    stdin.read_line(input).unwrap();
}

pub fn clear_console() {
    print!("{esc}c", esc = 27 as char);
}

pub fn goodbye() {
    clear_console();
    header();

    println!("By 1Revenger1\n");
    println!("Thanks for using this program - if you have any issues,");
    println!("visit github.com/1Revenger1/NVCAPCalculator");
    println!("For more projects, visit github.com/1Revenger1\n");

    let hour = Local::now().time().hour();
    match hour {
        3..=11 => println!("Have a nice morning!"),
        12..=17 => println!("Have a nice afternoon!"),
        18..=21 => println!("Have a nice evening!"),
        _ => println!("Have a nice night!"),
    };
}

pub fn header() {
    clear_console();
    println!("{}", "+--------------------------+".green());
    println!("{}{}{}", "|".green(), "     NVCAP Calculator     ".cyan(), "|".green());
    println!("{}", "+--------------------------+".green());
    println!("");
}

pub fn is_mobile(displays: &Vec<Display>) -> bool {
    for disp in displays {
        if disp.disp_type == DisplayType::LVDS {
            return true;
        }
    }

    false
}

pub fn has_tv(displays: &Vec<Display>) -> bool {
    for disp in displays {
        if disp.disp_type == DisplayType::TV {
            return true;
        }
    }

    false
}
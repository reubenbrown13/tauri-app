// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use inputbot::KeybdKey;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, atomic::AtomicBool};
use zip::ZipArchive;
use zip::write::{SimpleFileOptions, ZipWriter};
mod auto_clicker;
use auto_clicker::{
    ClickType, ClickerState, MouseButton, change_trigger_key, close_clicker, innit_clicker,
    start_clicker, stop_clicker, update_clicker_state,
};
mod alarms;
use alarms::{AudioState, play_ringtone, set_volume, stop_ringtone};

fn add_file_to_zip(
    zip: &mut ZipWriter<File>,
    file_path: &Path,
    base_path: &Path,
) -> Result<(), String> {
    let mut file = File::open(file_path).map_err(|e| e.to_string())?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;

    let relative_path = file_path
        .strip_prefix(base_path)
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .into_owned();

    zip.start_file(relative_path, SimpleFileOptions::default())
        .map_err(|e| e.to_string())?;
    zip.write_all(&buffer).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
fn export(src: String, dst: String) -> Result<(), String> {
    let src_path = PathBuf::from(&src);
    let dst_path = PathBuf::from(&dst);

    let zip_file = File::create(&dst_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(zip_file);

    for entry in fs::read_dir(&src_path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.is_file() {
            add_file_to_zip(&mut zip, &path, &src_path)?;
        }
    }

    zip.finish().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
fn import(src: String, dst: String) -> Result<(), String> {
    let src_path = PathBuf::from(&src);
    let dst_path = PathBuf::from(&dst);

    let file = File::open(&src_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;

    fs::create_dir_all(&dst_path).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let outpath = dst_path.join(file.name());

        if file.is_dir() {
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = outpath.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut outfile = File::create(&outpath).map_err(|e| e.to_string())?;
            let mut buffer = Vec::new();
            file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
            outfile.write_all(&buffer).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
fn add_default_alarm(dst: String) {
    if let Err(e) = fs::copy("./assets/alarm-default.mp3", dst) {
        println!("Error copying file: {}", e);
    }
}

pub fn run() {
    let clicker_state = ClickerState {
        running: Arc::new(std::sync::Mutex::new(AtomicBool::new(false))),
        interval: Arc::new(tokio::sync::Mutex::new(100)),
        button: Arc::new(tokio::sync::Mutex::new(MouseButton::Left)),
        click_type: Arc::new(tokio::sync::Mutex::new(ClickType::Single)),
        trigger_key: Arc::new(tokio::sync::Mutex::new(KeybdKey::BackquoteKey)),
        thread_handle: Arc::new(tokio::sync::Mutex::new(None)),
        input_events_handle: Arc::new(tokio::sync::Mutex::new(None)),
    };

    let audio_state = AudioState {
        thread_handle: Arc::new(std::sync::Mutex::new(None)),
        sink: Arc::new(std::sync::Mutex::new(None)),
    };

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .manage(clicker_state)
        .manage(audio_state)
        .invoke_handler(tauri::generate_handler![
            start_clicker,
            stop_clicker,
            innit_clicker,
            change_trigger_key,
            update_clicker_state,
            close_clicker,
            play_ringtone,
            stop_ringtone,
            set_volume,
            export,
            import,
            add_default_alarm
        ])
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .run(tauri::generate_context!())
        .unwrap();
}

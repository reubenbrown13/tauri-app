use std::{ fs::File, thread::JoinHandle, io::BufReader, sync::Arc};
use rodio::{OutputStreamBuilder, Sink, Source, Decoder};
use tauri::State;

#[derive(Clone)]
pub struct AudioState {
    pub thread_handle: Arc<std::sync::Mutex<Option<JoinHandle<()>>>>,
    pub sink: Arc<std::sync::Mutex<Option<Sink>>>
}

#[tauri::command(rename_all = "snake_case")]
pub fn play_ringtone(path: String, state: State<AudioState>) -> Result<(), String> {
    let sink_arc = state.sink.clone();
    let thread_handle_arc = state.thread_handle.clone();

    *thread_handle_arc.lock().unwrap() = Some(std::thread::spawn(move || {
        let stream_handle = OutputStreamBuilder::open_default_stream().expect("open default audio stream");
        let sink = Sink::connect_new(&stream_handle.mixer());
        let file =  BufReader::new(File::open(&path).unwrap());
        let source = Decoder::new(file).unwrap();
        sink.append(source.repeat_infinite());

        {
            let mut locked_sink = sink_arc.lock().unwrap();
            *locked_sink = Some(sink);
        }

        while {
            let locked_sink = sink_arc.lock().unwrap();
            locked_sink.is_some()
        } {
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
    }));

    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn stop_ringtone(state: State<AudioState>) -> Result<(), String> {
    let thread_handle_arc = state.thread_handle.clone();
    let sink_arc = state.sink.clone();

    if let Some(sink) = sink_arc.lock().unwrap().take() {
        sink.stop();
    }

    if let Some(handle) = thread_handle_arc.lock().unwrap().take() {
        handle.join().unwrap();
    }
    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_volume(volume: f32, state: State<AudioState>) -> Result<(), String> {
    let sink_arc = state.sink.clone();
    
    if let Some(ref sink) = *sink_arc.lock().unwrap() {
        sink.set_volume(volume);
    }
    Ok(())
}
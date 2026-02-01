use enigo::{Button, Direction, Enigo, Mouse, Settings};
use inputbot::KeybdKey;
use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tauri::{self, AppHandle, Emitter, State, async_runtime::TokioJoinHandle};
use tokio::task;

#[derive(Debug, Clone, Copy)]
pub enum MouseButton {
    Left,
    Right,
    Middle,
}

#[derive(Debug, Clone, Copy)]
pub enum ClickType {
    Single,
    Double,
}

#[derive(Clone)]
pub struct ClickerState {
    pub running: Arc<std::sync::Mutex<AtomicBool>>,
    pub interval: Arc<tokio::sync::Mutex<u64>>,
    pub button: Arc<tokio::sync::Mutex<MouseButton>>,
    pub click_type: Arc<tokio::sync::Mutex<ClickType>>,
    pub trigger_key: Arc<tokio::sync::Mutex<KeybdKey>>,
    pub thread_handle: Arc<tokio::sync::Mutex<Option<TokioJoinHandle<()>>>>,
    pub input_events_handle: Arc<tokio::sync::Mutex<Option<TokioJoinHandle<()>>>>,
}

static INPUT_EVENTS_RUNNING: AtomicBool = AtomicBool::new(false);

fn string_to_keybdkey(key: &str) -> KeybdKey {
    use inputbot::KeybdKey::*;
    match key {
        "Backspace" => BackspaceKey,
        "Tab" => TabKey,
        "Enter" => EnterKey,
        "Escape" => EscapeKey,
        " " => SpaceKey,
        "PageUp" => PageUpKey,
        "PageDown" => PageDownKey,
        "End" => EndKey,
        "Home" => HomeKey,
        "ArrowLeft" => LeftKey,
        "ArrowUp" => UpKey,
        "ArrowRight" => RightKey,
        "ArrowDown" => DownKey,
        "Insert" => InsertKey,
        "Delete" => DeleteKey,
        "0" => Numrow0Key,
        "1" => Numrow1Key,
        "2" => Numrow2Key,
        "3" => Numrow3Key,
        "4" => Numrow4Key,
        "5" => Numrow5Key,
        "6" => Numrow6Key,
        "7" => Numrow7Key,
        "8" => Numrow8Key,
        "9" => Numrow9Key,
        "a" | "A" => AKey,
        "b" | "B" => BKey,
        "c" | "C" => CKey,
        "d" | "D" => DKey,
        "e" | "E" => EKey,
        "f" | "F" => FKey,
        "g" | "G" => GKey,
        "h" | "H" => HKey,
        "i" | "I" => IKey,
        "j" | "J" => JKey,
        "k" | "K" => KKey,
        "l" | "L" => LKey,
        "m" | "M" => MKey,
        "n" | "N" => NKey,
        "o" | "O" => OKey,
        "p" | "P" => PKey,
        "q" | "Q" => QKey,
        "r" | "R" => RKey,
        "s" | "S" => SKey,
        "t" | "T" => TKey,
        "u" | "U" => UKey,
        "v" | "V" => VKey,
        "w" | "W" => WKey,
        "x" | "X" => XKey,
        "y" | "Y" => YKey,
        "z" | "Z" => ZKey,
        "Meta" => LSuper,
        "NumLock" => NumLockKey,
        "ScrollLock" => ScrollLockKey,
        "CapsLock" => CapsLockKey,
        "Shift" => LShiftKey,
        "Control" => LControlKey,
        "Alt" => LAltKey,
        "F1" => F1Key,
        "F2" => F2Key,
        "F3" => F3Key,
        "F4" => F4Key,
        "F5" => F5Key,
        "F6" => F6Key,
        "F7" => F7Key,
        "F8" => F8Key,
        "F9" => F9Key,
        "F10" => F10Key,
        "F11" => F11Key,
        "F12" => F12Key,
        "," => CommaKey,
        "." => PeriodKey,
        "-" => MinusKey,
        "'" => QuoteKey,
        ";" => SemicolonKey,
        "[" => LBracketKey,
        "]" => RBracketKey,
        "=" => EqualKey,
        "`" => BackquoteKey,
        "/" => SlashKey,
        "\\" => BackslashKey,
        _ => F6Key,
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn start_clicker<'a>(
    state: State<'a, ClickerState>,
    app: AppHandle,
) -> Result<(), String> {
    state.running.lock().unwrap().store(true, Ordering::SeqCst);
    app.emit("clicker_state", true).unwrap();

    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn update_clicker_state<'a>(
    state: State<'a, ClickerState>,
    interval: u64,
    button: String,
    click_type: String,
) -> Result<(), String> {
    let interval_arc = state.interval.clone();
    let button_arc = state.button.clone();
    let click_type_arc = state.click_type.clone();
    let thread_handle_arc = state.thread_handle.clone();
    let running_arc = state.running.clone();

    *interval_arc.lock().await = interval;
    *button_arc.lock().await = match button.as_str() {
        "Right" => MouseButton::Right,
        "Left" => MouseButton::Left,
        "Middle" => MouseButton::Middle,
        _ => MouseButton::Left,
    };
    *click_type_arc.lock().await = match click_type.as_str() {
        "Single" => ClickType::Single,
        "Double" => ClickType::Double,
        _ => ClickType::Single,
    };

    if let Some(handle) = thread_handle_arc.lock().await.take() {
        handle.abort();
        handle.await.ok();
    }

    *thread_handle_arc.lock().await = Some(task::spawn(async move {
        let running_arc_clone = running_arc.clone();

        loop {
            if running_arc_clone.lock().unwrap().load(Ordering::SeqCst) {
                let button_arc = button_arc.clone();
                let click_type_arc = click_type_arc.clone();
                let interval_arc = interval_arc.clone();
                let mut enigo = Enigo::new(&Settings::default()).unwrap();
                let button = button_arc.lock().await.clone();
                let click_type = click_type_arc.lock().await.clone();
                let interval = *interval_arc.lock().await;

                match button {
                    MouseButton::Left => match click_type {
                        ClickType::Single => enigo.button(Button::Left, Direction::Click).unwrap(),
                        ClickType::Double => {
                            enigo.button(Button::Left, Direction::Click).unwrap();
                            enigo.button(Button::Left, Direction::Click).unwrap();
                        }
                    },
                    MouseButton::Right => match click_type {
                        ClickType::Single => enigo.button(Button::Right, Direction::Click).unwrap(),
                        ClickType::Double => {
                            enigo.button(Button::Right, Direction::Click).unwrap();
                            enigo.button(Button::Right, Direction::Click).unwrap();
                        }
                    },
                    MouseButton::Middle => match click_type {
                        ClickType::Single => {
                            enigo.button(Button::Middle, Direction::Click).unwrap()
                        }
                        ClickType::Double => {
                            enigo.button(Button::Middle, Direction::Click).unwrap();
                            enigo.button(Button::Middle, Direction::Click).unwrap();
                        }
                    },
                }

                tokio::time::sleep(Duration::from_millis(interval)).await;
            } else {
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        }
    }));

    Ok(())
}

#[tauri::command(rename_all = "snake_case")]
pub async fn change_trigger_key<'a>(
    state: State<'a, ClickerState>,
    app: AppHandle,
    trigger_key: String,
) -> Result<(), String> {
    let trigger_key_arc = state.trigger_key.clone();
    let running_arc = state.running.clone();

    let new_key = string_to_keybdkey(&trigger_key);
    *trigger_key_arc.lock().await = new_key;

    new_key.unbind();
    new_key.bind(move || {
        if KeybdKey::LAltKey.is_pressed() {
            let running = running_arc.lock().unwrap();
            if running.load(Ordering::SeqCst) {
                running.store(false, Ordering::SeqCst);
                app.emit("clicker_state", false).unwrap();
            } else {
                running.store(true, Ordering::SeqCst);
                app.emit("clicker_state", true).unwrap();
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn stop_clicker<'a>(
    state: State<'a, ClickerState>,
    app: AppHandle,
) -> Result<(), String> {
    println!("stop");
    state.running.lock().unwrap().store(false, Ordering::SeqCst);
    app.emit("clicker_state", false).unwrap();

    Ok(())
}

#[tauri::command]
pub async fn innit_clicker(state: State<'_, ClickerState>, app: AppHandle) -> Result<(), String> {
    let running_arc = state.running.clone();
    let running_arc_clone = running_arc.clone();
    let thread_handle_arc = state.thread_handle.clone();
    let button_arc = state.button.clone();
    let click_type_arc = state.click_type.clone();
    let interval_arc = state.interval.clone();
    let trigger_key_arc = state.trigger_key.clone();
    let input_events_handle_arc = state.input_events_handle.clone();

    trigger_key_arc.lock().await.unbind();
    trigger_key_arc.lock().await.bind(move || {
        if KeybdKey::LAltKey.is_pressed() {
            let running = running_arc_clone.lock().unwrap();
            if running.load(Ordering::SeqCst) {
                running.store(false, Ordering::SeqCst);
                app.emit("clicker_state", false).unwrap();
            } else {
                running.store(true, Ordering::SeqCst);
                app.emit("clicker_state", true).unwrap();
            }
        }
    });

    *input_events_handle_arc.lock().await = Some(task::spawn(async move {
        if INPUT_EVENTS_RUNNING
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
        {
            inputbot::handle_input_events();
        }
    }));

    if let Some(handle) = thread_handle_arc.lock().await.take() {
        handle.abort();
        handle.await.ok();
    }

    *thread_handle_arc.lock().await = Some(task::spawn(async move {
        let running_arc_clone = running_arc.clone();

        loop {
            if running_arc_clone.lock().unwrap().load(Ordering::SeqCst) {
                let button_arc = button_arc.clone();
                let click_type_arc = click_type_arc.clone();
                let interval_arc = interval_arc.clone();
                let mut enigo = Enigo::new(&Settings::default()).unwrap();
                let button = button_arc.lock().await.clone();
                let click_type = click_type_arc.lock().await.clone();
                let interval: u64 = *interval_arc.lock().await;

                match button {
                    MouseButton::Left => match click_type {
                        ClickType::Single => enigo.button(Button::Left, Direction::Click).unwrap(),
                        ClickType::Double => {
                            enigo.button(Button::Left, Direction::Click).unwrap();
                            enigo.button(Button::Left, Direction::Click).unwrap();
                        }
                    },
                    MouseButton::Right => match click_type {
                        ClickType::Single => enigo.button(Button::Right, Direction::Click).unwrap(),
                        ClickType::Double => {
                            enigo.button(Button::Right, Direction::Click).unwrap();
                            enigo.button(Button::Right, Direction::Click).unwrap();
                        }
                    },
                    MouseButton::Middle => match click_type {
                        ClickType::Single => {
                            enigo.button(Button::Middle, Direction::Click).unwrap()
                        }
                        ClickType::Double => {
                            enigo.button(Button::Middle, Direction::Click).unwrap();
                            enigo.button(Button::Middle, Direction::Click).unwrap();
                        }
                    },
                }

                tokio::time::sleep(Duration::from_millis(interval)).await;
            } else {
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
        }
    }));

    Ok(())
}

#[tauri::command]
pub async fn close_clicker<'a>(state: State<'a, ClickerState>) -> Result<(), String> {
    let thread_handle_arc = state.thread_handle.clone();
    let input_events_handle_arc = state.input_events_handle.clone();

    if let Some(handle) = thread_handle_arc.lock().await.take() {
        handle.abort();
        handle.await.ok();
    }

    if let Some(handle) = input_events_handle_arc.lock().await.take() {
        handle.abort();
        handle.await.ok();
    }

    Ok(())
}

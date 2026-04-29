use std::any::Any;
use std::panic::{self, AssertUnwindSafe};
use std::thread;

pub fn spawn(name: &'static str, task: impl FnOnce() + Send + 'static) {
    let result = thread::Builder::new()
        .name(name.to_string())
        .spawn(move || {
            if let Err(payload) = panic::catch_unwind(AssertUnwindSafe(task)) {
                tracing::error!(
                    task = name,
                    panic = panic_message(payload.as_ref()),
                    "background task panicked"
                );
            }
        });
    if let Err(error) = result {
        tracing::error!(task = name, error = %error, "failed to spawn background task");
    }
}

fn panic_message(payload: &(dyn Any + Send)) -> &str {
    if let Some(message) = payload.downcast_ref::<&'static str>() {
        return message;
    }
    if let Some(message) = payload.downcast_ref::<String>() {
        return message.as_str();
    }
    "unknown panic"
}

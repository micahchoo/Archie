//! Native video transcode sidecar (Archie-7e6f) — the desktop half of the web quality tier.
//!
//! WHY A SIDECAR AT ALL: WebKitGTK ships no WebCodecs, so the Tauri webview cannot transcode video
//! itself. The web tier (Archie-4b0a: archival keeps bytes as-is, web re-encodes at PUBLISH time from
//! the retained original) therefore needs a native encoder on desktop. This module is that seam.
//!
//! ── WHY ffmpeg AND NOT gstreamer ──────────────────────────────────────────────────────────────────
//! The GNOME 49 runtime ships BOTH (`/usr/bin/ffmpeg` 7.1.3 and `gst-launch-1.0`, both measured
//! present 2026-07-27). ffmpeg wins on one property that matters here: `-progress pipe:1` is a
//! documented machine-readable `key=value` stream, whereas scraping progress out of `gst-launch-1.0`
//! means parsing human log lines or linking gstreamer-rs into the binary (a heavy build dependency
//! for a crate whose whole design is "logic-light", see Cargo.toml). We shell out; we do not link.
//!
//! ── THE RUNTIME CODEC FINDING, MEASURED (2026-07-27) ──────────────────────────────────────────────
//! The base `org.gnome.Platform//49` runtime canNOT do H.264 — neither direction:
//!
//!   * `ffmpeg -c:v libx264` → `Unknown encoder 'libx264'`
//!   * decoding an H.264 input → `Decoding requested, but no decoder found for: h264`
//!
//! The base libavcodec's DT_NEEDED list is libvpx / libaom / libopus / libSvtAv1Enc and NOTHING else;
//! its build config carries `--disable-decoder='h264,hevc,vc1,vvc'` and no `--enable-libx264`. H.264
//! arrives ONLY through the `org.freedesktop.Platform.codecs-extra` extension (runtime metadata :90,
//! `add-ld-path = lib`), which `src-tauri/flatpak/digital.compost.archie.yml` does not declare.
//! Proven by forcing `LD_LIBRARY_PATH` to the base lib dir: VP9+Opus/WebM and AAC encode fine,
//! libx264 vanishes, and H.264 input stops decoding.
//!
//! The DECODE half is the constraint that actually bites: most user video IS H.264, so without the
//! extension the sidecar cannot READ typical input whatever it writes. That is why `probe_encoders`
//! reports both directions and why the UI must grey the control with a reason (Archie-c367) rather
//! than fail mid-publish.
//!
//! ── SAFETY: NO SHELL, EVER ────────────────────────────────────────────────────────────────────────
//! `Command` is given an explicit arg vector — there is no shell, so no quoting or metacharacter
//! hazard. The remaining risk is a caller-supplied path being read by ffmpeg as an OPTION, so
//! `validate_path` rejects anything that is not absolute, or that starts with `-`, or that carries a
//! NUL. The webview never hands us an argv; it hands us a typed `TranscodeRequest` and this module
//! builds the argv. Same trust posture as `assertSafeName` in the fs seam
//! (.claude/rules/tauri-fs-seam.md): callers upstream are not trusted to have sanitized anything.

use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

/// Progress events ride one global event name; each payload carries its `jobId` so a listener can
/// filter. (Tauri 2's `ipc::Channel` would scope this structurally, but a named event keeps the JS
/// seam testable with a plain injected listener — see apps/studio/src/video-transcode.ts.)
pub const PROGRESS_EVENT: &str = "archie://video-transcode-progress";

/// The encoder binary. Absolute-path lookup is deliberately NOT done here: on Flatpak `/usr/bin`
/// is the runtime's own, and on other platforms `PATH` is the only sane answer.
const FFMPEG: &str = "ffmpeg";

/// A typed, safe-to-serialize failure — same shape and contract as `DeployError` in github.rs, so a
/// command `Err` rejects the JS promise with a value the TS seam can classify without string
/// sniffing. `kind` is the stable part; `message` is for humans and may change.
#[derive(Debug, Serialize, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TranscodeError {
    pub kind: String,
    pub message: String,
}

impl TranscodeError {
    fn new(kind: &str, message: impl Into<String>) -> Self {
        TranscodeError { kind: kind.into(), message: message.into() }
    }
}

/// A transcode job. The webview cannot express an argv — only these fields — which is what keeps the
/// subprocess boundary closed.
#[derive(Debug, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TranscodeRequest {
    /// Correlates progress events with this job.
    pub job_id: String,
    /// Absolute path to the retained original.
    pub input: String,
    /// Absolute path to write. Overwritten (`-y`); the caller owns placement.
    pub output: String,
    /// `"h264"` (MP4/AAC) or `"vp9"` (WebM/Opus). See `build_args`.
    pub codec: String,
    /// Cap on the SHORT edge in the sense of "height"; downscale-only (a smaller source is untouched).
    pub max_height: u32,
    /// Constant-quality parameter. Scale differs per codec — 23 is a sane H.264 default, 33 for VP9.
    pub crf: u8,
    /// Audio bitrate in kbit/s.
    pub audio_kbps: u32,
}

#[derive(Debug, Serialize, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TranscodeProgress {
    pub job_id: String,
    /// Encoded position in MICROseconds. See `ProgressParser` for why this is not `out_time_ms`.
    pub out_time_us: u64,
    pub frame: u64,
    pub speed: Option<f64>,
    pub total_size: Option<u64>,
    /// True on the final block (`progress=end`).
    pub done: bool,
}

#[derive(Debug, Serialize, PartialEq, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TranscodeResult {
    pub output: String,
    pub bytes: u64,
    pub out_time_us: u64,
}

/// What this machine can actually do. Reported to the UI so the control can be greyed WITH A REASON
/// (Archie-c367) instead of failing at publish time. Note `h264_decode` is separate and is the one
/// that usually decides whether the feature is usable at all.
#[derive(Debug, Serialize, PartialEq, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct EncoderReport {
    pub ffmpeg: bool,
    pub version: Option<String>,
    pub h264: bool,
    pub vp9: bool,
    pub aac: bool,
    pub opus: bool,
    pub h264_decode: bool,
}

// ---------------------------------------------------------------------------------------------------
// Pure helpers — every one of these is unit-tested below with no process, no fs, no Tauri.
// ---------------------------------------------------------------------------------------------------

/// Reject anything ffmpeg could read as an option, or that isn't a real absolute path. A relative
/// path would resolve against the app's cwd, which the webview does not know and must not guess.
fn validate_path(p: &str, what: &str) -> Result<(), TranscodeError> {
    if p.is_empty() {
        return Err(TranscodeError::new("bad-request", format!("The {what} path is empty.")));
    }
    if p.starts_with('-') {
        // Otherwise `-i` would swallow it as a flag — the one real injection vector left once the
        // shell is gone.
        return Err(TranscodeError::new("bad-request", format!("The {what} path starts with '-'.")));
    }
    if p.contains('\0') {
        return Err(TranscodeError::new("bad-request", format!("The {what} path contains a NUL byte.")));
    }
    if !p.starts_with('/') && !is_windows_absolute(p) {
        return Err(TranscodeError::new("bad-request", format!("The {what} path is not absolute.")));
    }
    Ok(())
}

/// `C:\x` / `C:/x` — accepted so the seam is not Linux-only by accident. (Flatpak is the shipping
/// target today; this costs one function and avoids a surprise on a Windows build.)
fn is_windows_absolute(p: &str) -> bool {
    let b = p.as_bytes();
    b.len() >= 3 && b[0].is_ascii_alphabetic() && b[1] == b':' && (b[2] == b'\\' || b[2] == b'/')
}

/// The web-tier argv. BOTH vectors below were executed end-to-end on 2026-07-27 and verified with
/// ffprobe (`vp9,1280,720` + `opus`; `h264,1280,720` + `aac`) — the unit tests assert a vector that
/// has actually run, not one that merely reads correctly.
///
/// `scale=-2:'min(ih,720)'` is downscale-ONLY (a 320x240 source measured out at 320x240) and `-2`
/// keeps the derived width even, which both encoders require at yuv420p. The comma sits inside
/// single quotes because it is ffmpeg's FILTERGRAPH separator — nothing to do with the shell, which
/// is not involved.
pub fn build_args(req: &TranscodeRequest) -> Result<Vec<String>, TranscodeError> {
    validate_path(&req.input, "input")?;
    validate_path(&req.output, "output")?;
    if req.job_id.is_empty() {
        return Err(TranscodeError::new("bad-request", "The job id is empty."));
    }
    if req.max_height < 144 || req.max_height > 4320 {
        return Err(TranscodeError::new(
            "bad-request",
            format!("max_height {} is outside 144–4320.", req.max_height),
        ));
    }
    if req.crf > 63 {
        return Err(TranscodeError::new("bad-request", format!("crf {} is outside 0–63.", req.crf)));
    }
    if req.audio_kbps < 16 || req.audio_kbps > 512 {
        return Err(TranscodeError::new(
            "bad-request",
            format!("audio_kbps {} is outside 16–512.", req.audio_kbps),
        ));
    }

    let scale = format!("scale=-2:'min(ih,{})'", req.max_height);
    let mut a: Vec<String> = vec![
        "-nostdin".into(),
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-y".into(),
        "-i".into(),
        req.input.clone(),
        "-vf".into(),
        scale,
    ];

    match req.codec.as_str() {
        "h264" => a.extend([
            "-c:v".into(), "libx264".into(),
            "-profile:v".into(), "high".into(),
            "-preset".into(), "medium".into(),
            "-crf".into(), req.crf.to_string(),
            "-pix_fmt".into(), "yuv420p".into(),
            "-c:a".into(), "aac".into(),
            "-b:a".into(), format!("{}k", req.audio_kbps),
            "-ac".into(), "2".into(),
            // Moves the moov atom to the front so a static host can start playback before the whole
            // file has arrived — the single most important flag for progressive download.
            "-movflags".into(), "+faststart".into(),
        ]),
        "vp9" => a.extend([
            "-c:v".into(), "libvpx-vp9".into(),
            "-crf".into(), req.crf.to_string(),
            // `-b:v 0` is what puts libvpx into true constant-quality mode; without it CRF is only a
            // ceiling and the encode targets a bitrate instead.
            "-b:v".into(), "0".into(),
            "-row-mt".into(), "1".into(),
            "-deadline".into(), "good".into(),
            "-cpu-used".into(), "2".into(),
            "-pix_fmt".into(), "yuv420p".into(),
            "-c:a".into(), "libopus".into(),
            "-b:a".into(), format!("{}k", req.audio_kbps),
            "-ac".into(), "2".into(),
        ]),
        other => {
            return Err(TranscodeError::new(
                "bad-request",
                format!("Unknown target codec '{other}' (expected 'h264' or 'vp9')."),
            ))
        }
    }

    a.extend(["-progress".into(), "pipe:1".into(), "-nostats".into(), req.output.clone()]);
    Ok(a)
}

/// Accumulates `-progress pipe:1` output. ffmpeg emits a flat `key=value` line stream and terminates
/// each block with `progress=continue` or `progress=end`; a block is only meaningful once complete.
///
/// **`out_time_ms` IS MICROSECONDS.** Measured 2026-07-27 on ffmpeg 7.1.1 and 7.1.3: a 3.000 s encode
/// reported `out_time_us=3000000` AND `out_time_ms=3000000` (a true millisecond field would read
/// 3000). It is a long-standing ffmpeg misnomer. Read `out_time_us`; never `out_time_ms`. A parser
/// that trusted the name would report progress 1000x too high and the bar would slam to full instantly.
#[derive(Debug, Default)]
pub struct ProgressParser {
    out_time_us: u64,
    frame: u64,
    speed: Option<f64>,
    total_size: Option<u64>,
}

impl ProgressParser {
    pub fn new() -> Self {
        Self::default()
    }

    /// Feed one line. Returns a payload only at a block terminator, so a partially-read block never
    /// escapes as a half-filled event.
    pub fn push(&mut self, line: &str, job_id: &str) -> Option<TranscodeProgress> {
        let (key, value) = line.split_once('=')?;
        let value = value.trim();
        match key.trim() {
            "out_time_us" => {
                if let Ok(v) = value.parse::<u64>() {
                    self.out_time_us = v;
                }
            }
            "frame" => {
                if let Ok(v) = value.parse::<u64>() {
                    self.frame = v;
                }
            }
            "total_size" => self.total_size = value.parse::<u64>().ok(),
            // "16.2x" — and "N/A" early in a run, which must not become 0.0.
            "speed" => self.speed = value.trim_end_matches('x').trim().parse::<f64>().ok(),
            "progress" => {
                return Some(TranscodeProgress {
                    job_id: job_id.to_string(),
                    out_time_us: self.out_time_us,
                    frame: self.frame,
                    speed: self.speed,
                    total_size: self.total_size,
                    done: value == "end",
                })
            }
            _ => {}
        }
        None
    }

    pub fn out_time_us(&self) -> u64 {
        self.out_time_us
    }
}

/// Map ffmpeg's stderr onto a stable `kind`. Every needle below is VERBATIM from a measured run
/// (2026-07-27, ffmpeg 7.1.1 host and 7.1.3 in the GNOME 49 runtime — byte-identical modulo pointers).
///
/// The ordering is load-bearing and is the trap this function exists to avoid: an absent INPUT and an
/// unwritable OUTPUT both say `No such file or directory`. They are told apart by `Error opening
/// input` vs `Error opening output`, never by the errno text.
pub fn classify_failure(stderr: &str, code: Option<i32>) -> TranscodeError {
    let first = stderr.lines().find(|l| !l.trim().is_empty()).unwrap_or("").trim().to_string();

    // `Unknown encoder 'libx264'` — the codecs-extra case on a stock GNOME runtime.
    if stderr.contains("Unknown encoder") || stderr.contains("Error selecting an encoder") {
        return TranscodeError::new(
            "codec-missing",
            "This machine's ffmpeg has no encoder for the chosen format. On Flatpak that usually \
             means the org.freedesktop.Platform.codecs-extra runtime extension is not installed.",
        );
    }
    // `Decoding requested, but no decoder found for: h264`
    if stderr.contains("no decoder found for") || stderr.contains("Decoder not found") {
        return TranscodeError::new(
            "decoder-missing",
            "This machine's ffmpeg cannot decode that video's format. On Flatpak that usually means \
             the org.freedesktop.Platform.codecs-extra runtime extension is not installed.",
        );
    }
    if stderr.contains("Invalid data found when processing input") || stderr.contains("moov atom not found") {
        return TranscodeError::new("unsupported-input", "That file isn't a video we can read.");
    }
    if stderr.contains("Error opening input") {
        return TranscodeError::new("unreadable-input", "The original video couldn't be opened.");
    }
    if stderr.contains("Error opening output") {
        return TranscodeError::new("output-failed", "The transcoded file couldn't be written.");
    }
    // Exit code is a pass/fail signal only. A real failure measured at 183; the value is not a stable
    // classifier, so it is reported rather than switched on.
    let detail = if first.is_empty() {
        match code {
            Some(c) => format!("ffmpeg exited with status {c}."),
            None => "ffmpeg was terminated before it finished.".to_string(),
        }
    } else {
        first
    };
    TranscodeError::new("encode-failed", detail)
}

/// Read `ffmpeg -encoders` / `-decoders` output into the capability report. Kept pure so the report's
/// logic is tested without a subprocess. The needles are the codec NAMES ffmpeg prints in column 2.
pub fn parse_capabilities(encoders: &str, decoders: &str, version: Option<String>) -> EncoderReport {
    let has = |haystack: &str, name: &str| {
        haystack.lines().any(|l| l.split_whitespace().nth(1).is_some_and(|n| n == name))
    };
    EncoderReport {
        ffmpeg: true,
        version,
        h264: has(encoders, "libx264"),
        vp9: has(encoders, "libvpx-vp9"),
        aac: has(encoders, "aac"),
        opus: has(encoders, "libopus"),
        h264_decode: has(decoders, "h264"),
        ..Default::default()
    }
}

/// First line of `ffmpeg -version`, e.g. `ffmpeg version 7.1.3 Copyright (c) …` → `7.1.3`.
pub fn parse_version(version_output: &str) -> Option<String> {
    version_output
        .lines()
        .next()?
        .split_whitespace()
        .nth(2)
        .map(str::to_string)
}

// ---------------------------------------------------------------------------------------------------
// The process half.
// ---------------------------------------------------------------------------------------------------

fn spawn_error(e: std::io::Error) -> TranscodeError {
    if e.kind() == std::io::ErrorKind::NotFound {
        TranscodeError::new(
            "encoder-missing",
            "No ffmpeg was found on this machine, so video can't be converted here.",
        )
    } else {
        TranscodeError::new("encode-failed", format!("ffmpeg could not be started: {e}"))
    }
}

fn run_capture(args: &[&str]) -> Result<String, TranscodeError> {
    let out = Command::new(FFMPEG).args(args).output().map_err(spawn_error)?;
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

fn transcode_blocking(app: &AppHandle, req: &TranscodeRequest) -> Result<TranscodeResult, TranscodeError> {
    let args = build_args(req)?;
    let mut child = Command::new(FFMPEG)
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(spawn_error)?;

    // stdout carries ONLY the progress stream (`-progress pipe:1` + `-nostats`), so it can be read
    // to completion on this thread without deadlocking against stderr — stderr is at `-loglevel
    // error`, which cannot fill a pipe buffer in practice.
    let mut parser = ProgressParser::new();
    if let Some(stdout) = child.stdout.take() {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Some(p) = parser.push(&line, &req.job_id) {
                // A dropped progress event must never fail a transcode.
                let _ = app.emit(PROGRESS_EVENT, &p);
            }
        }
    }

    let out = child.wait_with_output().map_err(spawn_error)?;
    let stderr = String::from_utf8_lossy(&out.stderr);
    if !out.status.success() {
        return Err(classify_failure(&stderr, out.status.code()));
    }

    let bytes = std::fs::metadata(&req.output).map(|m| m.len()).unwrap_or(0);
    if bytes == 0 {
        // ffmpeg exited 0 and wrote nothing — treat as a failure rather than publishing an empty file.
        return Err(TranscodeError::new(
            "encode-failed",
            "ffmpeg reported success but produced an empty file.",
        ));
    }
    Ok(TranscodeResult {
        output: req.output.clone(),
        bytes,
        out_time_us: parser.out_time_us(),
    })
}

/// What this machine can encode/decode. Never throws for "no ffmpeg" — it reports `ffmpeg: false`, so
/// the UI can grey the control with a reason instead of surfacing an error the author cannot act on.
#[tauri::command]
pub async fn video_probe_encoders() -> EncoderReport {
    tauri::async_runtime::spawn_blocking(|| {
        let version = match run_capture(&["-hide_banner", "-version"]) {
            Ok(v) => parse_version(&v),
            Err(_) => return EncoderReport::default(), // ffmpeg: false
        };
        let encoders = run_capture(&["-hide_banner", "-encoders"]).unwrap_or_default();
        let decoders = run_capture(&["-hide_banner", "-decoders"]).unwrap_or_default();
        parse_capabilities(&encoders, &decoders, version)
    })
    .await
    .unwrap_or_default()
}

/// Transcode `input` to `output` at the web tier, emitting {@link PROGRESS_EVENT} as it goes.
#[tauri::command]
pub async fn video_transcode(
    app: AppHandle,
    request: TranscodeRequest,
) -> Result<TranscodeResult, TranscodeError> {
    tauri::async_runtime::spawn_blocking(move || transcode_blocking(&app, &request))
        .await
        .unwrap_or_else(|_| Err(TranscodeError::new("encode-failed", "The transcode task did not complete.")))
}

// ---------------------------------------------------------------------------------------------------
// Tests — pure helpers only (no subprocess, no Tauri). The fixtures below are VERBATIM captures from
// the 2026-07-27 measurement runs described in this module's header.
// ---------------------------------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn req() -> TranscodeRequest {
        TranscodeRequest {
            job_id: "job-1".into(),
            input: "/tmp/in.mov".into(),
            output: "/tmp/out.mp4".into(),
            codec: "h264".into(),
            max_height: 720,
            crf: 23,
            audio_kbps: 128,
        }
    }

    #[test]
    fn h264_args_match_the_vector_that_was_actually_run() {
        let a = build_args(&req()).expect("valid request");
        let joined = a.join(" ");
        assert_eq!(
            joined,
            "-nostdin -hide_banner -loglevel error -y -i /tmp/in.mov -vf scale=-2:'min(ih,720)' \
             -c:v libx264 -profile:v high -preset medium -crf 23 -pix_fmt yuv420p \
             -c:a aac -b:a 128k -ac 2 -movflags +faststart -progress pipe:1 -nostats /tmp/out.mp4"
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ")
        );
    }

    #[test]
    fn vp9_args_use_constant_quality_and_opus() {
        let mut r = req();
        r.codec = "vp9".into();
        r.output = "/tmp/out.webm".into();
        r.crf = 33;
        r.audio_kbps = 96;
        let a = build_args(&r).expect("valid request");
        // `-b:v 0` is what makes -crf a quality target rather than a ceiling; losing it is a silent
        // quality/size regression, so it is pinned rather than merely present.
        let i = a.iter().position(|s| s == "-b:v").expect("-b:v present");
        assert_eq!(a[i + 1], "0");
        assert!(a.contains(&"libvpx-vp9".to_string()));
        assert!(a.contains(&"libopus".to_string()));
        assert!(!a.contains(&"+faststart".to_string()), "faststart is an MP4 flag");
    }

    #[test]
    fn a_path_that_looks_like_a_flag_is_refused() {
        let mut r = req();
        r.input = "-i/etc/passwd".into();
        let e = build_args(&r).expect_err("must refuse");
        assert_eq!(e.kind, "bad-request");
    }

    #[test]
    fn a_relative_path_is_refused() {
        let mut r = req();
        r.output = "out.mp4".into();
        assert_eq!(build_args(&r).expect_err("must refuse").kind, "bad-request");
    }

    #[test]
    fn an_unknown_codec_is_refused_rather_than_passed_through() {
        let mut r = req();
        r.codec = "libx264 -f concat".into();
        assert_eq!(build_args(&r).expect_err("must refuse").kind, "bad-request");
    }

    #[test]
    fn out_of_range_knobs_are_refused() {
        let mut r = req();
        r.max_height = 8;
        assert_eq!(build_args(&r).expect_err("too small").kind, "bad-request");
        let mut r = req();
        r.audio_kbps = 4000;
        assert_eq!(build_args(&r).expect_err("too loud").kind, "bad-request");
    }

    // -- progress -------------------------------------------------------------------------------

    /// Verbatim block from `ffmpeg -progress pipe:1` (7.1.3, GNOME 49 runtime, 3.000 s clip).
    const PROGRESS_BLOCK: &str = "frame=30\nfps=0.00\nstream_0_0_q=7.0\nbitrate= 128.0kbits/s\n\
total_size=47995\nout_time_us=3000000\nout_time_ms=3000000\nout_time=00:00:03.000000\n\
dup_frames=0\ndrop_frames=0\nspeed=16.2x\nprogress=end\n";

    #[test]
    fn a_progress_block_yields_exactly_one_event_at_its_terminator() {
        let mut p = ProgressParser::new();
        let events: Vec<_> =
            PROGRESS_BLOCK.lines().filter_map(|l| p.push(l, "job-1")).collect();
        assert_eq!(events.len(), 1, "one event per block, emitted at `progress=`");
        let e = &events[0];
        assert_eq!(e.job_id, "job-1");
        assert_eq!(e.frame, 30);
        assert_eq!(e.total_size, Some(47995));
        assert_eq!(e.speed, Some(16.2));
        assert!(e.done);
    }

    #[test]
    fn out_time_is_read_in_MICROseconds_from_out_time_us_not_out_time_ms() {
        // The measured 3.000 s block carries out_time_us=3000000 AND out_time_ms=3000000 — ffmpeg's
        // `_ms` field is a misnomer. If a future edit switches the key, this catches it: reading
        // `out_time_ms` as milliseconds would make this 3_000_000_000.
        let mut p = ProgressParser::new();
        let e = PROGRESS_BLOCK.lines().filter_map(|l| p.push(l, "j")).next().expect("one event");
        assert_eq!(e.out_time_us, 3_000_000, "3.000 s must be 3e6 microseconds");
    }

    #[test]
    fn speed_na_early_in_a_run_stays_none_rather_than_zero() {
        let mut p = ProgressParser::new();
        let e = ["speed=N/A", "progress=continue"]
            .iter()
            .filter_map(|l| p.push(l, "j"))
            .next()
            .expect("one event");
        assert_eq!(e.speed, None);
        assert!(!e.done);
    }

    // -- failure classification ------------------------------------------------------------------
    // Every fixture is verbatim stderr from the 2026-07-27 runs.

    #[test]
    fn a_missing_encoder_is_codec_missing() {
        let s = "[vost#0:0 @ 0x5e3d] Unknown encoder 'libx264'\n\
                 [vost#0:0 @ 0x5e3d] Error selecting an encoder\n\
                 Error opening output file /tmp/h264.mp4.\n";
        assert_eq!(classify_failure(s, Some(183)).kind, "codec-missing");
    }

    #[test]
    fn a_missing_decoder_is_decoder_missing_not_unsupported_input() {
        // The stock GNOME 49 case: the file is perfectly valid, this machine just can't read it.
        // Collapsing it into `unsupported-input` would tell the author their video is broken.
        let s = "[vist#0:0/h264 @ 0x62ee] Decoding requested, but no decoder found for: h264\n\
                 Error opening output file /tmp/from264.webm.\n\
                 Error opening output files: Invalid argument\n";
        assert_eq!(classify_failure(s, Some(183)).kind, "decoder-missing");
    }

    #[test]
    fn junk_input_is_unsupported_input() {
        let s = "[mov,mp4,m4a,3gp,3g2,mj2 @ 0x6314] moov atom not found\n\
                 [in#0 @ 0x6314] Error opening input: Invalid data found when processing input\n\
                 Error opening input file /tmp/junk.mp4.\n";
        assert_eq!(classify_failure(s, Some(183)).kind, "unsupported-input");
    }

    #[test]
    fn an_absent_input_and_an_unwritable_output_are_told_apart() {
        // BOTH say "No such file or directory". This is the whole reason classify_failure exists as
        // a tested function: the errno text cannot distinguish them, only the input/output verb can.
        let missing_input = "[in#0 @ 0x5984] Error opening input: No such file or directory\n\
                             Error opening input file /tmp/nope.mp4.\n\
                             Error opening input files: No such file or directory\n";
        let bad_output = "[out#0/webm @ 0x58bc] Error opening output /proc/nope/out.webm: \
                          No such file or directory\n\
                          Error opening output file /proc/nope/out.webm.\n\
                          Error opening output files: No such file or directory\n";
        assert_eq!(classify_failure(missing_input, Some(183)).kind, "unreadable-input");
        assert_eq!(classify_failure(bad_output, Some(183)).kind, "output-failed");
        assert!(missing_input.contains("No such file or directory"));
        assert!(bad_output.contains("No such file or directory"));
    }

    #[test]
    fn an_unrecognised_failure_keeps_the_first_stderr_line() {
        let e = classify_failure("[x] something we have never seen\n", Some(9));
        assert_eq!(e.kind, "encode-failed");
        assert!(e.message.contains("something we have never seen"));
    }

    #[test]
    fn a_silent_failure_reports_the_exit_status() {
        let e = classify_failure("", Some(183));
        assert_eq!(e.kind, "encode-failed");
        assert!(e.message.contains("183"));
    }

    // -- capability parsing -----------------------------------------------------------------------

    #[test]
    fn capabilities_are_read_from_the_codec_name_column() {
        // Shape of real `ffmpeg -encoders` rows.
        let encoders = " V....D libx264              libx264 H.264 / AVC (codec h264)\n\
                         V....D libvpx-vp9           libvpx VP9 (codec vp9)\n\
                         A....D aac                  AAC (Advanced Audio Coding)\n\
                         A....D libopus              libopus Opus\n";
        let decoders = " V....D h264                 H.264 / AVC\n";
        let r = parse_capabilities(encoders, decoders, Some("7.1.3".into()));
        assert!(r.ffmpeg && r.h264 && r.vp9 && r.aac && r.opus && r.h264_decode);
        assert_eq!(r.version.as_deref(), Some("7.1.3"));
    }

    #[test]
    fn the_stock_gnome_49_runtime_reports_no_h264_in_either_direction() {
        // The measured base runtime: libvpx-vp9 + aac + libopus present, libx264 absent, and h264
        // absent from the DECODER list too (`--disable-decoder='h264,hevc,vc1,vvc'`).
        let encoders = " V....D libvpx-vp9           libvpx VP9 (codec vp9)\n\
                         A....D aac                  AAC (Advanced Audio Coding)\n\
                         A....D libopus              libopus Opus\n";
        let decoders = " V....D vp9                  Google VP9\n A....D opus                 Opus\n";
        let r = parse_capabilities(encoders, decoders, Some("7.1.3".into()));
        assert!(r.ffmpeg && r.vp9 && r.aac && r.opus);
        assert!(!r.h264, "base runtime has no libx264 encoder");
        assert!(!r.h264_decode, "base runtime cannot decode h264 either");
    }

    #[test]
    fn a_substring_match_does_not_count_as_a_codec() {
        // `libx264rgb` must not satisfy `libx264`, and `h264_vaapi` must not satisfy a decode probe.
        let encoders = " V....D libx264rgb           libx264 H.264 RGB (codec h264)\n";
        let decoders = " V....D h264_vaapi           H.264 (VAAPI)\n";
        let r = parse_capabilities(encoders, decoders, None);
        assert!(!r.h264);
        assert!(!r.h264_decode);
    }

    #[test]
    fn version_is_the_third_token_of_the_first_line() {
        assert_eq!(
            parse_version("ffmpeg version 7.1.3 Copyright (c) 2000-2025 the FFmpeg developers\n")
                .as_deref(),
            Some("7.1.3")
        );
        assert_eq!(parse_version(""), None);
    }
}

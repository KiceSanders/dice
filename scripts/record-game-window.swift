// macOS 15+, no external packages. Records one Chrome game window without microphone/audio.
import AVFoundation
import AppKit
import CoreGraphics
import Foundation
import ImageIO
import ScreenCaptureKit
import UniformTypeIdentifiers

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

@MainActor
final class RecordingDelegate: NSObject, SCRecordingOutputDelegate, SCStreamDelegate {
    var started = false
    var finished = false
    var failure: String?

    nonisolated func recordingOutputDidStartRecording(_ recordingOutput: SCRecordingOutput) {
        Task { @MainActor in
            self.started = true
            print("RECORDING — interact with the game now; recording ends at the requested duration.")
            fflush(stdout)
        }
    }

    nonisolated func recordingOutputDidFinishRecording(_ recordingOutput: SCRecordingOutput) {
        Task { @MainActor in self.finished = true }
    }

    nonisolated func recordingOutput(_ recordingOutput: SCRecordingOutput, didFailWithError error: Error) {
        Task { @MainActor in
            self.failure = error.localizedDescription
            self.finished = true
        }
    }

    nonisolated func stream(_ stream: SCStream, didStopWithError error: Error) {
        Task { @MainActor in
            self.failure = error.localizedDescription
            self.finished = true
        }
    }
}

@main
@MainActor
struct GameRecorder {
    static func main() async {
        // A command-line async main does not bootstrap AppKit. SCContentFilter's
        // display lookup otherwise aborts with CGS_REQUIRE_INIT / did_initialize.
        // Initialize the WindowServer connection before the first suspension point.
        NSApplication.shared.setActivationPolicy(.prohibited)
        do { try await run() } catch { fail(error.localizedDescription) }
    }

    static func inspect(_ file: String) async throws {
        let url = URL(fileURLWithPath: file)
        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration).seconds
        let tracks = try await asset.loadTracks(withMediaType: .video)
        guard duration > 0, let track = tracks.first else { fail("No playable video track") }
        let size = try await track.load(.naturalSize)
        let fps = try await track.load(.nominalFrameRate)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 1280, height: 800)
        var thumbnails: [String] = []
        for index in 0..<5 {
            let seconds = duration * Double(index + 1) / 6
            let frame = try await generator.image(at: CMTime(seconds: seconds, preferredTimescale: 600))
            let path = url.deletingPathExtension().path + "-frame-\(index + 1).png"
            guard let target = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL,
                                                               UTType.png.identifier as CFString, 1, nil)
            else { fail("Cannot create review frame") }
            CGImageDestinationAddImage(target, frame.image, nil)
            guard CGImageDestinationFinalize(target) else { fail("Cannot save review frame") }
            thumbnails.append(path)
        }
        let info: [String: Any] = ["video": url.path, "seconds": duration, "fps": fps,
                                   "width": size.width, "height": size.height, "reviewFrames": thumbnails]
        print(String(data: try JSONSerialization.data(withJSONObject: info, options: [.prettyPrinted, .sortedKeys]), encoding: .utf8)!)
    }

    static func run() async throws {
        let args = Array(CommandLine.arguments.dropFirst())
        if args.count == 2 && args[0] == "--inspect" {
            try await inspect(args[1])
            return
        }
        guard args == ["--list"] || (args.count == 3 && UInt32(args[0]) != nil) else {
            fail("Usage: record-game-window --list | WINDOW_ID SECONDS OUTPUT.mp4 | --inspect OUTPUT.mp4")
        }
        guard CGPreflightScreenCaptureAccess() else {
            fail("Screen Recording permission is unavailable for this process. Ask the user to enable it for the launching app in macOS Settings; no recording was made.")
        }
        let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
        let windows = content.windows.filter {
            $0.owningApplication?.bundleIdentifier == "com.google.Chrome" &&
            ($0.title?.contains("Room ") ?? false) && ($0.title?.contains("Dice") ?? false)
        }
        if args == ["--list"] {
            let rows = windows.map { ["windowId": $0.windowID, "title": $0.title ?? ""] as [String: Any] }
            print(String(data: try JSONSerialization.data(withJSONObject: rows, options: [.prettyPrinted, .sortedKeys]), encoding: .utf8)!)
            return
        }
        guard let window = windows.first(where: { $0.windowID == UInt32(args[0]) }),
              let seconds = Double(args[1]), seconds >= 2, seconds <= 120 else {
            fail("Choose a listed game window and a duration from 2 to 120 seconds")
        }
        let url = URL(fileURLWithPath: args[2])
        guard url.pathExtension == "mp4", !FileManager.default.fileExists(atPath: url.path) else {
            fail("Output must be a new .mp4 path; existing files are never overwritten")
        }
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let filter = SCContentFilter(desktopIndependentWindow: window)
        let config = SCStreamConfiguration()
        config.width = Int(window.frame.width) / 2 * 2
        config.height = Int(window.frame.height) / 2 * 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 30)
        config.showsCursor = true
        config.capturesAudio = false
        config.captureMicrophone = false
        let delegate = RecordingDelegate()
        let stream = SCStream(filter: filter, configuration: config, delegate: delegate)
        let outputConfig = SCRecordingOutputConfiguration()
        outputConfig.outputURL = url
        outputConfig.outputFileType = .mp4
        outputConfig.videoCodecType = .h264
        let recording = SCRecordingOutput(configuration: outputConfig, delegate: delegate)
        try stream.addRecordingOutput(recording)
        try await stream.startCapture()
        for _ in 0..<100 where !delegate.started && !delegate.finished {
            try await Task.sleep(for: .milliseconds(100))
        }
        if let failure = delegate.failure { fail(failure) }
        guard delegate.started else {
            try await stream.stopCapture()
            fail("Recording did not start; do not perform the game action")
        }
        try await Task.sleep(for: .seconds(seconds))
        try await stream.stopCapture()
        for _ in 0..<100 where !delegate.finished {
            try await Task.sleep(for: .milliseconds(100))
        }
        if let failure = delegate.failure { fail(failure) }
        guard delegate.finished else { fail("Video finalization timed out; do not deliver this file") }
        try await inspect(url.path)
    }
}

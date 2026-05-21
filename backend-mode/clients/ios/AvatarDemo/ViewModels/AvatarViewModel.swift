import SwiftUI
import Combine
import AVFoundation
import AvatarKit

@MainActor class AvatarViewModel: ObservableObject {
    @Published var connectionState: String = "\(ConnectionState.disconnected)"
    @Published var conversationState: String = "\(ConversationState.idle)"
    @Published var errorMessage: String?
    @Published var avatar: Avatar?

    // Backend Mode published state
    @Published var backendConnected = false
    @Published var backendConnecting = false
    @Published var backendMicActive = false

    private var isConnected = false
    private var avatarController: AvatarController?

    func setAvatarController(_ controller: AvatarController) {
        avatarController = controller
        avatarController?.onConnectionState = { [weak self] state in
            guard let self else { return }
            self.connectionState = "\(state)"
            switch state {
            case .connected:
                self.isConnected = true
            case .disconnected, .failed:
                self.isConnected = false
            case .connecting:
                break
            @unknown default:
                break
            }
        }
        avatarController?.onConversationState = { [weak self] state in
            guard let self else { return }
            self.conversationState = "\(state)"
        }
        avatarController?.onError = { [weak self] error in
            self?.errorMessage = error.localizedDescription
        }
    }

    func start() { avatarController?.start() }
    func pause() { avatarController?.pause() }
    func resume() { avatarController?.resume() }

    func interrupt() {
        backendStopMic()
        if let ws = hostWsTask, ws.state == .running {
            ws.send(.string(jsonString(["type": "interrupt"]))) { _ in }
        }
        backendTurnMap.removeAll()
        avatarController?.interrupt()
    }

    // MARK: - JSON Helper

    private func jsonString(_ dict: [String: Any]) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: dict),
              let str = String(data: data, encoding: .utf8) else { return "{}" }
        return str
    }

    // MARK: - Backend Mode

    private var backendModeURL: URL {
        let base = Config.backendModeURL
            .replacingOccurrences(of: "http://", with: "ws://")
            .replacingOccurrences(of: "https://", with: "wss://")
        return URL(string: "\(base)/ws/agent")!
    }
    private var hostWsTask: URLSessionWebSocketTask?
    private var hostSession: URLSession?
    private var hostReceiveTask: Task<Void, Never>?
    private var backendTurnMap: [String: String] = [:]

    // Microphone
    private var audioEngine: AVAudioEngine?

    func backendConnect() {
        guard hostWsTask == nil, !backendConnecting else { return }
        backendConnecting = true
        errorMessage = nil

        let session = URLSession(configuration: .default)
        hostSession = session
        let wsTask = session.webSocketTask(with: backendModeURL)
        hostWsTask = wsTask
        wsTask.resume()

        // Start persistent receive loop
        hostReceiveTask = Task { [weak self] in
            await self?.hostReceiveLoop(wsTask)
        }
    }

    func backendDisconnect() {
        backendStopMic()
        hostReceiveTask?.cancel()
        hostReceiveTask = nil
        hostWsTask?.cancel(with: .goingAway, reason: nil)
        hostWsTask = nil
        hostSession = nil
        backendConnected = false
        backendConnecting = false
        backendTurnMap.removeAll()
    }

    func backendStartMic() {
        guard backendConnected, !backendMicActive else { return }

        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
            try audioSession.setActive(true)
        } catch {
            errorMessage = "Audio session error: \(error.localizedDescription)"
            return
        }

        let engine = AVAudioEngine()
        audioEngine = engine
        let inputNode = engine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)

        // Target format: 16kHz mono Int16
        guard let targetFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16000, channels: 1, interleaved: true) else {
            errorMessage = "Cannot create target audio format"
            return
        }

        guard let converter = AVAudioConverter(from: inputFormat, to: targetFormat) else {
            errorMessage = "Cannot create audio converter"
            return
        }

        let bufferSize: AVAudioFrameCount = 4096
        inputNode.installTap(onBus: 0, bufferSize: bufferSize, format: inputFormat) { [weak self] buffer, _ in
            guard let self, let ws = self.hostWsTask, ws.state == .running else { return }

            let frameCount = AVAudioFrameCount(Double(buffer.frameLength) * 16000.0 / inputFormat.sampleRate)
            guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: frameCount) else { return }

            var conversionError: NSError?
            converter.convert(to: outputBuffer, error: &conversionError) { _, outStatus in
                outStatus.pointee = .haveData
                return buffer
            }

            if conversionError != nil { return }

            guard let int16Data = outputBuffer.int16ChannelData else { return }
            let byteCount = Int(outputBuffer.frameLength) * 2
            let data = Data(bytes: int16Data[0], count: byteCount)
            let b64 = data.base64EncodedString()
            let msg = self.jsonString(["type": "mic_audio", "audio": b64])
            ws.send(.string(msg)) { _ in }
        }

        do {
            try engine.start()
            backendMicActive = true
        } catch {
            errorMessage = "Audio engine start error: \(error.localizedDescription)"
            inputNode.removeTap(onBus: 0)
            audioEngine = nil
        }
    }

    func backendStopMic() {
        guard backendMicActive else { return }
        audioEngine?.inputNode.removeTap(onBus: 0)
        audioEngine?.stop()
        audioEngine = nil
        backendMicActive = false

        if let ws = hostWsTask, ws.state == .running {
            ws.send(.string(jsonString(["type": "mic_end"]))) { _ in }
        }
    }

    func backendSendText(_ text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        // Auto-connect if needed
        if !backendConnected && !backendConnecting {
            backendConnect()
        }

        let payload = jsonString(["type": "text_query", "text": trimmed])

        guard let ws = hostWsTask, ws.state == .running else {
            // Queue send after connection
            Task {
                // Wait for connection (up to 3s)
                for _ in 0..<30 {
                    if backendConnected { break }
                    try? await Task.sleep(nanoseconds: 100_000_000)
                }
                guard backendConnected, let ws = self.hostWsTask, ws.state == .running else { return }
                ws.send(.string(payload)) { _ in }
            }
            return
        }

        ws.send(.string(payload)) { _ in }
    }

    private func hostReceiveLoop(_ wsTask: URLSessionWebSocketTask) async {
        while !Task.isCancelled {
            guard let message = try? await wsTask.receive() else {
                // Connection lost
                await MainActor.run {
                    self.backendConnected = false
                    self.backendConnecting = false
                    self.backendMicActive = false
                    self.hostWsTask = nil
                    self.backendTurnMap.removeAll()
                }
                break
            }

            switch message {
            case .string(let text):
                guard let data = text.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let type = json["type"] as? String else { continue }

                await handleHostMessage(type: type, json: json)

            case .data:
                break
            @unknown default:
                break
            }
        }
    }

    private func handleHostMessage(type: String, json: [String: Any]) {
        guard let controller = avatarController else { return }

        switch type {
        case "ready":
            backendConnected = true
            backendConnecting = false
            let avatarId = avatar?.id ?? ""
            hostWsTask?.send(.string(jsonString(["type": "set_avatar", "avatarId": avatarId]))) { _ in }

        case "avatar_audio":
            guard let turnId = json["turnId"] as? String else { return }
            let audioB64 = json["audio"] as? String ?? ""
            let audioData = audioB64.isEmpty ? Data() : (Data(base64Encoded: audioB64) ?? Data())
            let isLast = json["isLast"] as? Bool ?? false
            let cid = controller.yieldAudioData(audioData, end: isLast)
            if backendTurnMap[turnId] == nil {
                backendTurnMap[turnId] = cid
            }

        case "avatar_frames":
            guard let turnId = json["turnId"] as? String,
                  let framesArr = json["frames"] as? [String] else { return }
            let frames = framesArr.compactMap { Data(base64Encoded: $0) }
            let isLast = json["isLast"] as? Bool ?? false
            if let cid = backendTurnMap[turnId], !frames.isEmpty {
                controller.yieldFramesData(frames, conversationID: cid)
            }
            if isLast {
                backendTurnMap.removeValue(forKey: turnId)
            }

        case "interrupt":
            backendTurnMap.removeAll()
            controller.interrupt()

        case "error":
            let errMsg = json["message"] as? String ?? "Unknown error"
            errorMessage = errMsg

        default:
            break
        }
    }

    func close() {
        backendDisconnect()
        avatarController?.close()
    }
}

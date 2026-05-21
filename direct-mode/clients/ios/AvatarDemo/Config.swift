import Foundation

enum Config {
    // MARK: - Spatius
    static let appID = "your_spatius_app_id"
    static let avatarID = "your_spatius_avatar_id"

    // MARK: - OpenAI (demo only, same keys as the web client)
    static let openAIApiKey = "sk-your_openai_api_key"  // fill in or pass from backend
    static let openAIModel = "gpt-4o-mini"
    static let openAISttModel = "gpt-4o-mini-transcribe"
    static let openAISttLanguage = "en"
    static let openAITtsModel = "gpt-4o-mini-tts"
    static let openAITtsVoice = "alloy"

    /// OpenAI API base (use localhost proxy or direct).
    /// If you run the vite dev server proxy, point here; otherwise call OpenAI directly.
    static let openAIBase = "https://api.openai.com"

    // MARK: - VAD
    static let vadStartThreshold: Float = 0.0185
    static let vadStopThreshold: Float = 0.013
    static let vadSilenceSeconds: TimeInterval = 0.7
    static let vadMinSpeechSeconds: TimeInterval = 0.28

    // MARK: - Audio
    /// Must match the AvatarKit AudioFormat sampleRate.
    static let avatarSampleRate = 24000
}

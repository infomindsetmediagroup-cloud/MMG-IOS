import Foundation

/// Runtime configuration for the iOS Kairos backend adapter.
///
/// Set `KAIROS_API_ENDPOINT` in the app Info.plist or generated build settings to the backend
/// endpoint, for example `https://example.com/api/kairos`.
enum KairosRuntimeConfiguration {
    static var endpoint: URL? {
        guard let rawValue = Bundle.main.object(forInfoDictionaryKey: "KAIROS_API_ENDPOINT") as? String else {
            return nil
        }

        let trimmedValue = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedValue.isEmpty else {
            return nil
        }

        return URL(string: trimmedValue)
    }
}

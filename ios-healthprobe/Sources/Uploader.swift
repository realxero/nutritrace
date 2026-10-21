import Foundation

/// POSTs days to the fork's /api/v1/apple-health endpoint using the
/// "simple" format: { "days": [ { "date": "YYYY-MM-DD", "metrics": {...} } ] }
enum Uploader {
    static func send(_ days: [DaySummary], server: String, token: String) async throws -> String {
        var base = server.trimmingCharacters(in: .whitespacesAndNewlines)
        while base.hasSuffix("/") { base.removeLast() }
        guard let url = URL(string: base + "/api/v1/apple-health") else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer " + token.trimmingCharacters(in: .whitespacesAndNewlines), forHTTPHeaderField: "Authorization")
        let payload: [String: Any] = ["days": days.map { ["date": $0.date, "metrics": $0.metrics] as [String: Any] }]
        req.httpBody = try JSONSerialization.data(withJSONObject: payload)
        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let body = String(data: data, encoding: .utf8) ?? ""
        return "HTTP \(status)\n\(body)"
    }
}

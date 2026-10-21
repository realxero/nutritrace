import SwiftUI
import HealthKit

@MainActor
final class ProbeModel: ObservableObject {
    let reader = HealthReader()
    @Published var log: [String] = []
    @Published var days: [DaySummary] = []
    @Published var busy = false

    func note(_ s: String) { log.insert(s, at: 0) }

    func requestAccess() async {
        busy = true; defer { busy = false }
        do {
            try await reader.requestAccess()
            note("✅ Permission request finished with no error. If a Health sheet appeared, HealthKit works in this build. Now tap Read.")
        } catch {
            let text = (error as NSError).localizedDescription
            if text.localizedCaseInsensitiveContains("entitlement") {
                note("❌ HealthKit is missing from this install's signature (the signing step stripped it).\n\(text)")
            } else {
                note("❌ \(text)")
            }
        }
    }

    func readWeek() async {
        busy = true; defer { busy = false }
        var out: [DaySummary] = []
        let cal = Calendar.current
        for offset in (0..<7).reversed() {
            let day = cal.date(byAdding: .day, value: -offset, to: Date())!
            out.append(await reader.summary(for: day))
        }
        days = out.reversed()
        let filled = out.filter { !$0.metrics.isEmpty }.count
        if filled == 0 {
            note("⚠️ Read 7 days but got no data. Either access was denied (Settings → Health → Data Access & Devices → HealthProbe) or the request never really reached Health.")
        } else {
            note("✅ Read data for \(filled) of 7 days. HealthKit works.")
        }
    }

    func send(server: String, token: String) async {
        guard !days.isEmpty else { note("Read some days first."); return }
        busy = true; defer { busy = false }
        do {
            let result = try await Uploader.send(days.filter { !$0.metrics.isEmpty }, server: server, token: token)
            note("Server replied: \(result)")
        } catch {
            note("❌ Send failed: \(error.localizedDescription)")
        }
    }
}

struct ContentView: View {
    @StateObject private var model = ProbeModel()
    @AppStorage("serverURL") private var serverURL = ""
    @AppStorage("apiToken") private var apiToken = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Test") {
                    Button("1. Ask for Health access") { Task { await model.requestAccess() } }
                    Button("2. Read last 7 days") { Task { await model.readWeek() } }
                }
                Section("Results") {
                    if model.log.isEmpty { Text("Tap the buttons above in order.").foregroundStyle(.secondary) }
                    ForEach(Array(model.log.enumerated()), id: \.offset) { _, line in
                        Text(line).font(.footnote).textSelection(.enabled)
                    }
                }
                if !model.days.isEmpty {
                    Section("Days") {
                        ForEach(model.days) { day in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(day.date).font(.headline)
                                Text(day.metrics.isEmpty ? "no data"
                                     : day.metrics.sorted { $0.key < $1.key }
                                        .map { "\($0.key): \(String(format: "%.1f", $0.value))" }
                                        .joined(separator: " · "))
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
                Section {
                    TextField("Server", text: $serverURL)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    SecureField("API token (write:apple-health)", text: $apiToken)
                    Button("3. Send these days to NutriTrace") {
                        Task { await model.send(server: serverURL, token: apiToken) }
                    }.disabled(apiToken.isEmpty || model.days.isEmpty)
                } header: { Text("Optional: send to NutriTrace") }
                  footer: { Text("Uses the same /api/v1/apple-health endpoint as your Shortcut.") }
                Section("This install") {
                    LabeledContent("Health available", value: HKHealthStore.isHealthDataAvailable() ? "yes" : "no")
                    LabeledContent("Bundle ID", value: Bundle.main.bundleIdentifier ?? "?")
                    Text(Bundle.main.bundlePath).font(.caption2).foregroundStyle(.secondary).textSelection(.enabled)
                }
            }
            .navigationTitle("HealthProbe")
            .overlay { if model.busy { ProgressView() } }
        }
    }
}

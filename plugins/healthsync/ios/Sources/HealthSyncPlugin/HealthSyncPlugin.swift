import Foundation
import Capacitor
import HealthKit

/// JS name "HealthSync". Ported from the HealthProbe test app.
///   isAvailable()           → { available }
///   requestAuthorization()  → { ok }   (rejects if the install lacks HealthKit)
///   readDays({ days })      → { days: [{ date, metrics }] }   newest first
@objc(HealthSyncPlugin)
public class HealthSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthSyncPlugin"
    public let jsName = "HealthSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readDays", returnType: CAPPluginReturnPromise),
    ]

    private let reader = HealthReader()

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        Task {
            do {
                try await reader.requestAccess()
                call.resolve(["ok": true])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func readDays(_ call: CAPPluginCall) {
        let n = max(1, min(call.getInt("days") ?? 7, 60))
        Task {
            var out: [[String: Any]] = []
            let cal = Calendar.current
            for offset in 0..<n {
                guard let day = cal.date(byAdding: .day, value: -offset, to: Date()) else { continue }
                let s = await reader.summary(for: day)
                if !s.metrics.isEmpty { out.append(["date": s.date, "metrics": s.metrics]) }
            }
            call.resolve(["days": out])
        }
    }
}

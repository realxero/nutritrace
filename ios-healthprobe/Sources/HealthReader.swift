import Foundation
import HealthKit

/// One calendar day of metrics, keyed by NutriTrace's own metric names
/// (the "simple" format accepted by POST /api/v1/apple-health).
struct DaySummary: Identifiable {
    let date: String
    var metrics: [String: Double]
    var id: String { date }
}

enum ProbeError: LocalizedError {
    case healthUnavailable
    var errorDescription: String? {
        switch self {
        case .healthUnavailable: return "Apple Health is not available on this device."
        }
    }
}

final class HealthReader {
    let store = HKHealthStore()

    static let quantityIDs: [HKQuantityTypeIdentifier] = [
        .stepCount, .distanceWalkingRunning, .flightsClimbed, .appleExerciseTime,
        .activeEnergyBurned, .basalEnergyBurned,
        .heartRate, .restingHeartRate, .heartRateVariabilitySDNN,
        .oxygenSaturation, .respiratoryRate, .vo2Max,
        .bodyMass, .bodyFatPercentage, .leanBodyMass,
    ]

    var readTypes: Set<HKObjectType> {
        var types = Set<HKObjectType>(Self.quantityIDs.map { HKQuantityType($0) })
        types.insert(HKCategoryType(.sleepAnalysis))
        return types
    }

    /// Shows the Health permission sheet. If the build was signed WITHOUT
    /// the HealthKit entitlement, this throws an error that says so.
    func requestAccess() async throws {
        guard HKHealthStore.isHealthDataAvailable() else { throw ProbeError.healthUnavailable }
        try await store.requestAuthorization(toShare: [], read: readTypes)
    }

    static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private func stat(_ id: HKQuantityTypeIdentifier, _ options: HKStatisticsOptions,
                      _ start: Date, _ end: Date) async -> HKStatistics? {
        let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let query = HKStatisticsQueryDescriptor(
            predicate: .quantitySample(type: HKQuantityType(id), predicate: pred),
            options: options)
        // No data for a type throws "no data"; treat that as missing.
        return try? await query.result(for: store)
    }

    func summary(for day: Date) async -> DaySummary {
        let cal = Calendar.current
        let start = cal.startOfDay(for: day)
        let end = cal.date(byAdding: .day, value: 1, to: start)!
        var m: [String: Double] = [:]
        func put(_ key: String, _ value: Double?) {
            if let v = value, v.isFinite, v > 0 { m[key] = v }
        }

        let kcal = HKUnit.kilocalorie()
        let bpm = HKUnit.count().unitDivided(by: .minute())

        // Sums. Health de-duplicates overlapping sources (iPhone + watch).
        put("steps", await stat(.stepCount, .cumulativeSum, start, end)?.sumQuantity()?.doubleValue(for: .count()))
        put("distance_km", await stat(.distanceWalkingRunning, .cumulativeSum, start, end)?.sumQuantity()?.doubleValue(for: .meterUnit(with: .kilo)))
        put("floors", await stat(.flightsClimbed, .cumulativeSum, start, end)?.sumQuantity()?.doubleValue(for: .count()))
        put("active_minutes", await stat(.appleExerciseTime, .cumulativeSum, start, end)?.sumQuantity()?.doubleValue(for: .minute()))
        let active = await stat(.activeEnergyBurned, .cumulativeSum, start, end)?.sumQuantity()?.doubleValue(for: kcal)
        let basal = await stat(.basalEnergyBurned, .cumulativeSum, start, end)?.sumQuantity()?.doubleValue(for: kcal)
        if let a = active, let b = basal { put("calories_out", a + b) }

        // Heart
        let hr = await stat(.heartRate, [.discreteAverage, .discreteMax], start, end)
        put("avg_heart_rate", hr?.averageQuantity()?.doubleValue(for: bpm))
        put("max_hr", hr?.maximumQuantity()?.doubleValue(for: bpm))
        put("resting_hr", await stat(.restingHeartRate, .discreteAverage, start, end)?.averageQuantity()?.doubleValue(for: bpm))
        // Apple's HRV is SDNN; the fork stores it under hrv_daily_rmssd on purpose.
        put("hrv_daily_rmssd", await stat(.heartRateVariabilitySDNN, .discreteAverage, start, end)?.averageQuantity()?.doubleValue(for: .secondUnit(with: .milli)))
        if let spo2 = await stat(.oxygenSaturation, .discreteAverage, start, end)?.averageQuantity()?.doubleValue(for: .percent()) {
            put("spo2_avg", spo2 * 100) // HealthKit percent is 0–1
        }
        put("respiratory_rate", await stat(.respiratoryRate, .discreteAverage, start, end)?.averageQuantity()?.doubleValue(for: bpm))
        put("vo2_max", await stat(.vo2Max, .mostRecent, start, end)?.mostRecentQuantity()?.doubleValue(for: HKUnit(from: "ml/(kg*min)")))

        // Body
        put("weight_kg", await stat(.bodyMass, .mostRecent, start, end)?.mostRecentQuantity()?.doubleValue(for: .gramUnit(with: .kilo)))
        if let fat = await stat(.bodyFatPercentage, .mostRecent, start, end)?.mostRecentQuantity()?.doubleValue(for: .percent()) {
            put("body_fat_pct", fat * 100)
        }
        put("lean_mass_kg", await stat(.leanBodyMass, .mostRecent, start, end)?.mostRecentQuantity()?.doubleValue(for: .gramUnit(with: .kilo)))

        for (k, v) in await sleep(endingOn: start) { m[k] = v }
        return DaySummary(date: Self.dayFormatter.string(from: start), metrics: m)
    }

    /// Sleep for the night that ends on `dayStart` (noon before → noon of),
    /// filed under the wake-up date like the server's parser does.
    func sleep(endingOn dayStart: Date) async -> [String: Double] {
        let cal = Calendar.current
        let winStart = cal.date(byAdding: .hour, value: -12, to: dayStart)!
        let winEnd = cal.date(byAdding: .hour, value: 12, to: dayStart)!
        let pred = HKQuery.predicateForSamples(withStart: winStart, end: winEnd, options: [])
        let query = HKSampleQueryDescriptor(
            predicates: [.categorySample(type: HKCategoryType(.sleepAnalysis), predicate: pred)],
            sortDescriptors: [SortDescriptor(\.startDate)])
        guard let samples = try? await query.result(for: store), !samples.isEmpty else { return [:] }

        let core = HKCategoryValueSleepAnalysis.asleepCore.rawValue
        let deep = HKCategoryValueSleepAnalysis.asleepDeep.rawValue
        let rem = HKCategoryValueSleepAnalysis.asleepREM.rawValue
        let unspecified = HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue
        let awake = HKCategoryValueSleepAnalysis.awake.rawValue
        let asleepValues: Set<Int> = [core, deep, rem, unspecified]

        // Use ONE source (e.g. Garmin Connect) so a watch + phone don't double count.
        let bySource = Dictionary(grouping: samples) { $0.sourceRevision.source.bundleIdentifier }
        func asleepMinutes(_ list: [HKCategorySample]) -> Double {
            list.filter { asleepValues.contains($0.value) }
                .reduce(0) { $0 + $1.endDate.timeIntervalSince($1.startDate) / 60 }
        }
        guard let best = bySource.values.max(by: { asleepMinutes($0) < asleepMinutes($1) }) else { return [:] }

        var mins: [Int: Double] = [:]
        for s in best { mins[s.value, default: 0] += s.endDate.timeIntervalSince(s.startDate) / 60 }
        let staged = (mins[core] ?? 0) + (mins[deep] ?? 0) + (mins[rem] ?? 0)
        let total = staged > 0 ? staged : (mins[unspecified] ?? 0)

        var out: [String: Double] = [:]
        if total > 0 { out["sleep_duration_min"] = total.rounded() }
        if let v = mins[core], v > 0 { out["sleep_light_min"] = v.rounded() }
        if let v = mins[deep], v > 0 { out["sleep_deep_min"] = v.rounded() }
        if let v = mins[rem], v > 0 { out["sleep_rem_min"] = v.rounded() }
        if let v = mins[awake], v > 0 { out["sleep_wake_min"] = v.rounded() }
        let asleep = best.filter { asleepValues.contains($0.value) }
        if let first = asleep.map(\.startDate).min(), let last = asleep.map(\.endDate).max() {
            func wall(_ d: Date) -> Double {
                let c = cal.dateComponents([.hour, .minute], from: d)
                return Double((c.hour ?? 0) * 60 + (c.minute ?? 0))
            }
            out["sleep_start_min"] = wall(first)
            out["sleep_end_min"] = wall(last)
        }
        return out
    }
}

import Foundation
import HealthKit

/// One calendar day keyed by NutriTrace's metric names (the "simple" format
/// the server's Apple Health ingest accepts).
struct DaySummary {
    let date: String
    var metrics: [String: Double]
}

enum HealthSyncError: LocalizedError {
    case unavailable
    var errorDescription: String? { "Apple Health is not available on this device." }
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

    func requestAccess() async throws {
        guard HKHealthStore.isHealthDataAvailable() else { throw HealthSyncError.unavailable }
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
        return try? await query.result(for: store)   // "no data" throws → nil
    }

    func summary(for day: Date) async -> DaySummary {
        let cal = Calendar.current
        let start = cal.startOfDay(for: day)
        let end = cal.date(byAdding: .day, value: 1, to: start)!
        var m: [String: Double] = [:]
        func put(_ key: String, _ value: Double?) {
            if let v = value, v.isFinite, v > 0 { m[key] = (v * 10).rounded() / 10 }
        }
        let kcal = HKUnit.kilocalorie()
        let bpm = HKUnit.count().unitDivided(by: .minute())

        put("steps", (await stat(.stepCount, .cumulativeSum, start, end)?.sumQuantity()?.doubleValue(for: .count())).map { $0.rounded() })
        put("distance_km", await stat(.distanceWalkingRunning, .cumulativeSum, start, end)?.sumQuantity()?.doubleValue(for: .meterUnit(with: .kilo)))
        put("floors", (await stat(.flightsClimbed, .cumulativeSum, start, end)?.sumQuantity()?.doubleValue(for: .count())).map { $0.rounded() })
        put("active_minutes", await stat(.appleExerciseTime, .cumulativeSum, start, end)?.sumQuantity()?.doubleValue(for: .minute()))
        let active = await stat(.activeEnergyBurned, .cumulativeSum, start, end)?.sumQuantity()?.doubleValue(for: kcal)
        let basal = await stat(.basalEnergyBurned, .cumulativeSum, start, end)?.sumQuantity()?.doubleValue(for: kcal)
        put("active_calories", active)
        if let a = active, let b = basal { put("calories_out", a + b) }

        let hr = await stat(.heartRate, [.discreteAverage, .discreteMax], start, end)
        put("avg_heart_rate", hr?.averageQuantity()?.doubleValue(for: bpm))
        put("max_hr", hr?.maximumQuantity()?.doubleValue(for: bpm))
        put("resting_hr", await stat(.restingHeartRate, .discreteAverage, start, end)?.averageQuantity()?.doubleValue(for: bpm))
        // Apple's HRV is SDNN; the fork stores it under hrv_daily_rmssd on purpose.
        put("hrv_daily_rmssd", await stat(.heartRateVariabilitySDNN, .discreteAverage, start, end)?.averageQuantity()?.doubleValue(for: .secondUnit(with: .milli)))
        if let spo2 = await stat(.oxygenSaturation, .discreteAverage, start, end)?.averageQuantity()?.doubleValue(for: .percent()) {
            put("spo2_avg", spo2 * 100)
        }
        put("respiratory_rate", await stat(.respiratoryRate, .discreteAverage, start, end)?.averageQuantity()?.doubleValue(for: bpm))
        put("vo2_max", await stat(.vo2Max, .mostRecent, start, end)?.mostRecentQuantity()?.doubleValue(for: HKUnit(from: "ml/(kg*min)")))
        put("weight_kg", await stat(.bodyMass, .mostRecent, start, end)?.mostRecentQuantity()?.doubleValue(for: .gramUnit(with: .kilo)))
        if let fat = await stat(.bodyFatPercentage, .mostRecent, start, end)?.mostRecentQuantity()?.doubleValue(for: .percent()) {
            put("body_fat_pct", fat * 100)
        }
        put("lean_mass_kg", await stat(.leanBodyMass, .mostRecent, start, end)?.mostRecentQuantity()?.doubleValue(for: .gramUnit(with: .kilo)))

        for (k, v) in await sleep(wakingOn: start) { m[k] = v }
        return DaySummary(date: Self.dayFormatter.string(from: start), metrics: m)
    }

    /// The main sleep that ENDS on this calendar day (filed under the wake-up
    /// date). Samples are grouped into sessions (a gap over 2 h starts a new
    /// one), so a daytime sleep after a night shift, or last night's sleep,
    /// is measured as one block instead of being cut at noon.
    func sleep(wakingOn dayStart: Date) async -> [String: Double] {
        let cal = Calendar.current
        let winStart = cal.date(byAdding: .hour, value: -18, to: dayStart)!   // 6 AM the day before
        let winEnd = cal.date(byAdding: .day, value: 1, to: dayStart)!
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
        func minutes(_ s: HKCategorySample) -> Double { s.endDate.timeIntervalSince(s.startDate) / 60 }

        // One source only (e.g. Garmin Connect) so watch + phone don't double count.
        let bySource = Dictionary(grouping: samples) { $0.sourceRevision.source.bundleIdentifier }
        guard let best = bySource.values.max(by: { a, b in
            a.filter { asleepValues.contains($0.value) }.reduce(0) { $0 + minutes($1) } <
            b.filter { asleepValues.contains($0.value) }.reduce(0) { $0 + minutes($1) }
        }) else { return [:] }

        // Group asleep samples into sessions.
        var sessions: [(start: Date, end: Date)] = []
        for s in best.filter({ asleepValues.contains($0.value) }).sorted(by: { $0.startDate < $1.startDate }) {
            if let last = sessions.last, s.startDate.timeIntervalSince(last.end) <= 2 * 3600 {
                sessions[sessions.count - 1].end = max(last.end, s.endDate)
            } else {
                sessions.append((s.startDate, s.endDate))
            }
        }
        let endingToday = sessions.filter { $0.end >= dayStart && $0.end < winEnd }
        guard let main = endingToday.max(by: { $0.end.timeIntervalSince($0.start) < $1.end.timeIntervalSince($1.start) })
        else { return [:] }

        var mins: [Int: Double] = [:]
        for s in best where s.startDate >= main.start && s.endDate <= main.end {
            mins[s.value, default: 0] += minutes(s)
        }
        let staged = (mins[core] ?? 0) + (mins[deep] ?? 0) + (mins[rem] ?? 0)
        let total = staged > 0 ? staged : (mins[unspecified] ?? 0)

        var out: [String: Double] = [:]
        if total > 0 { out["sleep_duration_min"] = total.rounded() }
        if let v = mins[core], v > 0 { out["sleep_light_min"] = v.rounded() }
        if let v = mins[deep], v > 0 { out["sleep_deep_min"] = v.rounded() }
        if let v = mins[rem], v > 0 { out["sleep_rem_min"] = v.rounded() }
        if let v = mins[awake], v > 0 { out["sleep_wake_min"] = v.rounded() }
        func wall(_ d: Date) -> Double {
            let c = cal.dateComponents([.hour, .minute], from: d)
            return Double((c.hour ?? 0) * 60 + (c.minute ?? 0))
        }
        out["sleep_start_min"] = wall(main.start)
        out["sleep_end_min"] = wall(main.end)
        return out
    }
}

Pod::Spec.new do |s|
  s.name = 'NutritraceHealthsync'
  s.version = '0.1.0'
  s.summary = 'Apple Health reader for the NutriTrace iOS app (fork)'
  s.license = 'AGPL-3.0'
  s.homepage = 'https://github.com/TraceApps/nutritrace'
  s.author = 'NutriTrace fork'
  s.source = { :git => 'https://github.com/TraceApps/nutritrace.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.swift'
  s.ios.deployment_target = '16.0'
  s.dependency 'Capacitor'
  s.frameworks = 'HealthKit'
  s.swift_version = '5.1'
end

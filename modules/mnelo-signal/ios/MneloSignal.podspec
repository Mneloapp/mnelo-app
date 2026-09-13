Pod::Spec.new do |s|
  s.name = 'MneloSignal'
  s.version = '1.0.0'
  s.summary = 'Mnelo binding to the official Signal Protocol library'
  s.description = 'Delegates key establishment and message encryption to libsignal.'
  s.author = 'Mnelo'
  s.homepage = 'https://mnelo.com'
  s.license = { :type => 'AGPL-3.0-only', :file => '../../../LICENSE' }
  s.platforms = { :ios => '16.4' }
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'LibSignalClient', '= 0.102.2'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
  s.pod_target_xcconfig = {
    'HEADER_SEARCH_PATHS' => '$(inherited) "$(PODS_ROOT)/LibSignalClient/swift/Sources/SignalFfi"',
    'SWIFT_INCLUDE_PATHS' => '$(inherited) "$(PODS_ROOT)/LibSignalClient/swift/Sources/SignalFfi"'
  }
  # CocoaPods static frameworks archive the Swift wrapper but do not merge its
  # Rust archive. Link the vendor's checksum-verified build into the final app.
  # Keep this in the local pod so clean Expo prebuilds reproduce the linkage.
  s.user_target_xcconfig = {
    'MNELO_SIGNAL_CARGO_TARGET[sdk=iphoneos*]' => 'aarch64-apple-ios',
    'MNELO_SIGNAL_CARGO_TARGET[sdk=iphonesimulator*][arch=*]' => 'x86_64-apple-ios',
    'MNELO_SIGNAL_CARGO_TARGET[sdk=iphonesimulator*][arch=arm64]' => 'aarch64-apple-ios-sim',
    'OTHER_LDFLAGS' => '$(inherited) "$(PROJECT_TEMP_ROOT)/Pods.build/libsignal_ffi/target/$(MNELO_SIGNAL_CARGO_TARGET)/release/libsignal_ffi.a"'
  }
end

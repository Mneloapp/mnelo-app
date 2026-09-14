Pod::Spec.new do |s|
  s.name = 'MneloShareRuntime'
  s.version = '1.0.0'
  s.summary = 'Native Mnelo sharing with the existing encrypted device engine'
  s.homepage = 'https://mnelo.com'
  s.author = 'Mnelo'
  s.license = { :type => 'AGPL-3.0-only', :file => '../../../LICENSE' }
  s.source = { :path => '.' }
  s.platforms = { :ios => '16.4' }
  s.static_framework = true
  s.swift_version = '5.9'
  s.source_files = '**/*.{swift,h,c}'
  s.public_header_files = 'Generated/sqlite3.h'
  s.frameworks = 'JavaScriptCore', 'Security', 'SwiftUI', 'ImageIO', 'UniformTypeIdentifiers', 'Intents', 'Contacts', 'UserNotifications'
  s.dependency 'LibSignalClient', '= 0.102.2'
  s.compiler_flags = '-DHAVE_USLEEP=1 -DSQLITE_ENABLE_LOCKING_STYLE=0 -DSQLITE_TEMP_STORE=2 -DSQLITE_ENABLE_SESSION=1 -DSQLITE_ENABLE_PREUPDATE_HOOK=1 -DSQLITE_ENABLE_MATH_FUNCTIONS=1 -DSQLITE_HAS_CODEC=1 -DSQLCIPHER_CRYPTO_CC -DSQLITE_EXTRA_INIT=sqlcipher_extra_init -DSQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown -DNDEBUG'
  s.pod_target_xcconfig = {
    'APPLICATION_EXTENSION_API_ONLY' => 'YES',
    'HEADER_SEARCH_PATHS' => '$(inherited) "$(PODS_ROOT)/LibSignalClient/swift/Sources/SignalFfi"',
    'SWIFT_INCLUDE_PATHS' => '$(inherited) "$(PODS_ROOT)/LibSignalClient/swift/Sources/SignalFfi"'
  }
  s.user_target_xcconfig = {
    'MNELO_SIGNAL_CARGO_TARGET[sdk=iphoneos*]' => 'aarch64-apple-ios',
    'MNELO_SIGNAL_CARGO_TARGET[sdk=iphonesimulator*][arch=*]' => 'x86_64-apple-ios',
    'MNELO_SIGNAL_CARGO_TARGET[sdk=iphonesimulator*][arch=arm64]' => 'aarch64-apple-ios-sim',
    'OTHER_LDFLAGS' => '$(inherited) "$(PROJECT_TEMP_ROOT)/Pods.build/libsignal_ffi/target/$(MNELO_SIGNAL_CARGO_TARGET)/release/libsignal_ffi.a"'
  }
end

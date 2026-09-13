Pod::Spec.new do |s|
  s.name = 'MneloShare'
  s.version = '1.0.0'
  s.summary = 'Mnelo incoming attachments and conversation suggestions'
  s.author = 'Mnelo'
  s.homepage = 'https://mnelo.com'
  s.license = { :type => 'AGPL-3.0-only', :file => '../../../LICENSE' }
  s.platforms = { :ios => '16.4' }
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.frameworks = 'Intents', 'CryptoKit'
  s.swift_version = '5.9'
end

Pod::Spec.new do |s|
  s.name = 'MneloCalls'
  s.version = '1.0.0'
  s.summary = 'Mnelo native incoming call lifecycle'
  s.description = 'PushKit and CallKit without server message history.'
  s.author = 'Mnelo'
  s.homepage = 'https://mnelo.com'
  s.license = { :type => 'AGPL-3.0-only', :file => '../../../LICENSE' }
  s.platforms = { :ios => '16.4' }
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'WebRTC-SDK', '=144.7559.10'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
end

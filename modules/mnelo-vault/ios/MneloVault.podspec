Pod::Spec.new do |s|
  s.name = 'MneloVault'
  s.version = '1.0.0'
  s.summary = 'Device-owned Mnelo storage'
  s.description = 'Creates a protected, backup-excluded local storage directory.'
  s.author = 'Mnelo'
  s.homepage = 'https://mnelo.com'
  s.license = { :type => 'AGPL-3.0-only', :file => '../../../LICENSE' }
  s.platforms = { :ios => '16.4' }
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.dependency 'ExpoSQLite'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.swift_version = '5.9'
end

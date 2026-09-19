"""Verify a signed Mnelo TestFlight app before upload; never modify its contents."""
import argparse
import hashlib
import json
import pathlib
import plistlib
import subprocess


def plist(path):
    return plistlib.loads(path.read_bytes())


def run(*args):
    return subprocess.check_output(args, stderr=subprocess.PIPE)


def verify_siri_vocabulary(app):
    # Apple ingests localized vocabulary from the containing iOS app, not the
    # Intents extension. A valid signed extension alone missed ITMS-90626.
    for locale in ['en', 'ka']:
        path = app / (locale + '.lproj') / 'AppIntentVocabulary.plist'
        assert path.is_file(), 'SIRI_VOCABULARY_MISSING_' + locale
        phrases = plist(path).get('IntentPhrases')
        assert isinstance(phrases, list), 'SIRI_INTENT_PHRASES_MISSING_' + locale
        supported = [entry for entry in phrases if isinstance(entry, dict)
                     and entry.get('IntentName') == 'INSendMessageIntent']
        assert len(supported) == 1, 'SIRI_SEND_MESSAGE_PHRASES_MISSING_' + locale
        examples = supported[0].get('IntentExamples')
        assert (isinstance(examples, list) and len(examples) > 0
                and all(isinstance(value, str) and value.strip() for value in examples)), \
            'SIRI_INTENT_EXAMPLES_MISSING_' + locale


def verify(app, build, distribution):
    expected = {
        app: 'com.mnelo.messenger',
        app / 'PlugIns/expo-sharing-extension.appex': 'com.mnelo.messenger.share',
        app / 'PlugIns/MneloNotifications.appex': 'com.mnelo.messenger.notifications',
        app / 'PlugIns/MneloBroadcast.appex': 'com.mnelo.messenger.broadcast',
        app / 'PlugIns/MneloIntents.appex': 'com.mnelo.messenger.intents',
    }
    run('codesign', '--verify', '--deep', '--strict', str(app))
    # A transitive vendor framework can load the unavailable test runtime even
    # when the application's own load commands are clean.
    for framework in app.rglob('*.framework'):
        executable = plist(framework / 'Info.plist')['CFBundleExecutable']
        linked = run('otool', '-L', str(framework / executable))
        assert b'/Testing.framework/' not in linked, 'TEST_FRAMEWORK_LINKED_IN_DEPENDENCY'
    for library in app.rglob('*.dylib'):
        linked = run('otool', '-L', str(library))
        assert b'/Testing.framework/' not in linked, 'TEST_FRAMEWORK_LINKED_IN_DEPENDENCY'
    for path, identifier in expected.items():
        info = plist(path / 'Info.plist')
        assert info['CFBundleIdentifier'] == identifier, 'BUNDLE_IDENTIFIER_MISMATCH'
        assert info['CFBundleVersion'] == build, 'BUNDLE_VERSION_MISMATCH'
        assert info['CFBundleShortVersionString'] == '0.1.0', 'MARKETING_VERSION_MISMATCH'
        linked = run('otool', '-L', str(path / info['CFBundleExecutable']))
        assert b'/Testing.framework/' not in linked, 'TEST_FRAMEWORK_LINKED_IN_PRODUCT'
        entitlements = plistlib.loads(run('codesign', '-d', '--entitlements', ':-', str(path)))
        assert entitlements['com.apple.developer.team-identifier'] == 'CS6GJ2BMS9'
        assert entitlements['com.apple.security.application-groups'] == [
            'group.com.mnelo.messenger.sharing'
        ]
        if distribution:
            assert entitlements.get('get-task-allow') is False, 'DISTRIBUTION_DEBUG_ENABLED'
        if not identifier.endswith('.broadcast'):
            assert info['MneloKeychainAccessGroup'] == 'CS6GJ2BMS9.com.mnelo.messenger.shared'
            assert 'CS6GJ2BMS9.com.mnelo.messenger.shared' in entitlements['keychain-access-groups']
        if identifier == 'com.mnelo.messenger':
            assert 'CS6GJ2BMS9.com.mnelo.messenger' in entitlements['keychain-access-groups']
            assert entitlements.get('com.apple.developer.siri') is True, 'SIRI_CAPABILITY_MISSING'
            assert info.get('NSSiriUsageDescription'), 'SIRI_PURPOSE_MISSING'
            if distribution:
                assert entitlements['aps-environment'] == 'production'
        elif not identifier.endswith('.broadcast'):
            assert info['MneloDeliveryOrigin'] == 'https://identity-dev.mnelo.com'
        if identifier.endswith('.intents'):
            extension = info['NSExtension']
            assert extension['NSExtensionPointIdentifier'] == 'com.apple.intents-service'
            assert extension['NSExtensionPrincipalClass'].endswith('.MessageIntentHandler')
            attributes = extension['NSExtensionAttributes']
            assert attributes['IntentsSupported'] == ['INSendMessageIntent']
            assert attributes['IntentsRestrictedWhileLocked'] == []
            assert attributes['IntentsRestrictedWhileProtectedDataUnavailable'] == ['INSendMessageIntent']

    endpoints = [b'https://identity-dev.mnelo.com', b'wss://relay-dev.mnelo.com/']
    main = (app / 'main.jsbundle').read_bytes()
    for endpoint in endpoints:
        assert endpoint in main, 'MAIN_SERVICE_ENDPOINT_MISSING'
    assert ('ios-0.1.0-' + build).encode() in main, 'EXACT_SOURCE_OFFER_MISSING'
    for relative in [
        'PlugIns/expo-sharing-extension.appex/MneloShare.js',
        'PlugIns/MneloNotifications.appex/MneloNotification.js',
        'PlugIns/MneloIntents.appex/MneloIntents.js',
    ]:
        assert endpoints[0] in (app / relative).read_bytes(), 'EXTENSION_SERVICE_ENDPOINT_MISSING'
    verify_siri_vocabulary(app)
    run('node', 'scripts/check-ios-permissions.mjs', str(app))
    return {
        'build': build,
        'signature': 'PASS',
        'extensions': 'PASS',
        'serviceEndpoints': 'PASS',
        'sourceOffer': 'PASS',
        'testingFrameworkAbsent': 'PASS',
        'siriVocabulary': 'PASS',
        'distributionEntitlementsChecked': distribution,
        'hermesSHA256': hashlib.sha256(main).hexdigest(),
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('app', type=pathlib.Path)
    parser.add_argument('--build', required=True)
    parser.add_argument('--distribution', action='store_true')
    options = parser.parse_args()
    print(json.dumps(verify(options.app, options.build, options.distribution), indent=2))

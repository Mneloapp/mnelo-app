import 'tsx/cjs';
import type { ExpoConfig } from 'expo/config';
import { messengerEnvironment } from './src/messenger/environment';
import { theme } from './src/theme/tokens';
import nativeEnglish from './src/i18n/native/en.json';
const environment = messengerEnvironment({
  appEnv: process.env.EXPO_PUBLIC_APP_ENV,
  relayUrl: process.env.EXPO_PUBLIC_RELAY_URL,
  phoneIdentityUrl: process.env.EXPO_PUBLIC_PHONE_IDENTITY_URL,
});

const profile = process.env.EAS_BUILD_PROFILE;
const expectedEnvironment =
  profile === 'development-simulator'
    ? 'development'
    : profile === 'testflight'
      ? 'preview'
      : profile;
if (expectedEnvironment && environment.appEnv !== expectedEnvironment) {
  throw new Error('CONFIG_ENV_PROFILE_MISMATCH: EAS profile and app environment must agree.');
}
const projectId = process.env.EAS_PROJECT_ID;
if (
  projectId &&
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)
) {
  throw new Error('CONFIG_INVALID_PROJECT_ID: EAS_PROJECT_ID must be a UUID.');
}

const config: ExpoConfig = {
  name: 'Mnelo',
  slug: 'mnelo',
  icon: './assets/brand/app-icon.png',
  version: '0.1.0',
  scheme: 'mnelo',
  locales: { en: './src/i18n/native/en.json', ka: './src/i18n/native/ka.json' },
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  platforms:
    environment.appEnv === 'local' && process.env.MNELO_UI_PREVIEW === '1'
      ? ['ios', 'android', 'web']
      : ['ios', 'android'],
  ios: {
    bundleIdentifier: 'com.mnelo.messenger',
    appleTeamId: 'CS6GJ2BMS9',
    buildNumber: '25',
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1', '1C8F.1'],
        },
      ],
    },
    supportsTablet: false,
    associatedDomains: ['applinks:mnelo.com', 'applinks:www.mnelo.com'],
    infoPlist: { UIBackgroundModes: ['audio', 'voip', 'remote-notification'] },
  },
  android: {
    package: 'com.mnelo.messenger',
    ...(process.env.MNELO_GOOGLE_SERVICES_FILE
      ? { googleServicesFile: process.env.MNELO_GOOGLE_SERVICES_FILE }
      : {}),
    allowBackup: false,
    permissions: [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
    ],
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        category: ['BROWSABLE', 'DEFAULT'],
        data: [
          { scheme: 'https', host: 'mnelo.com', pathPrefix: '/invite' },
          { scheme: 'https', host: 'www.mnelo.com', pathPrefix: '/invite' },
        ],
      },
    ],
    adaptiveIcon: {
      foregroundImage: './assets/brand/android-foreground.png',
      monochromeImage: './assets/brand/android-monochrome.png',
      backgroundColor: theme.colors.background,
    },
    // Remove template permissions; add each permission with its feature and consent UX.
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_CALENDAR',
      'android.permission.WRITE_CALENDAR',
    ],
  },
  plugins: [
    [
      'expo-camera',
      {
        cameraPermission: nativeEnglish.ios.NSCameraUsageDescription,
        // This permission is shared with voice messages and WebRTC calls.
        microphonePermission: nativeEnglish.ios.NSMicrophoneUsageDescription,
        recordAudioAndroid: false,
        barcodeScannerEnabled: true,
      },
    ],
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 26,
          extraMavenRepos: ['https://build-artifacts.signal.org/libraries/maven/'],
        },
        ios: {
          useFrameworks: 'static',
          // expo-camera 57 splits scanning into a companion pod. The installed
          // autolinker omitted it even with barcodeScannerEnabled=true; persist
          // the explicit dependency through prebuild, never patch generated Swift.
          extraPods: [
            {
              name: 'LibSignalClient',
              git: 'https://github.com/signalapp/libsignal.git',
              tag: 'v0.102.2',
            },
            { name: 'ExpoCameraBarcodeScanning', path: '../node_modules/expo-camera/ios' },
            { name: 'ZXingObjC/PDF417', modular_headers: true },
            { name: 'ZXingObjC/OneD', modular_headers: true },
          ],
        },
      },
    ],
    ['./plugins/with-local-network.cjs', { local: environment.appEnv === 'local' }],
    './plugins/with-signal.cjs',
    ['@livekit/react-native-expo-plugin', { android: { enableScreenShareService: true } }],
    [
      'expo-calendar',
      {
        // The linked EventKit framework requires the legacy purpose string even
        // though the system event editor does not request access to calendars.
        calendarPermission: nativeEnglish.ios.NSCalendarsUsageDescription,
        writeOnlyAccess: true,
        writeOnlyCalendarPermission: false,
        remindersPermission: false,
      },
    ],
    './plugins/with-screen-sharing.cjs',
    ['expo-sqlite', { useSQLCipher: true, enableFTS: false }],
    [
      '@config-plugins/react-native-webrtc',
      {
        cameraPermission: nativeEnglish.ios.NSCameraUsageDescription,
        microphonePermission:
          'Use the microphone for Mnelo calls and voice messages when you choose.',
      },
    ],
    [
      'expo-notifications',
      {
        defaultChannel: 'mnelo-updates',
        icon: './assets/brand/notification.png',
        color: theme.colors.black,
        mode:
          environment.appEnv === 'preview' || environment.appEnv === 'production'
            ? 'production'
            : 'development',
        enableBackgroundRemoteNotifications: true,
      },
    ],
    'expo-asset',
    'expo-font',
    './plugins/with-incoming-share.cjs',
    [
      'expo-sharing',
      {
        ios: {
          enabled: true,
          extensionBundleIdentifier: 'com.mnelo.messenger.share',
          appGroupId: 'group.com.mnelo.messenger.sharing',
          activationRule: {
            supportsText: true,
            supportsWebUrlWithMaxCount: 1,
            supportsImageWithMaxCount: 10,
            supportsFileWithMaxCount: 10,
            supportsMovieWithMaxCount: 10,
            supportsAttachmentsWithMaxCount: 10,
          },
        },
        android: { enabled: true, singleShareMimeTypes: ['*/*'], multipleShareMimeTypes: ['*/*'] },
      },
    ],
    'expo-router',
    ['expo-dev-client', { launchMode: 'most-recent' }],
    [
      'expo-splash-screen',
      {
        backgroundColor: theme.colors.background,
        image: './assets/brand/mark-primary.png',
        imageWidth: 120,
      },
    ],
    ['expo-secure-store', { configureAndroidBackup: true, faceIDPermission: false }],
    ['expo-localization', { supportedLocales: ['en', 'ka'] }],
    [
      'expo-audio',
      {
        microphonePermission:
          'Use the microphone for Mnelo calls and voice messages when you choose.',
        enableBackgroundPlayback: false,
        enableBackgroundRecording: false,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Share your current location with this conversation only when you choose.',
        locationAlwaysAndWhenInUsePermission: false,
        locationAlwaysPermission: false,
        // Expo Location still links Core Motion when this key is omitted.
        // Apple requires the description even though Mnelo never calls motion APIs.
        motionUsagePermission: nativeEnglish.ios.NSMotionUsageDescription,
        isAndroidMotionActivityEnabled: false,
      },
    ],
    [
      'expo-contacts',
      {
        contactsPermission: nativeEnglish.ios.NSContactsUsageDescription,
      },
    ],
    './plugins/with-contact-permissions.cjs',
    [
      'expo-image-picker',
      {
        photosPermission: 'Choose a photo to share on your Mnelo profile or in a conversation.',
        cameraPermission: nativeEnglish.ios.NSCameraUsageDescription,
        microphonePermission:
          'Use the microphone for Mnelo calls and voice messages when you choose.',
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    appEnvironment: environment.appEnv,
    website: 'https://mnelo.com',
    ...(projectId ? { eas: { projectId } } : {}),
  },
};

export default config;

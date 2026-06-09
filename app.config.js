module.exports = {
  expo: {
    name: 'GolfCaddie',
    slug: 'golf-caddie',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'dark',
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.personal.golfcaddie',
      buildNumber: '1',
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'GPS measures distances to the green and tracks your shots during a round.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'Background GPS tracks shots during a round when the screen is off.',
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#0b1810',
      },
      package: 'com.personal.golfcaddie',
      versionCode: 1,
      permissions: [
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
      ],
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY,
        },
      },
    },
    plugins: [
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          imageWidth: 220,
          resizeMode: 'contain',
          backgroundColor: '#0b1810',
        },
      ],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission:
            'GPS measures distances to the green and tracks your shots during a round.',
        },
      ],
    ],
    web: {
      favicon: './assets/favicon.png',
    },
    extra: {
      eas: {
        projectId: 'b9f1d832-dfbb-4c55-a4f0-94f7edc7aa77',
      },
    },
  },
};

import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Store Updates Example',
  slug: 'expo-app-updates-example',
  version: '1.0.0',
  android: {
    package: 'com.andwati.appupdates.example',
    versionCode: 1,
  },
  ios: {
    bundleIdentifier: 'com.andwati.appupdates.example',
  },
  experiments: {
    autolinkingModuleResolution: true,
  },
};

export default config;

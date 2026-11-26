// Reexport the native module. On web, it will be resolved to ExpoAppUpdatesAndroidIosModule.web.ts
// and on native platforms to ExpoAppUpdatesAndroidIosModule.ts
export { default } from './ExpoAppUpdatesAndroidIosModule';
export * from './ExpoAppUpdatesAndroidIos.types';

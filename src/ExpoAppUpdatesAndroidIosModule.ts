import { NativeModule, requireNativeModule } from 'expo';

declare class ExpoAppUpdatesAndroidIosModule extends NativeModule<{}> {}

export default requireNativeModule<ExpoAppUpdatesAndroidIosModule>('ExpoAppUpdatesAndroidIos');

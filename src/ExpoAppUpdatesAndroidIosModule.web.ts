import { registerWebModule, NativeModule } from 'expo';

// ExpoAppUpdatesAndroidIosModule is not available on the web platform.
class ExpoAppUpdatesAndroidIosModule extends NativeModule<{}> {}

export default registerWebModule(ExpoAppUpdatesAndroidIosModule, 'ExpoAppUpdatesAndroidIosModule');

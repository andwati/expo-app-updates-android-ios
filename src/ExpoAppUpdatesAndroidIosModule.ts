import { type NativeModule, requireOptionalNativeModule } from 'expo';
import type {
  AndroidFlowResult,
  AndroidUpdateInfo,
  AndroidUpdateMode,
  CompleteUpdateResult,
  InstallState,
  IOSUpdateMode,
  StartUpdateResult,
} from './ExpoAppUpdatesAndroidIos.types';

export interface IOSAppInfo {
  bundleId: string;
  installedVersion: string;
  osVersion: string;
  storefrontCountry?: string;
  deviceCountry?: string;
}

type UpdateEvents = {
  onInstallStateChanged: (state: InstallState) => void;
  onUpdateFlowResult: (result: AndroidFlowResult) => void;
  onStoreKitDismissed: (event: Record<string, never>) => void;
};

export interface NativeUpdatesModule extends InstanceType<typeof NativeModule<UpdateEvents>> {
  checkAndroidAsync(
    allowAssetPackDeletion: boolean
  ): Promise<AndroidUpdateInfo | { status: 'unsupported'; platform: 'android' }>;
  startAndroidAsync(options: {
    mode: AndroidUpdateMode;
    allowAssetPackDeletion: boolean;
  }): Promise<StartUpdateResult>;
  resumeAndroidAsync(allowAssetPackDeletion: boolean): Promise<StartUpdateResult>;
  completeAndroidAsync(): Promise<CompleteUpdateResult>;
  getIOSAppInfoAsync(): Promise<IOSAppInfo>;
  openIOSAsync(options: {
    id: number;
    url: string;
    mode: IOSUpdateMode;
    fallbackToAppStore: boolean;
  }): Promise<StartUpdateResult>;
}

const nativeUpdates: NativeUpdatesModule | null = requireOptionalNativeModule<NativeUpdatesModule>(
  'ExpoAppUpdatesAndroidIos'
);

export default nativeUpdates;

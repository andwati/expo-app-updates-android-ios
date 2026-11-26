import { Platform } from 'react-native';
import {
  type AndroidCheckOptions,
  type AndroidFlowResult,
  AppUpdateError,
  type CheckOptions,
  type CompleteUpdateResult,
  type InstallState,
  type StartUpdateOptions,
  type StartUpdateResult,
  type UpdateInfo,
  type UpdateSubscription,
} from './ExpoAppUpdatesAndroidIos.types';
import native from './ExpoAppUpdatesAndroidIosModule';
import { isAppStoreUrl, lookupIOSUpdate } from './iosLookup';
import { asUpdateError } from './updateErrors';

const unsupported = { status: 'unsupported' } as const;
const noopSubscription: UpdateSubscription = { remove() {} };

export async function checkForUpdateAsync(options: CheckOptions = {}): Promise<UpdateInfo> {
  try {
    if (native && Platform.OS === 'android' && !Platform.isTV) {
      return await native.checkAndroidAsync(options.android?.allowAssetPackDeletion ?? false);
    }
    if (native && Platform.OS === 'ios' && !Platform.isTV) {
      return await lookupIOSUpdate(await native.getIOSAppInfoAsync(), options.ios);
    }
    return { ...unsupported, platform: Platform.OS };
  } catch (error) {
    throw asUpdateError(error, 'ERR_UPDATE_CHECK');
  }
}

export async function startUpdateAsync(options: StartUpdateOptions): Promise<StartUpdateResult> {
  if (!native || Platform.isTV || options.platform !== Platform.OS) {
    return unsupported;
  }
  try {
    if (options.platform === 'android') {
      return await native.startAndroidAsync({
        mode: options.mode,
        allowAssetPackDeletion: options.allowAssetPackDeletion ?? false,
      });
    }
    const { update, mode = 'appStore', fallbackToAppStore = true } = options;
    if (
      update.platform !== 'ios' ||
      update.status !== 'available' ||
      !Number.isSafeInteger(update.appStoreId) ||
      update.appStoreId <= 0 ||
      !isAppStoreUrl(update.appStoreUrl, update.appStoreId)
    ) {
      throw new AppUpdateError('ERR_UPDATE_OPTIONS', 'An available iOS lookup result is required.');
    }
    return await native.openIOSAsync({
      id: update.appStoreId,
      url: update.appStoreUrl,
      mode,
      fallbackToAppStore,
    });
  } catch (error) {
    throw asUpdateError(error, 'ERR_UPDATE_LAUNCH');
  }
}

export async function resumeImmediateUpdateAsync(
  options: AndroidCheckOptions = {}
): Promise<StartUpdateResult> {
  if (!native || Platform.OS !== 'android' || Platform.isTV) {
    return unsupported;
  }
  try {
    return await native.resumeAndroidAsync(options.allowAssetPackDeletion ?? false);
  } catch (error) {
    throw asUpdateError(error, 'ERR_UPDATE_LAUNCH');
  }
}

export async function completeFlexibleUpdateAsync(): Promise<CompleteUpdateResult> {
  if (!native || Platform.OS !== 'android' || Platform.isTV) {
    return unsupported;
  }
  try {
    return await native.completeAndroidAsync();
  } catch (error) {
    throw asUpdateError(error, 'ERR_UPDATE_INSTALL');
  }
}

export function addInstallStateListener(
  listener: (state: InstallState) => void
): UpdateSubscription {
  return native && Platform.OS === 'android' && !Platform.isTV
    ? native.addListener('onInstallStateChanged', listener)
    : noopSubscription;
}

export function addUpdateFlowResultListener(
  listener: (result: AndroidFlowResult) => void
): UpdateSubscription {
  return native && Platform.OS === 'android' && !Platform.isTV
    ? native.addListener('onUpdateFlowResult', listener)
    : noopSubscription;
}

export function addStoreKitDismissListener(listener: () => void): UpdateSubscription {
  return native && Platform.OS === 'ios' && !Platform.isTV
    ? native.addListener('onStoreKitDismissed', listener)
    : noopSubscription;
}

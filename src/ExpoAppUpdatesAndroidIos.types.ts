export type AndroidUpdateMode = 'flexible' | 'immediate';
export type IOSUpdateMode = 'appStore' | 'storeKit';

export type InstallStatus =
  | 'unknown'
  | 'pending'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'installed'
  | 'failed'
  | 'canceled';

export interface InstallState {
  status: InstallStatus;
  bytesDownloaded?: number;
  totalBytesToDownload?: number;
  errorCode?: number;
}

export interface AndroidCheckOptions {
  /** Include modes that Play allows only with asset pack deletion. Defaults to false. */
  allowAssetPackDeletion?: boolean;
}

export interface IOSCheckOptions {
  /** Look up this App Store listing instead of the installed bundle ID. */
  appStoreId?: number;
  /** Two-letter storefront code. Defaults to the user's App Store storefront. */
  country?: string;
  /** Maximum time for the lookup request. Defaults to 10,000 milliseconds. */
  timeoutMs?: number;
}

export interface CheckOptions {
  android?: AndroidCheckOptions;
  ios?: IOSCheckOptions;
}

interface AndroidUpdateInfoBase {
  platform: 'android';
  installedVersion: string;
  installedVersionCode: number;
  availableVersionCode?: number;
  allowedModes: AndroidUpdateMode[];
  immediateUpdateInProgress: boolean;
  priority?: number;
  stalenessDays?: number;
  installState: InstallState;
}

export type AndroidAvailableUpdate = AndroidUpdateInfoBase & {
  status: 'available';
  availableVersionCode: number;
};
export type AndroidUpdateInfo =
  | AndroidAvailableUpdate
  | (AndroidUpdateInfoBase & { status: 'upToDate' | 'inProgress' | 'unknown' });

export interface IOSListing {
  appStoreId: number;
  appStoreUrl: string;
  latestVersion: string;
  releaseNotes?: string;
  releaseDate?: string;
  minimumOsVersion?: string;
}

interface IOSUpdateInfoBase {
  platform: 'ios';
  installedVersion: string;
  country: string;
}

export type IOSAvailableUpdate = IOSUpdateInfoBase & IOSListing & { status: 'available' };

export type IOSUpdateInfo =
  | IOSAvailableUpdate
  | (IOSUpdateInfoBase & IOSListing & { status: 'upToDate' | 'incompatible' })
  | (IOSUpdateInfoBase & { status: 'listingUnavailable' });

export interface UnsupportedUpdateInfo {
  platform: 'android' | 'ios' | 'web' | 'windows' | 'macos';
  status: 'unsupported';
}

export type UpdateInfo = AndroidUpdateInfo | IOSUpdateInfo | UnsupportedUpdateInfo;
export type PolicyUpdateInfo = AndroidAvailableUpdate | IOSAvailableUpdate;

export type StartUpdateOptions =
  | ({ platform: 'android'; mode: AndroidUpdateMode } & AndroidCheckOptions)
  | {
      platform: 'ios';
      update: IOSAvailableUpdate;
      mode?: IOSUpdateMode;
      fallbackToAppStore?: boolean;
    };

export type StartUpdateResult =
  | { status: 'started' | 'unavailable' | 'busy' | 'unsupported' }
  | { status: 'opened'; mode: IOSUpdateMode };

export type CompleteUpdateResult = {
  status: 'requested' | 'unavailable' | 'busy' | 'unsupported';
};

export interface AndroidFlowResult {
  mode: AndroidUpdateMode;
  status: 'accepted' | 'canceled' | 'failed' | 'interrupted';
  resultCode?: number;
}

export type UpdateErrorCode =
  | 'ERR_UPDATE_OPTIONS'
  | 'ERR_UPDATE_CHECK'
  | 'ERR_UPDATE_LOOKUP'
  | 'ERR_UPDATE_TIMEOUT'
  | 'ERR_UPDATE_ACTIVITY'
  | 'ERR_UPDATE_LAUNCH'
  | 'ERR_UPDATE_INSTALL'
  | 'ERR_UPDATE_FAILED';

export class AppUpdateError extends Error {
  constructor(
    public readonly code: UpdateErrorCode,
    message: string,
    cause?: unknown
  ) {
    super(message, { cause });
    this.name = 'AppUpdateError';
  }
}

export interface UpdateSubscription {
  remove(): void;
}

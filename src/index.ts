import * as updates from './updates';

export {
  type AppUpdateCopy,
  AppUpdateGate,
  type AppUpdateGateProps,
  type AppUpdateGateRef,
  type AppUpdateTheme,
} from './AppUpdateGate';
export * from './ExpoAppUpdatesAndroidIos.types';
export type { UpdateDecision, UpdatePolicy } from './updateGatePolicy';

export {
  addInstallStateListener,
  addStoreKitDismissListener,
  addUpdateFlowResultListener,
  checkForUpdateAsync,
  completeFlexibleUpdateAsync,
  resumeImmediateUpdateAsync,
  startUpdateAsync,
} from './updates';

export default updates;

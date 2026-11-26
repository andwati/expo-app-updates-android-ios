import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import {
  AppUpdateError,
  type CheckOptions,
  type InstallState,
  type IOSUpdateMode,
  type StartUpdateOptions,
  type UpdateInfo,
} from './ExpoAppUpdatesAndroidIos.types';
import { asUpdateError } from './updateErrors';
import {
  selectUpdateOffer,
  shouldCheckOnForeground,
  type UpdateOffer,
  type UpdatePolicy,
} from './updateGatePolicy';
import {
  addInstallStateListener,
  addStoreKitDismissListener,
  addUpdateFlowResultListener,
  checkForUpdateAsync,
  completeFlexibleUpdateAsync,
  resumeImmediateUpdateAsync,
  startUpdateAsync,
} from './updates';

export interface UpdateGateOptions {
  checkOptions?: CheckOptions;
  policy?: UpdatePolicy;
  checkOnMount?: boolean;
  checkOnForeground?: boolean;
  foregroundCooldownMs?: number;
  iosMode?: IOSUpdateMode;
  iosFallbackToAppStore?: boolean;
  onError?: (error: AppUpdateError) => void;
}

interface GateSession {
  latestInfo?: UpdateInfo;
  deferred: Set<string>;
  lastCheck?: number;
  check: { offerUpdates: boolean; promise: Promise<UpdateInfo | undefined> } | undefined;
  installRevision: number;
  playFlow: boolean;
  resumeAfterCancel: boolean;
  returningFromAppStore: boolean;
  performingAction: boolean;
}

interface UpdateGateState {
  offer: UpdateOffer | null;
  install: InstallState;
  error: AppUpdateError | null;
  busy: boolean;
  check: (offerUpdates?: boolean) => Promise<UpdateInfo | undefined>;
  update: (iosModeOverride?: IOSUpdateMode) => void;
  complete: () => void;
  defer: () => void;
  restartDeferred: boolean;
  setRestartDeferred: (deferred: boolean) => void;
}

export function useAppUpdateGate(options: UpdateGateOptions): UpdateGateState {
  const [offer, setOffer] = useState<UpdateOffer | null>(null);
  const [install, setInstall] = useState<InstallState>({ status: 'unknown' });
  const [error, setError] = useState<AppUpdateError | null>(null);
  const [busy, setBusy] = useState(false);
  const [restartDeferred, setRestartDeferred] = useState(false);
  const session = useRef<GateSession | null>(null);
  const latestOptions = useRef(options);

  useEffect(() => {
    latestOptions.current = options;
  }, [options]);

  const reportError = useCallback((failure: unknown) => {
    const updateError = asUpdateError(failure, 'ERR_UPDATE_FAILED');
    setError(updateError);
    latestOptions.current.onError?.(updateError);
  }, []);

  const check = useCallback(
    (offerUpdates = true): Promise<UpdateInfo | undefined> => {
      const run = session.current;
      if (!run) {
        return Promise.resolve(undefined);
      }
      if (run.check) {
        run.check.offerUpdates ||= offerUpdates;
        return run.check.promise;
      }

      const request = { offerUpdates, promise: Promise.resolve<UpdateInfo | undefined>(undefined) };
      const revision = run.installRevision;
      const checkOptions = latestOptions.current.checkOptions;
      request.promise = Promise.resolve().then(async () => {
        try {
          if (session.current !== run) {
            return undefined;
          }
          const info = await checkForUpdateAsync(checkOptions);
          if (session.current !== run) {
            return undefined;
          }
          run.latestInfo = info;

          if (info.platform === 'android' && info.status !== 'unsupported') {
            if (revision === run.installRevision) {
              setInstall(info.installState);
              if (info.installState.status === 'downloaded') {
                setRestartDeferred(false);
              }
            }
            if (
              info.immediateUpdateInProgress &&
              !run.playFlow &&
              !run.resumeAfterCancel &&
              info.installState.status !== 'downloaded'
            ) {
              run.playFlow = true;
              try {
                const result = await resumeImmediateUpdateAsync(checkOptions?.android);
                if (result.status !== 'started') {
                  run.playFlow = false;
                }
              } catch (failure) {
                run.playFlow = false;
                throw failure;
              }
              return info;
            }
            if (
              ['pending', 'downloading', 'downloaded', 'installing'].includes(
                info.installState.status
              )
            ) {
              return info;
            }
          }

          if (info.status === 'available' && request.offerUpdates) {
            setOffer(selectUpdateOffer(info, latestOptions.current.policy, run.deferred));
            setError(null);
          } else if (info.status === 'available' && info.platform === 'android') {
            setOffer((current) =>
              current?.androidMode &&
              current.info.platform === 'android' &&
              current.info.availableVersionCode === info.availableVersionCode &&
              info.allowedModes.includes(current.androidMode)
                ? current
                : null
            );
          } else if (info.status !== 'inProgress' && info.status !== 'unknown') {
            setOffer(null);
            setError(null);
          }
          return info;
        } catch (failure) {
          if (session.current === run) {
            reportError(failure);
          }
          return undefined;
        } finally {
          if (request.offerUpdates) {
            run.lastCheck = Date.now();
          }
          if (run.check === request) {
            run.check = undefined;
          }
        }
      });
      run.check = request;
      return request.promise;
    },
    [reportError]
  );

  useEffect(() => {
    const run: GateSession = {
      deferred: new Set(),
      check: undefined,
      installRevision: 0,
      playFlow: false,
      resumeAfterCancel: false,
      returningFromAppStore: false,
      performingAction: false,
    };
    session.current = run;
    const installSubscription = addInstallStateListener((state) => {
      run.installRevision += 1;
      setInstall(state);
      setRestartDeferred(false);
      if (state.status === 'failed') {
        reportError(
          new AppUpdateError(
            'ERR_UPDATE_INSTALL',
            'Google Play could not download or install the update.',
            state.errorCode
          )
        );
      }
    });
    const flowSubscription = addUpdateFlowResultListener((result) => {
      run.playFlow = false;
      run.resumeAfterCancel =
        result.mode === 'immediate' && (result.status === 'canceled' || result.status === 'failed');
      if (result.status === 'failed') {
        reportError(
          new AppUpdateError(
            'ERR_UPDATE_LAUNCH',
            'Google Play could not continue the update.',
            result.resultCode
          )
        );
      }
      if (result.mode === 'flexible' && result.status === 'accepted') {
        run.installRevision += 1;
        setInstall((current) =>
          current.status === 'unknown' ||
          current.status === 'canceled' ||
          current.status === 'failed'
            ? { status: 'pending' }
            : current
        );
      }
    });
    const sheetSubscription = addStoreKitDismissListener(() => {
      void check();
    });

    let appState = AppState.currentState;
    let firstActive = appState == null || appState === 'active';
    const lifecycleSubscription = AppState.addEventListener('change', (next) => {
      const becameActive = next === 'active' && appState !== 'active';
      appState = next;
      if (!becameActive) {
        return;
      }
      const current = latestOptions.current;
      const shouldOffer =
        run.returningFromAppStore ||
        (!firstActive && (current.checkOnMount ?? true)) ||
        shouldCheckOnForeground(
          current.checkOnForeground ?? true,
          run.lastCheck,
          Date.now(),
          current.foregroundCooldownMs ?? 15 * 60_000
        );
      firstActive = true;
      run.returningFromAppStore = false;
      if (shouldOffer || Platform.OS === 'android') {
        void check(shouldOffer);
      }
    });

    if (firstActive) {
      const shouldOffer = latestOptions.current.checkOnMount ?? true;
      if (shouldOffer || Platform.OS === 'android') {
        void check(shouldOffer);
      }
    }

    return () => {
      installSubscription.remove();
      flowSubscription.remove();
      sheetSubscription.remove();
      lifecycleSubscription.remove();
      if (session.current === run) {
        session.current = null;
      }
    };
  }, [check, reportError]);

  async function perform(action: (run: GateSession) => Promise<void>) {
    const run = session.current;
    if (!run || run.performingAction || run.playFlow) {
      return;
    }
    run.performingAction = true;
    setBusy(true);
    setError(null);
    try {
      await action(run);
    } catch (failure) {
      if (session.current === run) {
        reportError(failure);
      }
    } finally {
      run.performingAction = false;
      if (session.current === run) {
        setBusy(false);
      }
    }
  }

  function update(iosModeOverride?: IOSUpdateMode) {
    if (!offer) {
      return;
    }
    const { info, androidMode } = offer;
    void perform(async (run) => {
      const current = latestOptions.current;
      if (info.platform === 'ios') {
        const mode = iosModeOverride ?? current.iosMode ?? 'appStore';
        run.returningFromAppStore = mode === 'appStore' || (current.iosFallbackToAppStore ?? true);
        let result: Awaited<ReturnType<typeof startUpdateAsync>> | undefined;
        try {
          result = await startUpdateAsync({
            platform: 'ios',
            update: info,
            mode,
            fallbackToAppStore: current.iosFallbackToAppStore ?? true,
          });
        } finally {
          if (result?.status !== 'opened' || result.mode !== 'appStore') {
            run.returningFromAppStore = false;
          }
        }
        if (result.status === 'unsupported' || result.status === 'unavailable') {
          await check();
        }
      } else if (androidMode) {
        const options: StartUpdateOptions = {
          platform: 'android',
          mode: androidMode,
          allowAssetPackDeletion: current.checkOptions?.android?.allowAssetPackDeletion ?? false,
        };
        run.playFlow = true;
        run.resumeAfterCancel = false;
        let result: Awaited<ReturnType<typeof startUpdateAsync>> | undefined;
        try {
          const latest = run.latestInfo;
          const shouldResume =
            latest?.platform === 'android' &&
            latest.status === 'inProgress' &&
            latest.immediateUpdateInProgress &&
            latest.installState.status !== 'downloaded';
          result = shouldResume
            ? await resumeImmediateUpdateAsync(options)
            : await startUpdateAsync(options);
        } finally {
          if (result?.status !== 'started') {
            run.playFlow = false;
          }
        }
        if (result.status === 'unsupported' || result.status === 'unavailable') {
          await check();
        }
      }
    });
  }

  function complete() {
    void perform(async (run) => {
      const revision = run.installRevision;
      const result = await completeFlexibleUpdateAsync();
      if (
        result.status === 'requested' &&
        session.current === run &&
        run.installRevision === revision
      ) {
        setInstall({ status: 'installing' });
      }
      if (result.status === 'unavailable' || result.status === 'unsupported') {
        await check();
      }
    });
  }

  function defer() {
    if (!offer || offer.required) {
      return;
    }
    session.current?.deferred.add(offer.key);
    setOffer(null);
  }

  return {
    offer,
    install,
    error,
    busy,
    check,
    update,
    complete,
    defer,
    restartDeferred,
    setRestartDeferred,
  };
}

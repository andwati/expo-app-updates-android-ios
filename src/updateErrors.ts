import { AppUpdateError, type UpdateErrorCode } from './ExpoAppUpdatesAndroidIos.types';

const errorCodes: ReadonlySet<string> = new Set<UpdateErrorCode>([
  'ERR_UPDATE_OPTIONS',
  'ERR_UPDATE_CHECK',
  'ERR_UPDATE_LOOKUP',
  'ERR_UPDATE_TIMEOUT',
  'ERR_UPDATE_ACTIVITY',
  'ERR_UPDATE_LAUNCH',
  'ERR_UPDATE_INSTALL',
  'ERR_UPDATE_FAILED',
]);

export function asUpdateError(error: unknown, fallback: UpdateErrorCode): AppUpdateError {
  if (error instanceof AppUpdateError) {
    return error;
  }
  const nativeCode = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  const code =
    typeof nativeCode === 'string' && errorCodes.has(nativeCode)
      ? (nativeCode as UpdateErrorCode)
      : fallback;
  const message = error instanceof Error ? error.message : 'The update operation failed.';
  return new AppUpdateError(code, message, error);
}

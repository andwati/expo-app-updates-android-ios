package com.andwati.appupdatesandroid

import android.app.Activity
import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.pm.PackageInfoCompat
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallException
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.ActivityResult
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallErrorCode
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import java.util.UUID

internal typealias PlayCompletion = (Result<Map<String, Any>>) -> Unit

internal class PlayUpdateException(val code: String, message: String, cause: Throwable?) : Exception(message, cause)

internal enum class PlayUpdateMode(val value: String, val type: Int) {
  FLEXIBLE("flexible", AppUpdateType.FLEXIBLE),
  IMMEDIATE("immediate", AppUpdateType.IMMEDIATE)
}

internal class PlayUpdateClient(
  private val applicationContext: () -> Context?,
  private val currentActivity: () -> Activity?,
  private val onInstallState: (Map<String, Any>) -> Unit,
  private val onFlowResult: (Map<String, Any>) -> Unit
) {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var manager: AppUpdateManager? = null
  private var observingInstallState = false
  private var listenerRegistered = false
  private var pendingFlow: PendingFlow? = null
  private var completing = false

  private val installListener = InstallStateUpdatedListener { state ->
    val payload = mutableMapOf<String, Any>("status" to statusName(state.installStatus()))
    if (state.installStatus() == InstallStatus.DOWNLOADING) {
      payload["bytesDownloaded"] = state.bytesDownloaded().toDouble()
      payload["totalBytesToDownload"] = state.totalBytesToDownload().toDouble()
    }
    if (state.installStatus() == InstallStatus.FAILED) {
      payload["errorCode"] = state.installErrorCode()
    }
    onInstallState(payload)
  }

  fun observeInstallState(observing: Boolean) {
    mainHandler.post {
      observingInstallState = observing
      updateInstallListener()
    }
  }

  fun onActivityDestroyed() {
    val flow = pendingFlow
    clearPendingFlow()
    if (flow?.launcher != null) {
      onFlowResult(mapOf("mode" to flow.mode.value, "status" to "interrupted"))
    }
  }

  fun dispose() {
    mainHandler.post {
      observingInstallState = false
      updateInstallListener()
      manager = null
      clearPendingFlow()
    }
  }

  fun check(allowDeletion: Boolean, callback: PlayCompletion) {
    val context = applicationContext()
    if (context == null) {
      callback.reject("ERR_UPDATE_CHECK", "Android application context is unavailable.", null)
    } else {
      withUpdateInfo(callback, "ERR_UPDATE_CHECK", unsupportedCheck = true) { _, info ->
        callback.resolve(snapshot(context, info, allowDeletion))
      }
    }
  }

  fun start(mode: PlayUpdateMode, allowDeletion: Boolean, callback: PlayCompletion) {
    startFlow(mode, allowDeletion, resume = false, callback)
  }

  fun resume(allowDeletion: Boolean, callback: PlayCompletion) {
    startFlow(PlayUpdateMode.IMMEDIATE, allowDeletion, resume = true, callback)
  }

  private fun withUpdateInfo(
    callback: PlayCompletion,
    errorCode: String,
    unsupportedCheck: Boolean = false,
    onFailure: () -> Unit = {},
    onSuccess: (AppUpdateManager, AppUpdateInfo) -> Unit
  ) {
    fun reject(error: Exception) {
      onFailure()
      if (isUnsupported(error)) {
        val result = if (unsupportedCheck) {
          mapOf("status" to "unsupported", "platform" to "android")
        } else {
          outcome("unsupported")
        }
        callback.resolve(result)
      } else {
        callback.reject(errorCode, error.message ?: "Google Play could not check the update.", error)
      }
    }

    try {
      val play = manager ?: AppUpdateManagerFactory.create(
        checkNotNull(applicationContext())
      ).also { manager = it }
      updateInstallListener()
      play.appUpdateInfo
        .addOnSuccessListener { info ->
          try {
            onSuccess(play, info)
          } catch (error: Exception) {
            reject(error)
          }
        }
        .addOnFailureListener { reject(it) }
        .addOnCanceledListener { reject(IllegalStateException("Google Play canceled the update request.")) }
    } catch (error: Exception) {
      reject(error)
    }
  }

  private fun startFlow(
    mode: PlayUpdateMode,
    allowDeletion: Boolean,
    resume: Boolean,
    callback: PlayCompletion
  ) {
    if (pendingFlow != null || completing) {
      callback.resolve(outcome("busy"))
      return
    }
    val activity = activeActivity()
    if (activity == null) {
      callback.reject("ERR_UPDATE_ACTIVITY", "An active Android activity is needed to show Google Play.", null)
      return
    }

    val flow = PendingFlow(activity, mode)
    pendingFlow = flow
    fun clearFlow() {
      if (pendingFlow === flow) clearPendingFlow()
    }

    withUpdateInfo(callback, "ERR_UPDATE_LAUNCH", onFailure = ::clearFlow) { play, info ->
      val expectedAvailability = if (resume) {
        UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
      } else {
        UpdateAvailability.UPDATE_AVAILABLE
      }
      val options = allowedOptions(info, mode.type, allowDeletion)
      if (pendingFlow !== flow || activeActivity() !== flow.activity) {
        clearFlow()
        callback.reject("ERR_UPDATE_ACTIVITY", "The Android activity changed before the update could start.", null)
      } else if (info.updateAvailability() != expectedAvailability || options == null ||
        (!resume && info.installStatus() in activeInstallStatuses)
      ) {
        clearFlow()
        callback.resolve(outcome("unavailable"))
      } else {
        val launcher = activity.activityResultRegistry.register(
          "expo-app-updates:play-update:${UUID.randomUUID()}",
          ActivityResultContracts.StartIntentSenderForResult()
        ) { result ->
          if (pendingFlow === flow && flow.launcher != null) {
            clearPendingFlow()
            val status = when (result.resultCode) {
              Activity.RESULT_OK -> "accepted"
              Activity.RESULT_CANCELED -> "canceled"
              ActivityResult.RESULT_IN_APP_UPDATE_FAILED -> "failed"
              else -> "failed"
            }
            onFlowResult(mapOf("mode" to flow.mode.value, "status" to status, "resultCode" to result.resultCode))
          }
        }
        flow.launcher = launcher

        if (play.startUpdateFlowForResult(info, launcher, options)) {
          callback.resolve(outcome("started"))
        } else {
          clearFlow()
          callback.reject("ERR_UPDATE_LAUNCH", "Google Play did not start the update flow.", null)
        }
      }
    }
  }

  fun complete(callback: PlayCompletion) {
    if (completing || pendingFlow != null) {
      callback.resolve(outcome("busy"))
      return
    }
    completing = true
    withUpdateInfo(callback, "ERR_UPDATE_INSTALL", onFailure = { completing = false }) { play, info ->
      if (info.installStatus() != InstallStatus.DOWNLOADED) {
        completing = false
        callback.resolve(outcome("unavailable"))
      } else {
        play.completeUpdate()
          .addOnSuccessListener {
            completing = false
            callback.resolve(outcome("requested"))
          }
          .addOnFailureListener {
            completing = false
            callback.reject("ERR_UPDATE_INSTALL", it.message, it)
          }
          .addOnCanceledListener {
            completing = false
            callback.reject("ERR_UPDATE_INSTALL", "Google Play canceled the installation request.", null)
          }
      }
    }
  }

  private fun updateInstallListener() {
    val play = manager ?: return
    if (observingInstallState == listenerRegistered) return
    if (observingInstallState) play.registerListener(installListener)
    else play.unregisterListener(installListener)
    listenerRegistered = observingInstallState
  }

  private fun activeActivity(): ComponentActivity? =
    (currentActivity() as? ComponentActivity)?.takeUnless { it.isFinishing || it.isDestroyed }

  private fun clearPendingFlow() {
    val flow = pendingFlow
    pendingFlow = null
    flow?.launcher?.unregister()
  }

  @Suppress("DEPRECATION")
  private fun snapshot(context: Context, info: AppUpdateInfo, allowDeletion: Boolean): Map<String, Any> {
    val installed = context.packageManager.getPackageInfo(context.packageName, 0)
    val availability = info.updateAvailability()
    val installStatus = info.installStatus()
    val inProgress = availability == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
    val available = availability == UpdateAvailability.UPDATE_AVAILABLE || inProgress
    val allowedModes = buildList {
      for (mode in PlayUpdateMode.entries) {
        if (allowedOptions(info, mode.type, allowDeletion) != null) add(mode.value)
      }
    }
    val installState = mutableMapOf<String, Any>("status" to statusName(installStatus))
    if (installStatus == InstallStatus.DOWNLOADING) {
      installState["bytesDownloaded"] = info.bytesDownloaded().toDouble()
      installState["totalBytesToDownload"] = info.totalBytesToDownload().toDouble()
    }

    return buildMap {
      put("platform", "android")
      put("installedVersion", installed.versionName.orEmpty())
      put("installedVersionCode", PackageInfoCompat.getLongVersionCode(installed).toDouble())
      put("allowedModes", allowedModes)
      put("immediateUpdateInProgress", inProgress)
      put("installState", installState)
      put("status", when (availability) {
        UpdateAvailability.UPDATE_AVAILABLE -> "available"
        UpdateAvailability.UPDATE_NOT_AVAILABLE -> "upToDate"
        UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS -> "inProgress"
        else -> "unknown"
      })
      if (available) {
        put("availableVersionCode", info.availableVersionCode())
        put("priority", info.updatePriority())
        info.clientVersionStalenessDays()?.let { put("stalenessDays", it) }
      }
    }
  }

  private fun allowedOptions(info: AppUpdateInfo, type: Int, allowDeletion: Boolean): AppUpdateOptions? {
    val defaults = AppUpdateOptions.defaultOptions(type)
    if (info.isUpdateTypeAllowed(defaults)) return defaults
    if (!allowDeletion) return null
    val withDeletion = AppUpdateOptions.newBuilder(type).setAllowAssetPackDeletion(true).build()
    return withDeletion.takeIf { info.isUpdateTypeAllowed(it) }
  }

  private fun isUnsupported(error: Exception): Boolean =
    error is InstallException && error.errorCode in setOf(
      InstallErrorCode.ERROR_API_NOT_AVAILABLE,
      InstallErrorCode.ERROR_PLAY_STORE_NOT_FOUND,
      InstallErrorCode.ERROR_APP_NOT_OWNED
    )

  private fun statusName(status: Int): String = when (status) {
    InstallStatus.PENDING -> "pending"
    InstallStatus.DOWNLOADING -> "downloading"
    InstallStatus.DOWNLOADED -> "downloaded"
    InstallStatus.INSTALLING -> "installing"
    InstallStatus.INSTALLED -> "installed"
    InstallStatus.FAILED -> "failed"
    InstallStatus.CANCELED -> "canceled"
    else -> "unknown"
  }

  private fun outcome(status: String) = mapOf("status" to status)

  private class PendingFlow(val activity: ComponentActivity, val mode: PlayUpdateMode) {
    var launcher: ActivityResultLauncher<IntentSenderRequest>? = null
  }

  private companion object {
    val activeInstallStatuses = setOf(
      InstallStatus.PENDING, InstallStatus.DOWNLOADING, InstallStatus.DOWNLOADED, InstallStatus.INSTALLING
    )
  }
}

private fun PlayCompletion.resolve(value: Map<String, Any>) = invoke(Result.success(value))

private fun PlayCompletion.reject(code: String, message: String?, cause: Throwable?) {
  invoke(Result.failure(PlayUpdateException(code, message ?: "Google Play update failed.", cause)))
}

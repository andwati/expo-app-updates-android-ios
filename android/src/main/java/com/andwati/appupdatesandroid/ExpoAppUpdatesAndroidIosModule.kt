package com.andwati.appupdatesandroid

import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.types.Enumerable

private const val INSTALL_EVENT = "onInstallStateChanged"
private const val FLOW_EVENT = "onUpdateFlowResult"

internal enum class AndroidUpdateMode(val value: String, val playMode: PlayUpdateMode) : Enumerable {
  FLEXIBLE(PlayUpdateMode.FLEXIBLE.value, PlayUpdateMode.FLEXIBLE),
  IMMEDIATE(PlayUpdateMode.IMMEDIATE.value, PlayUpdateMode.IMMEDIATE)
}

internal class AndroidStartOptions(
  @Field val mode: AndroidUpdateMode,
  @Field val allowAssetPackDeletion: Boolean = false
) : Record

class ExpoAppUpdatesAndroidIosModule : Module() {
  private val play by lazy {
    PlayUpdateClient(
      applicationContext = { appContext.reactContext?.applicationContext },
      currentActivity = { appContext.currentActivity },
      onInstallState = { sendEvent(INSTALL_EVENT, it) },
      onFlowResult = { sendEvent(FLOW_EVENT, it) }
    )
  }

  override fun definition() = ModuleDefinition {
    Name("ExpoAppUpdatesAndroidIos")
    Events(INSTALL_EVENT, FLOW_EVENT)

    OnStartObserving(INSTALL_EVENT) { play.observeInstallState(true) }
    OnStopObserving(INSTALL_EVENT) { play.observeInstallState(false) }
    OnActivityDestroys { play.onActivityDestroyed() }
    OnDestroy { play.dispose() }

    AsyncFunction("checkAndroidAsync") { allowAssetPackDeletion: Boolean, promise: Promise ->
      play.check(allowAssetPackDeletion, promise.playCompletion())
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("startAndroidAsync") { options: AndroidStartOptions, promise: Promise ->
      play.start(options.mode.playMode, options.allowAssetPackDeletion, promise.playCompletion())
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("resumeAndroidAsync") { allowAssetPackDeletion: Boolean, promise: Promise ->
      play.resume(allowAssetPackDeletion, promise.playCompletion())
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("completeAndroidAsync") { promise: Promise ->
      play.complete(promise.playCompletion())
    }.runOnQueue(Queues.MAIN)
  }

  private fun Promise.playCompletion(): PlayCompletion = { result ->
    result.fold(
      onSuccess = { resolve(it) },
      onFailure = { error ->
        if (error is PlayUpdateException) {
          reject(error.code, error.message, error.cause)
        } else {
          reject("ERR_UPDATE_FAILED", error.message, error)
        }
      }
    )
  }
}

package com.mnelo.vault

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.exception.Exceptions
import java.io.File
import java.io.IOException

class MneloVaultModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MneloVault")
    AsyncFunction("directory") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val directory = File(context.noBackupFilesDir, "mnelo-private")
      if (!directory.isDirectory && !directory.mkdirs()) throw IOException("VAULT_DIRECTORY_UNAVAILABLE")
      directory.toURI().toString()
    }
  }
}

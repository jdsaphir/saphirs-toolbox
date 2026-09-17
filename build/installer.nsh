# Custom NSIS hook. electron-builder inserts customCheckAppRunning in place of
# its own app-running check: in the install section just before the previously
# installed version is removed, and in the uninstaller's un.checkAppRunning.

!macro customCheckAppRunning
  # Every AI client connected to the toolbox keeps an MCP bridge process alive,
  # and that bridge is this same executable run as plain Node, launched from the
  # install folder. The client owns it, so it outlives the app: quitting the
  # toolbox leaves it running and Windows keeps the old files locked. The
  # uninstall step of an update then fails with "Failed to uninstall old
  # application files".
  #
  # electron-builder's own check can't catch it — it does nothing when the
  # installer was launched by the app, which is exactly what an auto-update is —
  # so close them here. Ask first, force second. The client starts a fresh
  # bridge the next time it calls the toolbox.
  DetailPrint "Closing ${PRODUCT_NAME} and any MCP bridge it left behind..."
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /im "${APP_EXECUTABLE_FILENAME}" /fi "USERNAME eq %USERNAME%"`
  Sleep 1000
  nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /f /im "${APP_EXECUTABLE_FILENAME}" /fi "USERNAME eq %USERNAME%"`
  # Give Windows a moment to release the file handles before the old version is
  # uninstalled.
  Sleep 500
!macroend

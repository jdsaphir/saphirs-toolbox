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
  # so close them here. The client starts a fresh bridge the next time it calls
  # the toolbox.
  DetailPrint "Closing ${PRODUCT_NAME} and any MCP bridge it left behind..."

  # Match on the executable path, not the image name: a portable copy unpacks to
  # its own folder and a second install lives in another one, but both run an
  # executable of this same name, and closing those would take unrelated work
  # with it. $INSTDIR travels through the environment, so no amount of spaces or
  # quotes in the install path needs escaping here.
  Push $0
  System::Call 'kernel32::SetEnvironmentVariable(t "TOOLBOX_INSTDIR", t "$INSTDIR")'
  nsExec::Exec `powershell.exe -NoProfile -NonInteractive -Command "$$dir = $$env:TOOLBOX_INSTDIR.TrimEnd('\') + '\'; Get-CimInstance Win32_Process | Where-Object { $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith($$dir, [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"`
  Pop $0
  ${If} $0 != 0
    # No PowerShell to run the scoped query: fall back to the image name. It is
    # broader than we would like, but better than leaving the files locked and
    # the update failing.
    nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /f /im "${APP_EXECUTABLE_FILENAME}" /fi "USERNAME eq %USERNAME%"`
  ${EndIf}
  Pop $0

  # Give Windows a moment to release the file handles before the old version is
  # uninstalled.
  Sleep 500
!macroend

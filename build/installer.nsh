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
  # with it.
  #
  # Skip our own process. This macro also runs inside the uninstaller, and
  # uninstallOldVersion falls back to running it in place out of $INSTDIR when
  # the copy it makes in $PLUGINSDIR can't be started — there, an unguarded
  # sweep of $INSTDIR would kill the very uninstaller doing the work.
  #
  # Closing them once is not enough (seen updating 1.5.2 → 1.6.0): an AI client
  # can start a fresh bridge the moment its old one dies, and a process that was
  # just killed can keep its executable locked for a while as Windows tears it
  # down. Either one makes the uninstall step fail. So keep closing whatever
  # runs from $INSTDIR until two checks in a row find nothing running there and
  # the app's executable can be opened exclusively, for up to 10 seconds. After
  # that, carry on and let the uninstall step try anyway.
  #
  # $INSTDIR, the executable's name and the pid travel through the environment,
  # so no amount of spaces or quotes in them needs escaping here.
  Push $0
  Push $1
  System::Call 'kernel32::GetCurrentProcessId()i.r1'
  System::Call 'kernel32::SetEnvironmentVariable(t "TOOLBOX_INSTDIR", t "$INSTDIR")'
  System::Call 'kernel32::SetEnvironmentVariable(t "TOOLBOX_EXE", t "${APP_EXECUTABLE_FILENAME}")'
  System::Call 'kernel32::SetEnvironmentVariable(t "TOOLBOX_KEEP_PID", t "$1")'
  nsExec::Exec `powershell.exe -NoProfile -NonInteractive -Command "$$dir = $$env:TOOLBOX_INSTDIR.TrimEnd('\') + '\'; $$keep = [int]$$env:TOOLBOX_KEEP_PID; $$exe = $$dir + $$env:TOOLBOX_EXE; $$quiet = 0; $$deadline = (Get-Date).AddSeconds(10); while ((Get-Date) -lt $$deadline) { $$procs = @(Get-CimInstance Win32_Process | Where-Object { $$_.ProcessId -ne $$keep -and $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith($$dir, [System.StringComparison]::OrdinalIgnoreCase) }); foreach ($$p in $$procs) { Stop-Process -Id $$p.ProcessId -Force -ErrorAction SilentlyContinue }; $$free = $$true; if (Test-Path -LiteralPath $$exe) { try { [System.IO.File]::Open($$exe, 'Open', 'ReadWrite', 'None').Close() } catch { $$free = $$false } }; if ($$procs.Count -eq 0 -and $$free) { $$quiet++; if ($$quiet -ge 2) { break } } else { $$quiet = 0 }; Start-Sleep -Milliseconds 250 }"`
  Pop $0
  ${If} $0 != 0
    # No PowerShell to run the scoped query: fall back to the image name. It is
    # broader than we would like, but better than leaving the files locked and
    # the update failing.
    nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /f /im "${APP_EXECUTABLE_FILENAME}" /fi "USERNAME eq %USERNAME%" /fi "PID ne $1"`
    Pop $0
    # Give Windows a moment to release the file handles before the old version
    # is uninstalled.
    Sleep 1500
  ${EndIf}
  Pop $1
  Pop $0
!macroend

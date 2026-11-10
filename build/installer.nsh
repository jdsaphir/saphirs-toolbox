# Custom NSIS hook. electron-builder inserts customCheckAppRunning in place of
# its own app-running check: in the install section just before the previously
# installed version is removed, and in the uninstaller's un.checkAppRunning.

# One sweep of the install folder, run by PowerShell. Until two checks in a row
# find nothing running from $INSTDIR and the app's executable opens
# exclusively, or TOOLBOX_SECONDS run out, it keeps closing:
#   - MCP bridges, always (see below);
#   - everything else running from $INSTDIR, only when TOOLBOX_KILL is 1.
# Exits 0 once the folder is free, 1 when time ran out. nsExec pushes "error"
# instead when PowerShell can't be started at all.
#
# Match on the executable path, not the image name: a portable copy unpacks to
# its own folder and a second install lives in another one, but both run an
# executable of this same name, and closing those would take unrelated work
# with it. Skip our own process (TOOLBOX_KEEP_PID): this also runs inside the
# uninstaller, which uninstallOldVersion can fall back to running in place out
# of $INSTDIR.
#
# Everything travels through the environment, so no amount of spaces or quotes
# in the install path or the executable's name needs escaping here.
!macro toolboxSweep
  nsExec::Exec `powershell.exe -NoProfile -NonInteractive -Command "$$dir = $$env:TOOLBOX_INSTDIR.TrimEnd('\') + '\'; $$keep = [int]$$env:TOOLBOX_KEEP_PID; $$exe = $$dir + $$env:TOOLBOX_EXE; $$kill = $$env:TOOLBOX_KILL -eq '1'; $$quiet = 0; $$deadline = (Get-Date).AddSeconds([int]$$env:TOOLBOX_SECONDS); while ((Get-Date) -lt $$deadline) { $$procs = @(Get-CimInstance Win32_Process | Where-Object { $$_.ProcessId -ne $$keep -and $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith($$dir, [System.StringComparison]::OrdinalIgnoreCase) }); foreach ($$p in $$procs) { if ($$kill -or ($$p.CommandLine -and $$p.CommandLine.Contains('mcp-stdio'))) { Stop-Process -Id $$p.ProcessId -Force -ErrorAction SilentlyContinue } }; $$free = $$true; if (Test-Path -LiteralPath $$exe) { try { [System.IO.File]::Open($$exe, 'Open', 'ReadWrite', 'None').Close() } catch { $$free = $$false } }; if ($$procs.Count -eq 0 -and $$free) { $$quiet++; if ($$quiet -ge 2) { exit 0 } } else { $$quiet = 0 }; Start-Sleep -Milliseconds 500 }; exit 1"`
!macroend

!macro customCheckAppRunning
  # By the time this runs, the app is usually still closing: an update's
  # installer is started while the app quits. Two things can keep the old files
  # locked and make the uninstall step fail with "Failed to uninstall old
  # application files":
  #
  # - MCP bridges. Every AI client connected to the toolbox keeps one alive: it
  #   is this same executable run as plain Node from the install folder, owned
  #   by the client, so it outlives the app. Closing it is safe (the client
  #   starts a fresh one the next time it calls the toolbox), so bridges are
  #   closed right away, and again if a client restarts one.
  #
  # - The app's own processes. Do NOT kill these straight away. On a PC with an
  #   NVIDIA GPU (1.6.0 → 1.6.2), killing the GPU process while the app was
  #   still shutting down left it stuck half-closed for over 7 minutes, holding
  #   the executable, so no wait could help. Left alone, the same processes
  #   closed in 15–25 s. So give the app up to 90 s to close on its own, and
  #   only then force-close whatever is left, waiting up to 150 s more for it
  #   to go. On a typical PC the app is gone within a second or two and both
  #   phases end at once.
  #
  # electron-builder's own check can't help here: it does nothing when the
  # installer was launched by the app, which is exactly what an update is.
  Push $0
  Push $1
  System::Call 'kernel32::GetCurrentProcessId()i.r1'
  System::Call 'kernel32::SetEnvironmentVariable(t "TOOLBOX_INSTDIR", t "$INSTDIR")'
  System::Call 'kernel32::SetEnvironmentVariable(t "TOOLBOX_EXE", t "${APP_EXECUTABLE_FILENAME}")'
  System::Call 'kernel32::SetEnvironmentVariable(t "TOOLBOX_KEEP_PID", t "$1")'

  DetailPrint "Waiting for ${PRODUCT_NAME} to close (this can take a minute)..."
  System::Call 'kernel32::SetEnvironmentVariable(t "TOOLBOX_KILL", t "0")'
  System::Call 'kernel32::SetEnvironmentVariable(t "TOOLBOX_SECONDS", t "90")'
  !insertmacro toolboxSweep
  Pop $0

  ${If} $0 == 1
    DetailPrint "Closing what is left of ${PRODUCT_NAME}..."
    System::Call 'kernel32::SetEnvironmentVariable(t "TOOLBOX_KILL", t "1")'
    System::Call 'kernel32::SetEnvironmentVariable(t "TOOLBOX_SECONDS", t "150")'
    !insertmacro toolboxSweep
    Pop $0
  ${EndIf}

  ${If} $0 != 0
  ${AndIf} $0 != 1
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

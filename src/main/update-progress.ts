// The window shown while an update installs after the user quits.
//
// The installer itself runs silently: its own assisted UI would ask
// "install for me or everyone" and end on a Finish page, both of which need
// clicks. Instead the app starts this small window just before it quits. It
// follows the update from the outside (the app closing, the installer
// running, the new version landing), reopens the app when it is done (Restart
// to update) or just says it's done (Quit), and says so plainly when the
// update did not finish.
//
// It is a PowerShell/WinForms script written to the temp folder, not part of
// the app: anything running from the install folder would lock the very files
// the installer has to replace, and the installer closes everything running
// from there.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Kept free of "${" so it can live in a raw template literal.
const SCRIPT = String.raw`
param(
  [string]$Target = $env:TOOLBOX_UPDATE_TARGET,
  [string]$InstallDir = $env:TOOLBOX_UPDATE_INSTDIR,
  [string]$AppExe = $env:TOOLBOX_UPDATE_EXE,
  # Restart to update reopens the app afterwards; Quit leaves it closed.
  [string]$Restart = $env:TOOLBOX_UPDATE_RESTART
)
$reopen = $Restart -ne '0'
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$appName = "Saphir's Toolbox"
$dir = $InstallDir.TrimEnd('\') + '\'

$form = New-Object System.Windows.Forms.Form
$form.Text = "Updating $appName"
$form.ClientSize = New-Object System.Drawing.Size(440, 150)
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.MinimizeBox = $true
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$form.Font = New-Object System.Drawing.Font('Segoe UI', 9)
try { $form.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon($AppExe) } catch {}

$title = New-Object System.Windows.Forms.Label
$title.Text = "Updating $appName to version $Target"
$title.Font = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Bold)
$title.SetBounds(16, 14, 408, 24)
$form.Controls.Add($title)

$step = New-Object System.Windows.Forms.Label
$step.SetBounds(16, 44, 340, 20)
$form.Controls.Add($step)

$clock = New-Object System.Windows.Forms.Label
$clock.TextAlign = 'TopRight'
$clock.ForeColor = [System.Drawing.Color]::Gray
$clock.SetBounds(360, 44, 64, 20)
$form.Controls.Add($clock)

$bar = New-Object System.Windows.Forms.ProgressBar
$bar.SetBounds(16, 70, 408, 18)
$bar.Minimum = 0
$bar.Maximum = 3
$form.Controls.Add($bar)

$hint = New-Object System.Windows.Forms.Label
$hint.Text = if ($reopen) { "$appName will reopen by itself when the update is done." } else { "$appName will stay closed after the update." }
$hint.ForeColor = [System.Drawing.Color]::Gray
$hint.SetBounds(16, 96, 408, 20)
$form.Controls.Add($hint)

$open = New-Object System.Windows.Forms.Button
$open.Text = "Open $appName"
$open.SetBounds(196, 112, 140, 28)
$open.Visible = $false
$open.Add_Click({ Start-Process -FilePath $AppExe; $form.Close() })
$form.Controls.Add($open)

$close = New-Object System.Windows.Forms.Button
$close.Text = 'Close'
$close.SetBounds(344, 112, 80, 28)
$close.Visible = $false
$close.Add_Click({ $form.Close() })
$form.Controls.Add($close)

function Set-Step([int]$n, [string]$text) {
  $bar.Style = 'Continuous'
  $bar.Value = [Math]::Min($n, 3)
  $step.Text = "Step $n of 3: $text"
}

function Get-AppProcesses {
  @(Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath.StartsWith($dir, [System.StringComparison]::OrdinalIgnoreCase)
  })
}

# The app itself, reopened: its main process. MCP bridges run this same
# executable (as plain Node, with the bridge script) and Chromium helpers carry
# a --type= switch, so neither counts as the app being back.
function Get-AppMain {
  @(Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -and [string]::Equals($_.ExecutablePath, $AppExe, [System.StringComparison]::OrdinalIgnoreCase) -and
    $_.CommandLine -and -not $_.CommandLine.Contains('mcp-stdio') -and -not $_.CommandLine.Contains('--type=')
  })
}

function Get-Installer {
  @(Get-Process -Name 'SaphirsToolbox-*-setup' -ErrorAction SilentlyContinue)
}

function Test-Updated {
  try { (Get-Item -LiteralPath $AppExe).VersionInfo.ProductVersion -like "$Target*" } catch { $false }
}

$script:phase = 'closing'
$script:start = Get-Date
$script:seenInstaller = $false
$script:doneAt = $null

Set-Step 1 "Waiting for $appName to close..."

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 700
$timer.Add_Tick({
  $elapsed = (Get-Date) - $script:start
  if ($script:phase -notin 'failed', 'done') { $clock.Text = '{0}:{1:00}' -f [int][Math]::Floor($elapsed.TotalMinutes), $elapsed.Seconds }
  $installerRunning = @(Get-Installer).Count -gt 0
  if ($installerRunning) { $script:seenInstaller = $true }

  # Once the installer has come and gone (or never showed up), the update is
  # over, whichever step this window was showing.
  if ($script:phase -in 'closing', 'installing' -and -not $installerRunning -and
      ($script:seenInstaller -or $elapsed.TotalSeconds -gt 30)) {
    if ((Test-Updated) -and $reopen) {
      $script:phase = 'starting'
      $script:doneAt = Get-Date
      Set-Step 3 "Updated. Starting $appName..."
    } elseif (Test-Updated) {
      $script:phase = 'done'
      $script:doneAt = Get-Date
      Set-Step 3 "Done. $appName is up to date."
      $clock.Text = ''
    } else {
      $script:phase = 'failed'
    }
  }

  switch ($script:phase) {
    'closing' {
      if (@(Get-AppProcesses).Count -eq 0) {
        $script:phase = 'installing'
        Set-Step 2 'Installing the update...'
      } elseif ($elapsed.TotalSeconds -gt 90) {
        $step.Text = "Step 1 of 3: $appName is slow to close, still waiting..."
      }
    }
    'done' {
      # Nothing to reopen: leave the result up a moment, then go.
      if (((Get-Date) - $script:doneAt).TotalSeconds -gt 4) { $form.Close() }
    }
    'starting' {
      $since = ((Get-Date) - $script:doneAt).TotalSeconds
      # The installer starts the app itself; start it here only if it didn't.
      if (@(Get-AppMain).Count -gt 0) {
        if ($since -gt 2) { $form.Close() }
      } elseif ($since -gt 10) {
        Start-Process -FilePath $AppExe
        $script:doneAt = (Get-Date).AddSeconds(-8)
      }
    }
  }

  # Give up only while the update is still under way; once it has landed
  # ('starting' or 'done'), let it finish.
  if ($script:phase -in 'closing', 'installing' -and $elapsed.TotalMinutes -gt 10) { $script:phase = 'failed' }
  if ($script:phase -eq 'failed' -and -not $close.Visible) {
    $timer.Stop()
    $bar.Visible = $false
    $title.Text = "The update to version $Target didn't finish"
    $step.SetBounds(16, 44, 408, 20)
    $step.Text = "$appName is unchanged, and your data is safe."
    $hint.SetBounds(16, 66, 408, 20)
    $hint.Text = 'It will try again the next time you quit it.'
    $clock.Text = ''
    $open.Visible = $true
    $close.Visible = $true
  }
})

# Started with a hidden console, Windows applies "hidden" to this form's
# first appearance too. Once it has loaded, show it explicitly.
Add-Type -Namespace ToolboxUpdate -Name User32 -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr hWnd, int nCmdShow);'
$form.Add_Shown({
  [void][ToolboxUpdate.User32]::ShowWindow($form.Handle, 5)
  $form.Activate()
  $timer.Start()
})
[void]$form.ShowDialog()
`;

// Starts the window. Never throws: a missing window must not stop the update.
//
// The window has to outlive the app, which quits right after this. A process
// spawned straight from here doesn't: Windows PowerShell exits at once when
// started detached (no console), and dies with the app when it isn't. So a
// short-lived PowerShell hands it to Start-Process, which launches it as an
// independent process. The details travel through the environment, so the
// apostrophe in the app's name and any odd characters in paths need no quoting.
export function showUpdateProgress(targetVersion: string, restart: boolean): void {
  if (process.platform !== 'win32') return;
  try {
    const file = path.join(os.tmpdir(), 'saphirs-toolbox-update-progress.ps1');
    // UTF-8 with BOM, so Windows PowerShell 5.1 reads the apostrophe in the
    // app's name (and anything else non-ASCII) correctly.
    fs.writeFileSync(file, '﻿' + SCRIPT, 'utf8');
    const launch =
      "Start-Process -FilePath powershell.exe -WindowStyle Hidden -ArgumentList @(" +
      "'-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ('\"' + $env:TOOLBOX_UPDATE_SCRIPT + '\"'))";
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', launch], {
      stdio: 'ignore',
      windowsHide: true,
      env: {
        ...process.env,
        TOOLBOX_UPDATE_SCRIPT: file,
        TOOLBOX_UPDATE_TARGET: targetVersion,
        TOOLBOX_UPDATE_INSTDIR: path.dirname(process.execPath),
        TOOLBOX_UPDATE_EXE: process.execPath,
        TOOLBOX_UPDATE_RESTART: restart ? '1' : '0',
      },
    });
    // A launch failure arrives here, not in the catch below.
    child.on('error', err => console.error('[autoUpdater] could not show the update window:', err));
    child.unref();
  } catch (err) {
    console.error('[autoUpdater] could not show the update window:', err);
  }
}

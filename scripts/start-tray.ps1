# Job Inbox — трей. Нужен STA (см. start-tray.vbs).
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$LogFile = Join-Path $PSScriptRoot 'tray.log'
$UiUrl = 'http://localhost:5173/'
$ApiBase = 'http://localhost:3001'
$devProc = $null
$notify = $null
$lastBalloonUnread = -1
$lastSeenScanAt = $null
$autoEnabled = $true

function Write-TrayLog([string]$Message) {
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  try { Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8 } catch { }
}

function Stop-DevProcess {
  if ($null -eq $script:devProc) { return }
  try {
    if (-not $script:devProc.HasExited) {
      Start-Process -FilePath 'taskkill.exe' `
        -ArgumentList "/PID $($script:devProc.Id) /T /F" `
        -WindowStyle Hidden -Wait -ErrorAction SilentlyContinue | Out-Null
    }
  } catch { }
  $script:devProc = $null
}

function Remove-TrayIcon {
  try {
    if ($null -ne $script:pollTimer) {
      $script:pollTimer.Stop()
      $script:pollTimer.Dispose()
      $script:pollTimer = $null
    }
  } catch { }
  try {
    if ($null -ne $script:notify) {
      $script:notify.Visible = $false
      $script:notify.Dispose()
      $script:notify = $null
    }
  } catch { }
}

function New-JobInboxIcon {
  $bmp = New-Object System.Drawing.Bitmap 32, 32
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 37, 99, 235))
  $g.FillEllipse($brush, 1, 1, 30, 30)
  $font = New-Object System.Drawing.Font 'Segoe UI', 11, ([System.Drawing.FontStyle]::Bold)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $g.DrawString('JI', $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 0, 0, 32, 32), $sf)
  $icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
  $g.Dispose()
  $brush.Dispose()
  $font.Dispose()
  return $icon
}

function Invoke-ApiJson {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$Body = $null
  )
  $uri = "$script:ApiBase$Path"
  try {
    if ($null -ne $Body -and $Body.Length -gt 0) {
      return Invoke-RestMethod -Method $Method -Uri $uri -ContentType 'application/json; charset=utf-8' -Body $Body -TimeoutSec 8
    }
    return Invoke-RestMethod -Method $Method -Uri $uri -TimeoutSec 8
  } catch {
    Write-TrayLog ("API $Method $Path failed: " + $_.Exception.Message)
    return $null
  }
}

function Open-UiAndAck {
  Start-Process $script:UiUrl
  $null = Invoke-ApiJson -Method 'POST' -Path '/api/autoscan/ack'
  $script:lastBalloonUnread = 0
  if ($null -ne $script:notify) {
    $script:notify.Text = 'Job Inbox — ПКМ: меню'
  }
  Update-AutoMenuText
}

function Update-AutoMenuText {
  if ($null -eq $script:autoItem) { return }
  if ($script:autoEnabled) {
    $script:autoItem.Text = 'Пауза автообновления'
  } else {
    $script:autoItem.Text = 'Включить автообновление'
  }
}

function Update-TrayFromAutoscan {
  $state = Invoke-ApiJson -Method 'GET' -Path '/api/autoscan'
  if ($null -eq $state) { return }

  if ($null -ne $state.enabled) {
    $script:autoEnabled = [bool]$state.enabled
    Update-AutoMenuText
  }

  $unread = 0
  try { $unread = [int]$state.unreadNewCount } catch { $unread = 0 }
  $lastAdded = 0
  try { $lastAdded = [int]$state.lastAdded } catch { $lastAdded = 0 }

  $lastScanAt = [string]$state.lastScanAt
  if ($null -eq $script:notify) { return }

  $scanAtChanged = ($null -ne $lastScanAt -and $lastScanAt.Length -gt 0 -and $lastScanAt -ne [string]$script:lastSeenScanAt)
  if ($scanAtChanged) {
    $isFirstSight = ($null -eq $script:lastSeenScanAt -or [string]$script:lastSeenScanAt -eq '')
    $script:lastSeenScanAt = $lastScanAt
    $scanTime = try { ([datetime]$lastScanAt).ToLocalTime().ToString('HH:mm') } catch { '?' }

    if (-not $isFirstSight) {
      if ($lastAdded -gt 0) {
        $script:notify.BalloonTipTitle = 'Job Inbox'
        $script:notify.BalloonTipText = "+$lastAdded новых вакансий ($scanTime). Открой UI из трея."
        $script:notify.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
        $script:notify.ShowBalloonTip(6000)
        $script:lastBalloonUnread = $unread
        Write-TrayLog "balloon added=$lastAdded unread=$unread scanAt=$lastScanAt"
      } else {
        # Скан прошёл, новых нет — сообщаем, чтобы было видно, что автоскан жив.
        $script:notify.BalloonTipTitle = 'Job Inbox'
        $script:notify.BalloonTipText = "Скан завершён ($scanTime), новых вакансий нет."
        $script:notify.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
        $script:notify.ShowBalloonTip(4000)
        Write-TrayLog "balloon scan-empty scanAt=$lastScanAt"
      }
    }
  }

  if ($unread -gt 0) {
    $script:notify.Text = "Job Inbox · +$unread"
  } elseif ($null -ne $script:lastSeenScanAt -and [string]$script:lastSeenScanAt.Length -gt 0) {
    $scanTime = try { ([datetime]$script:lastSeenScanAt).ToLocalTime().ToString('HH:mm') } catch { '?' }
    $script:notify.Text = "Job Inbox · скан $scanTime"
    $script:lastBalloonUnread = 0
  } else {
    $script:notify.Text = 'Job Inbox — ПКМ: меню'
    $script:lastBalloonUnread = 0
  }
}

function Start-Stack {
  Set-Location $Root
  Write-TrayLog "docker compose up -d ($Root)"
  $docker = Start-Process -FilePath 'docker' -ArgumentList 'compose', 'up', '-d' `
    -WorkingDirectory $Root -Wait -PassThru -WindowStyle Hidden
  if ($docker.ExitCode -ne 0) {
    Write-TrayLog "docker failed: exit $($docker.ExitCode)"
    [System.Windows.Forms.MessageBox]::Show(
      "Не удалось запустить Docker Compose.`nПроверь Docker Desktop.`nЛог: $LogFile",
      'Job Inbox',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
    return $false
  }

  Write-TrayLog 'starting npm run dev'
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = 'cmd.exe'
  $psi.Arguments = '/d /c npm run dev'
  $psi.WorkingDirectory = $Root
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  $script:devProc = [System.Diagnostics.Process]::Start($psi)
  Write-TrayLog "npm pid=$($script:devProc.Id)"
  return $true
}

function Restart-Stack {
  Write-TrayLog 'restart from tray menu'
  if ($null -ne $script:notify) {
    $script:notify.Text = 'Job Inbox — перезапуск…'
    $script:notify.BalloonTipTitle = 'Job Inbox'
    $script:notify.BalloonTipText = 'Перезапускаю API и UI…'
    $script:notify.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
    $script:notify.ShowBalloonTip(4000)
  }

  Stop-DevProcess
  Start-Sleep -Seconds 1
  if (-not (Start-Stack)) {
    if ($null -ne $script:notify) {
      $script:notify.Text = 'Job Inbox — ошибка перезапуска'
    }
    return
  }

  $script:lastBalloonUnread = -1
  if ($null -ne $script:notify) {
    $script:notify.Text = 'Job Inbox — ПКМ: меню'
  }

  # UI поднимется чуть позже npm run dev
  $reopen = New-Object System.Windows.Forms.Timer
  $reopen.Interval = 6000
  $reopen.Add_Tick({
    $timer = [System.Windows.Forms.Timer]$this
    $timer.Stop()
    $timer.Dispose()
    Open-UiAndAck
    if ($null -ne $script:notify) {
      $script:notify.BalloonTipTitle = 'Job Inbox'
      $script:notify.BalloonTipText = 'Стек перезапущен.'
      $script:notify.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
      $script:notify.ShowBalloonTip(4000)
    }
  }) | Out-Null
  $reopen.Start()
}

try {
  Write-TrayLog 'tray start'
  if (-not (Start-Stack)) { exit 1 }

  $script:notify = New-Object System.Windows.Forms.NotifyIcon
  $script:notify.Text = 'Job Inbox — ПКМ: меню'
  $script:notify.Icon = New-JobInboxIcon
  $script:notify.Visible = $true

  $menu = New-Object System.Windows.Forms.ContextMenuStrip
  $openItem = $menu.Items.Add('Открыть UI')
  $openItem.Add_Click({ Open-UiAndAck }) | Out-Null

  $scanItem = $menu.Items.Add('Скан сейчас')
  $scanItem.Add_Click({
    $null = Invoke-ApiJson -Method 'POST' -Path '/api/scan' -Body '{}'
  }) | Out-Null

  $script:autoItem = $menu.Items.Add('Пауза автообновления')
  $script:autoItem.Add_Click({
    $next = -not $script:autoEnabled
    $body = (@{ autoScanEnabled = $next } | ConvertTo-Json -Compress)
    $updated = Invoke-ApiJson -Method 'PATCH' -Path '/api/settings' -Body $body
    if ($null -ne $updated) {
      $script:autoEnabled = [bool]$updated.autoScanEnabled
      Update-AutoMenuText
      Write-TrayLog "autoScanEnabled=$($script:autoEnabled)"
    }
  }) | Out-Null

  [void]$menu.Items.Add('-')
  $restartItem = $menu.Items.Add('Перезапуск')
  $restartItem.Add_Click({ Restart-Stack }) | Out-Null
  $exitItem = $menu.Items.Add('Стоп и выход')
  $exitItem.Add_Click({
    Write-TrayLog 'exit from tray menu'
    Stop-DevProcess
    Remove-TrayIcon
    [System.Windows.Forms.Application]::Exit()
  }) | Out-Null
  $script:notify.ContextMenuStrip = $menu
  $script:notify.Add_DoubleClick({ Open-UiAndAck }) | Out-Null
  $script:notify.Add_BalloonTipClicked({ Open-UiAndAck }) | Out-Null

  $browserTimer = New-Object System.Windows.Forms.Timer
  $browserTimer.Interval = 6000
  $browserTimer.Add_Tick({
    $browserTimer.Stop()
    Open-UiAndAck
  }) | Out-Null
  $browserTimer.Start()

  $script:pollTimer = New-Object System.Windows.Forms.Timer
  $script:pollTimer.Interval = 15000
  $script:pollTimer.Add_Tick({ Update-TrayFromAutoscan }) | Out-Null
  $script:pollTimer.Start()

  $script:notify.BalloonTipTitle = 'Job Inbox'
  $script:notify.BalloonTipText = 'Иконка в трее. Автоскан раз в 10 мин. ПКМ — меню.'
  $script:notify.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
  $script:notify.ShowBalloonTip(5000)

  Write-TrayLog 'message loop'
  [System.Windows.Forms.Application]::Run()
  Write-TrayLog 'tray exit'
} catch {
  Write-TrayLog ("ERROR: " + $_.Exception.Message)
  try {
    [System.Windows.Forms.MessageBox]::Show(
      "Ошибка трея: $($_.Exception.Message)`nЛог: $LogFile",
      'Job Inbox',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
  } catch { }
} finally {
  Stop-DevProcess
  Remove-TrayIcon
}

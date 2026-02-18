Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:trayExitRequested = $false
$script:lastMessage = 'Inicializando watcher...'
$script:watcherProcess = $null
$script:watcherState = 'Parado'

$mutexName = 'Local\PainelIndustrialWatcherFaturamentoTray'
$createdNew = $false
$mutex = New-Object System.Threading.Mutex($true, $mutexName, [ref]$createdNew)
if (-not $createdNew) {
  [System.Windows.Forms.MessageBox]::Show('O watcher de faturamento ja esta em execucao na bandeja.', 'Watcher de faturamento') | Out-Null
  exit 0
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$watcherScript = Join-Path $PSScriptRoot 'watchFaturamentoCsv.mjs'
$nodeExe = 'C:\Program Files\nodejs\node.exe'
if (-not (Test-Path $nodeExe)) {
  $nodeExe = 'node'
}

$logPath = Join-Path $repoRoot 'watcher-faturamento.log'
$outputPublic = Join-Path $repoRoot 'public\data\faturamento.json'
$outputSrc = Join-Path $repoRoot 'src\data\faturamento.json'
$gitBin = if ($env:FATURAMENTO_GIT_BIN) { $env:FATURAMENTO_GIT_BIN } else { 'git' }

function Write-WatcherLog {
  param([string]$Line)

  if ([string]::IsNullOrWhiteSpace($Line)) {
    return
  }

  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $logPath -Value "[$timestamp] $Line"
  $script:lastMessage = $Line
}

function Set-WatcherState {
  param([string]$State)
  $script:watcherState = $State
  $global:menuStatus.Text = "Status: $State"
  $global:notifyIcon.Text = if ($State -eq 'Rodando') { 'Watcher de faturamento rodando' } else { 'Watcher de faturamento parado' }
}

function Get-LastWriteText {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    return 'Arquivo ainda nao gerado'
  }
  $item = Get-Item $Path
  return $item.LastWriteTime.ToString('dd/MM/yyyy HH:mm:ss')
}

function Get-LastCommitText {
  try {
    $result = & $gitBin -C $repoRoot log -1 --date=iso-local --pretty=format:"%h | %ad | %s" -- "public/data/faturamento.json" 2>$null
    if ([string]::IsNullOrWhiteSpace($result)) {
      return 'Sem commit para faturamento.json'
    }
    return $result.Trim()
  } catch {
    return 'Nao foi possivel ler o ultimo commit'
  }
}

function Get-StatusText {
  $pidText = if ($script:watcherProcess -and -not $script:watcherProcess.HasExited) { $script:watcherProcess.Id } else { '-' }
  $publicWrite = Get-LastWriteText $outputPublic
  $srcWrite = Get-LastWriteText $outputSrc
  $lastCommit = Get-LastCommitText
  return @"
Status: $($script:watcherState)
PID watcher: $pidText

Ultima atualizacao (public): $publicWrite
Ultima atualizacao (src): $srcWrite

Ultimo commit:
$lastCommit

Ultima mensagem:
$($script:lastMessage)
"@
}

function Start-Watcher {
  if ($script:watcherProcess -and -not $script:watcherProcess.HasExited) {
    return
  }

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $nodeExe
  $psi.Arguments = "`"$watcherScript`""
  $psi.WorkingDirectory = $repoRoot
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $psi

  [void]$process.Start()

  $script:watcherProcess = $process
  Set-WatcherState 'Rodando'
  Write-WatcherLog 'Watcher iniciado.'
}

function Stop-Watcher {
  if ($script:watcherProcess -and -not $script:watcherProcess.HasExited) {
    try {
      $script:watcherProcess.Kill()
      $script:watcherProcess.WaitForExit(3000) | Out-Null
    } catch {
    }
  }

  $script:watcherProcess = $null
  Set-WatcherState 'Parado'
}

$global:notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$global:notifyIcon.Icon = [System.Drawing.SystemIcons]::Application
$global:notifyIcon.Visible = $true
$global:notifyIcon.Text = 'Watcher de faturamento'

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$global:menuStatus = $menu.Items.Add('Status: Inicializando')
$global:menuStatus.Enabled = $false

[void]$menu.Items.Add('-')

$menuItemVerLog = $menu.Items.Add('Ver ultimo status')
$menuItemVerLog.Add_Click({
  [System.Windows.Forms.MessageBox]::Show($script:lastMessage, 'Watcher de faturamento') | Out-Null
})

$menuItemStatusCompleto = $menu.Items.Add('Ver status completo')
$menuItemStatusCompleto.Add_Click({
  [System.Windows.Forms.MessageBox]::Show((Get-StatusText), 'Watcher de faturamento') | Out-Null
})

$menuItemAbrirLog = $menu.Items.Add('Abrir arquivo de log')
$menuItemAbrirLog.Add_Click({
  if (-not (Test-Path $logPath)) {
    New-Item -Path $logPath -ItemType File -Force | Out-Null
  }
  Start-Process notepad.exe $logPath
})

$menuItemReiniciar = $menu.Items.Add('Reiniciar watcher')
$menuItemReiniciar.Add_Click({
  Stop-Watcher
  Start-Watcher
})

[void]$menu.Items.Add('-')

$menuItemSair = $menu.Items.Add('Sair')
$menuItemSair.Add_Click({
  $script:trayExitRequested = $true
})

$global:notifyIcon.ContextMenuStrip = $menu
$global:notifyIcon.Add_DoubleClick({
  [System.Windows.Forms.MessageBox]::Show((Get-StatusText), 'Watcher de faturamento') | Out-Null
})

try {
  Start-Watcher
  $global:notifyIcon.BalloonTipTitle = 'Watcher de faturamento'
  $global:notifyIcon.BalloonTipText = 'Iniciado oculto na bandeja do sistema.'
  $global:notifyIcon.ShowBalloonTip(2000)

  $exitNoticeShown = $false
  while (-not $script:trayExitRequested) {
    if ($script:watcherProcess -and $script:watcherProcess.HasExited) {
      if (-not $exitNoticeShown) {
        $exitNoticeShown = $true
        Set-WatcherState 'Parado'
        Write-WatcherLog 'Watcher encerrado.'
        $global:notifyIcon.BalloonTipTitle = 'Watcher de faturamento'
        $global:notifyIcon.BalloonTipText = 'Processo encerrado. Use Reiniciar para voltar a rodar.'
        $global:notifyIcon.ShowBalloonTip(2500)
      }
    } else {
      $exitNoticeShown = $false
    }

    [System.Windows.Forms.Application]::DoEvents()
    Start-Sleep -Milliseconds 200
  }
}
finally {
  Stop-Watcher
  $global:notifyIcon.Visible = $false
  $global:notifyIcon.Dispose()
  if ($mutex) {
    $mutex.ReleaseMutex() | Out-Null
    $mutex.Dispose()
  }
}

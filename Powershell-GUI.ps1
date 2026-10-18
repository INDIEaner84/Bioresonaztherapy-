# Experimental Windows Forms wrapper for the C++ s2 CLI.
# Simulation is the default; physical-device access requires an explicit choice
# and confirmation. This UI is not a hardware safety interlock.

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:activeProcess = $null
$script:outputQueue = [System.Collections.Concurrent.ConcurrentQueue[string]]::new()
$script:commandButtons = @{}

function Add-OutputLine {
    param([string]$Text)

    if ($null -eq $script:txtOutput -or $script:txtOutput.IsDisposed) {
        return
    }

    $script:txtOutput.AppendText($Text + [Environment]::NewLine)
    $maxOutputLength = 100000
    if ($script:txtOutput.TextLength -gt $maxOutputLength) {
        $script:txtOutput.Text = $script:txtOutput.Text.Substring(
            $script:txtOutput.TextLength - $maxOutputLength)
        $script:txtOutput.SelectionStart = $script:txtOutput.TextLength
        $script:txtOutput.ScrollToCaret()
    }
}

function Drain-OutputQueue {
    $line = $null
    while ($script:outputQueue.TryDequeue([ref]$line)) {
        if ($null -ne $line) {
            Add-OutputLine -Text $line
        }
        $line = $null
    }
}

function Set-CommandButtonsEnabled {
    param([bool]$Enabled)

    foreach ($name in $script:commandButtons.Keys) {
        if ($name -ne "scan") {
            $script:commandButtons[$name].Enabled = $Enabled
        }
    }
    # Finite scan counts still cannot bound a blocked device read, and the GUI has no cooperative stop mechanism.
    $script:commandButtons["scan"].Enabled = $false
}

function Add-TextOption {
    param(
        [System.Collections.Generic.List[string]]$Target,
        [string]$Name,
        [System.Windows.Forms.TextBox]$Control
    )

    $value = $Control.Text.Trim()
    if ($value.Length -gt 0) {
        [void]$Target.Add("$Name=$value")
    }
}

function Get-CommandArguments {
    param([string]$CommandName)

    $arguments = [System.Collections.Generic.List[string]]::new()
    $simulation = [string]$script:cboSimulation.SelectedItem

    switch ($CommandName) {
        "status" {
            [void]$arguments.Add("simulation=$simulation")
        }
        "pulse" {
            [void]$arguments.Add("simulation=$simulation")
            Add-TextOption -Target $arguments -Name "pulse" -Control $script:txtPulse
            Add-TextOption -Target $arguments -Name "iterations" -Control $script:txtIterations
        }
        "set" {
            if ($script:cboGenerator.SelectedIndex -gt 0) {
                [void]$arguments.Add("generator=$($script:cboGenerator.SelectedItem)")
            }
            Add-TextOption -Target $arguments -Name "channel" -Control $script:txtChannel
        }
        "control" {
            [void]$arguments.Add("simulation=$simulation")
            if ($script:cboGenerator.SelectedIndex -gt 0) {
                [void]$arguments.Add("generator=$($script:cboGenerator.SelectedItem)")
            }
            Add-TextOption -Target $arguments -Name "channel" -Control $script:txtChannel
            Add-TextOption -Target $arguments -Name "amplitude" -Control $script:txtAmplitude
            Add-TextOption -Target $arguments -Name "frequency" -Control $script:txtFrequency

            $waveform = [string]$script:cboWaveform.SelectedItem
            if ($waveform -and $waveform -ne "No change") {
                [void]$arguments.Add("waveform=$waveform")
            }

            $output = [string]$script:cboOutput.SelectedItem
            $duration = $script:txtDuration.Text.Trim()
            if ($output -eq "on") {
                if ($script:txtAmplitude.Text.Trim().Length -eq 0 -or
                    $script:txtFrequency.Text.Trim().Length -eq 0 -or
                    $duration.Length -eq 0) {
                    throw "For control output=on, enter amplitude, frequency, and a positive duration."
                }
                $durationMatch = [regex]::Match(
                    $duration,
                    '^(?<value>(?:\d+(?:\.\d*)?|\.\d+))(?<unit>[smh]?)$')
                if (-not $durationMatch.Success) {
                    throw "Duration must be a nonnegative number followed by s, m, or h (for example 10s)."
                }
                $durationValue = 0.0
                $parsedDuration = [double]::TryParse(
                    $durationMatch.Groups['value'].Value,
                    [System.Globalization.NumberStyles]::Float,
                    [System.Globalization.CultureInfo]::InvariantCulture,
                    [ref]$durationValue)
                if (-not $parsedDuration) {
                    throw "Duration is not a valid number. Use a dot for decimal values."
                }
                switch ($durationMatch.Groups['unit'].Value) {
                    "m" { $durationValue *= 60.0 }
                    "h" { $durationValue *= 3600.0 }
                }
                if ($durationValue -le 0.0 -or $durationValue -gt 315360000.0) {
                    throw "When output is enabled, duration must be greater than zero and no more than 315360000 seconds."
                }
                [void]$arguments.Add("output=on")
                [void]$arguments.Add("duration=$duration")
                [void]$arguments.Add("output=off")
            }
            else {
                Add-TextOption -Target $arguments -Name "duration" -Control $script:txtDuration
                [void]$arguments.Add("output=off")
            }
        }
        "run" {
            [void]$arguments.Add("simulation=$simulation")
            if ($script:cboGenerator.SelectedIndex -gt 0) {
                [void]$arguments.Add("generator=$($script:cboGenerator.SelectedItem)")
            }
            Add-TextOption -Target $arguments -Name "channel" -Control $script:txtChannel
            Add-TextOption -Target $arguments -Name "amplitude" -Control $script:txtAmplitude
            Add-TextOption -Target $arguments -Name "iterations" -Control $script:txtIterations

            $preset = $script:txtPreset.Text.Trim()
            $source = $script:txtRunSource.Text.Trim()
            if ($preset.Length -gt 0 -and $source.Length -gt 0) {
                throw "Choose either a preset file or a program ID / inline code, not both."
            }
            if ($preset.Length -gt 0) {
                if (-not (Test-Path -LiteralPath $preset -PathType Leaf)) {
                    throw "Preset file not found: $preset"
                }
                [void]$arguments.Add("preset=$preset")
            }
            elseif ($source -match '^\d+$') {
                $programId = 0
                if (-not [int]::TryParse($source, [ref]$programId) -or
                    $programId -lt 1 -or $programId -gt 100000) {
                    throw "Program ID must be an integer between 1 and 100000."
                }
                [void]$arguments.Add("program=$programId")
            }
            elseif ($source.Length -gt 0) {
                if ($source.Contains("`n") -or $source.Contains("`r")) {
                    throw "Inline program code must be entered on one line."
                }
                [void]$arguments.Add("code=$source")
            }
            else {
                throw "Select a preset or enter a program ID / inline program code before running."
            }
        }
        default {
            throw "The '$CommandName' command is not enabled in this GUI."
        }
    }

    if ($CommandName -in @("pulse", "run")) {
        $iterations = $script:txtIterations.Text.Trim()
        if ($iterations.Length -gt 0) {
            $iterationCount = 0
            if (-not [int]::TryParse($iterations, [ref]$iterationCount) -or
                $iterationCount -lt 1 -or $iterationCount -gt 1000000) {
                throw "Iterations must be an integer between 1 and 1000000."
            }
        }
    }

    return ,($arguments.ToArray())
}

function ConvertTo-WindowsArgument {
    param([string]$Argument)

    if ($Argument.Length -gt 0 -and $Argument -notmatch '[\s"]') {
        return $Argument
    }

    # Quote according to the standard Windows C-runtime command-line rules.
    $builder = [System.Text.StringBuilder]::new()
    [void]$builder.Append('"')
    $backslashCount = 0
    foreach ($character in $Argument.ToCharArray()) {
        if ($character -eq [char]'\') {
            $backslashCount++
            continue
        }
        if ($character -eq [char]'"') {
            if ($backslashCount -gt 0) {
                [void]$builder.Append(('\' * (2 * $backslashCount)))
            }
            [void]$builder.Append('\')
            [void]$builder.Append('"')
            $backslashCount = 0
            continue
        }
        if ($backslashCount -gt 0) {
            [void]$builder.Append(('\' * $backslashCount))
            $backslashCount = 0
        }
        [void]$builder.Append($character)
    }
    if ($backslashCount -gt 0) {
        [void]$builder.Append(('\' * (2 * $backslashCount)))
    }
    [void]$builder.Append('"')
    return $builder.ToString()
}

function Format-CommandLine {
    param([string]$Executable, [string[]]$Arguments)

    $quoted = @($Arguments | ForEach-Object { ConvertTo-WindowsArgument -Argument $_ })
    return '"' + $Executable + '" ' + ($quoted -join ' ')
}

function Confirm-PhysicalAccess {
    param([string]$CommandName)

    if ($CommandName -eq "set") {
        return $true
    }
    if ([string]$script:cboSimulation.SelectedItem -ne "off") {
        return $true
    }

    $details = switch ($CommandName) {
        "status" { "This will enumerate physical devices. It will not open a generator or change its output." }
        "pulse" { "This will read from a physical pulse sensor." }
        "run" { "This may command the selected physical generator according to the program. There is no GUI interrupt control; use only finite runs you can wait to completion." }
        "control" {
            if ([string]$script:cboOutput.SelectedItem -eq "on") {
                "This may enable the physical generator output for the requested duration. Verify the hardware setup independently."
            }
            else {
                "This will communicate with a physical generator. The control output is set to off by this command."
            }
        }
        default { "This command may access physical hardware." }
    }

    $message = "Simulation is OFF.`r`n`r`n$details`r`n`r`nContinue?"
    $answer = [System.Windows.Forms.MessageBox]::Show(
        $script:form,
        $message,
        "Confirm physical hardware access",
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Warning)
    return ($answer -eq [System.Windows.Forms.DialogResult]::Yes)
}

function Run-S2Command {
    param([string]$CommandName)

    if ($null -ne $script:activeProcess) {
        [System.Windows.Forms.MessageBox]::Show(
            $script:form,
            "A command is already running. Wait for it to finish before starting another.",
            "Command in progress",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
        return
    }

    $exePath = $script:textS2.Text.Trim()
    if (-not $exePath -or -not (Test-Path -LiteralPath $exePath -PathType Leaf)) {
        [System.Windows.Forms.MessageBox]::Show(
            $script:form,
            "Select an existing s2 executable first.",
            "Executable not found",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
        return
    }

    try {
        $arguments = Get-CommandArguments -CommandName $CommandName
    }
    catch {
        [System.Windows.Forms.MessageBox]::Show(
            $script:form,
            $_.Exception.Message,
            "Invalid command parameters",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
        return
    }

    if (-not (Confirm-PhysicalAccess -CommandName $CommandName)) {
        Add-OutputLine -Text "Cancelled: physical hardware access was not confirmed."
        return
    }

    if ($CommandName -eq "control" -and [string]$script:cboOutput.SelectedItem -eq "on") {
        $message = "The control command will request output=on, wait for $($script:txtDuration.Text.Trim()), then request output=off.`r`n`r`nThis is not a hardware safety guarantee. Continue?"
        $answer = [System.Windows.Forms.MessageBox]::Show(
            $script:form,
            $message,
            "Confirm control output",
            [System.Windows.Forms.MessageBoxButtons]::YesNo,
            [System.Windows.Forms.MessageBoxIcon]::Warning)
        if ($answer -ne [System.Windows.Forms.DialogResult]::Yes) {
            Add-OutputLine -Text "Cancelled: output enable was not confirmed."
            return
        }
    }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $exePath
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true

    # .NET (Core) exposes ArgumentList; Windows PowerShell/.NET Framework does
    # not, so use correct Windows quoting as a compatibility fallback.
    $argumentListProperty = $psi.GetType().GetProperty("ArgumentList")
    if ($null -ne $argumentListProperty) {
        $nativeArguments = $argumentListProperty.GetValue($psi, $null)
        foreach ($argument in $arguments) {
            $nativeArguments.Add([string]$argument)
        }
    }
    else {
        $psi.Arguments = (@($arguments | ForEach-Object {
            ConvertTo-WindowsArgument -Argument ([string]$_)
        }) -join ' ')
    }

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi
    $script:activeProcess = $process
    $script:outputQueue = [System.Collections.Concurrent.ConcurrentQueue[string]]::new()

    $script:stdoutHandler = [System.Diagnostics.DataReceivedEventHandler]{
        param($sender, $eventArgs)
        if ($null -ne $eventArgs.Data) {
            $script:outputQueue.Enqueue("OUT: " + $eventArgs.Data)
        }
    }
    $script:stderrHandler = [System.Diagnostics.DataReceivedEventHandler]{
        param($sender, $eventArgs)
        if ($null -ne $eventArgs.Data) {
            $script:outputQueue.Enqueue("ERR: " + $eventArgs.Data)
        }
    }
    $process.add_OutputDataReceived($script:stdoutHandler)
    $process.add_ErrorDataReceived($script:stderrHandler)

    Add-OutputLine -Text ("Running: " + (Format-CommandLine -Executable $exePath -Arguments $arguments))
    Add-OutputLine -Text "Note: the GUI has no interrupt control; use finite runs only and do not close it while a command is active. Output shutdown remains best effort."

    $processStarted = $false
    try {
        if (-not $process.Start()) {
            throw "The s2 process could not be started."
        }
        $processStarted = $true
        Set-CommandButtonsEnabled -Enabled $false
        $script:processTimer.Start()
        $process.BeginOutputReadLine()
        $process.BeginErrorReadLine()
    }
    catch {
        Add-OutputLine -Text ("Process start/read error: " + $_.Exception.Message)
        if ($processStarted) {
            # Keep tracking a process that did start; never orphan it merely
            # because redirected output could not be initialized.
            Add-OutputLine -Text "The child process may still be active. Closing remains blocked until it exits."
            Set-CommandButtonsEnabled -Enabled $false
            $script:processTimer.Start()
        }
        else {
            $script:activeProcess = $null
            $process.Dispose()
            Set-CommandButtonsEnabled -Enabled $true
        }
    }
}

# -----------------------------------------------------------------------------
# Main form
# -----------------------------------------------------------------------------
$script:form = New-Object System.Windows.Forms.Form
$script:form.Text = "S2 Control GUI - experimental"
$script:form.Size = New-Object System.Drawing.Size(820, 900)
$script:form.StartPosition = "CenterScreen"
$script:form.MaximizeBox = $false

# -----------------------------------------------------------------------------
# s2 executable
# -----------------------------------------------------------------------------
$s2Group = New-Object System.Windows.Forms.GroupBox
$s2Group.Text = "s2 Executable"
$s2Group.Location = New-Object System.Drawing.Point(10, 10)
$s2Group.Size = New-Object System.Drawing.Size(780, 60)
$script:form.Controls.Add($s2Group)

$labelS2 = New-Object System.Windows.Forms.Label
$labelS2.Location = New-Object System.Drawing.Point(10, 25)
$labelS2.Size = New-Object System.Drawing.Size(70, 20)
$labelS2.Text = "Exe Path:"
$s2Group.Controls.Add($labelS2)

$script:textS2 = New-Object System.Windows.Forms.TextBox
$script:textS2.Location = New-Object System.Drawing.Point(90, 23)
$script:textS2.Size = New-Object System.Drawing.Size(550, 20)
$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$exeCandidates = @(
    (Join-Path $scriptDirectory "build\Release\s2.exe"),
    (Join-Path $scriptDirectory "build\s2.exe"),
    (Join-Path $scriptDirectory "s2.exe")
)
$foundExe = $exeCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if ($foundExe) {
    $script:textS2.Text = $foundExe
}
$s2Group.Controls.Add($script:textS2)

$buttonS2Browse = New-Object System.Windows.Forms.Button
$buttonS2Browse.Location = New-Object System.Drawing.Point(650, 20)
$buttonS2Browse.Size = New-Object System.Drawing.Size(100, 24)
$buttonS2Browse.Text = "Browse..."
$s2Group.Controls.Add($buttonS2Browse)

$openFileDialogExe = New-Object System.Windows.Forms.OpenFileDialog
$openFileDialogExe.Filter = "s2 executable (s2.exe)|s2.exe|Executable Files (*.exe)|*.exe|All Files (*.*)|*.*"
$buttonS2Browse.Add_Click({
    if ($script:textS2.Text -and (Test-Path -LiteralPath $script:textS2.Text -PathType Leaf)) {
        $openFileDialogExe.InitialDirectory = Split-Path -Parent $script:textS2.Text
    }
    if ($openFileDialogExe.ShowDialog($script:form) -eq [System.Windows.Forms.DialogResult]::OK) {
        $script:textS2.Text = $openFileDialogExe.FileName
    }
})

# -----------------------------------------------------------------------------
# Optional Spooky2 folder reference (the C++ CLI does not receive this path)
# -----------------------------------------------------------------------------
$spookyGroup = New-Object System.Windows.Forms.GroupBox
$spookyGroup.Text = "Optional Spooky2 folder (reference only; not passed to s2)"
$spookyGroup.Location = New-Object System.Drawing.Point(10, 80)
$spookyGroup.Size = New-Object System.Drawing.Size(780, 60)
$script:form.Controls.Add($spookyGroup)

$textSpooky = New-Object System.Windows.Forms.TextBox
$textSpooky.Location = New-Object System.Drawing.Point(10, 23)
$textSpooky.Size = New-Object System.Drawing.Size(550, 20)
if (Test-Path -LiteralPath "C:\Spooky2" -PathType Container) {
    $textSpooky.Text = "C:\Spooky2"
}
$spookyGroup.Controls.Add($textSpooky)

$buttonSpookyBrowse = New-Object System.Windows.Forms.Button
$buttonSpookyBrowse.Location = New-Object System.Drawing.Point(570, 20)
$buttonSpookyBrowse.Size = New-Object System.Drawing.Size(100, 24)
$buttonSpookyBrowse.Text = "Browse..."
$spookyGroup.Controls.Add($buttonSpookyBrowse)

$buttonSpookyOpen = New-Object System.Windows.Forms.Button
$buttonSpookyOpen.Location = New-Object System.Drawing.Point(680, 20)
$buttonSpookyOpen.Size = New-Object System.Drawing.Size(80, 24)
$buttonSpookyOpen.Text = "Open Folder"
$spookyGroup.Controls.Add($buttonSpookyOpen)

$folderBrowser = New-Object System.Windows.Forms.FolderBrowserDialog
$buttonSpookyBrowse.Add_Click({
    if ($textSpooky.Text -and (Test-Path -LiteralPath $textSpooky.Text -PathType Container)) {
        $folderBrowser.SelectedPath = $textSpooky.Text
    }
    if ($folderBrowser.ShowDialog($script:form) -eq [System.Windows.Forms.DialogResult]::OK) {
        $textSpooky.Text = $folderBrowser.SelectedPath
    }
})
$buttonSpookyOpen.Add_Click({
    if ($textSpooky.Text -and (Test-Path -LiteralPath $textSpooky.Text -PathType Container)) {
        Invoke-Item -LiteralPath $textSpooky.Text
    }
    else {
        [System.Windows.Forms.MessageBox]::Show(
            $script:form,
            "Folder not found: $($textSpooky.Text)",
            "Folder not found",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error) | Out-Null
    }
})

# -----------------------------------------------------------------------------
# Command-specific parameter inputs. Only supported options are emitted.
# -----------------------------------------------------------------------------
$varGroup = New-Object System.Windows.Forms.GroupBox
$varGroup.Text = "Command parameters - simulation ON by default; control output OFF"
$varGroup.Location = New-Object System.Drawing.Point(10, 150)
$varGroup.Size = New-Object System.Drawing.Size(780, 280)
$script:form.Controls.Add($varGroup)

function Add-LabeledControl {
    param(
        [string]$LabelText,
        [System.Windows.Forms.Control]$Control,
        [int]$X,
        [int]$Y,
        [int]$LabelWidth = 135,
        [int]$ControlWidth = 150
    )
    $label = New-Object System.Windows.Forms.Label
    $label.Location = New-Object System.Drawing.Point($X, $Y)
    $label.Size = New-Object System.Drawing.Size($LabelWidth, 20)
    $label.Text = $LabelText
    $varGroup.Controls.Add($label)
    $Control.Location = New-Object System.Drawing.Point(($X + $LabelWidth), $Y)
    $Control.Size = New-Object System.Drawing.Size($ControlWidth, 22)
    $varGroup.Controls.Add($Control)
}

$script:txtAmplitude = New-Object System.Windows.Forms.TextBox
Add-LabeledControl -LabelText "Amplitude (e.g. 5V)" -Control $script:txtAmplitude -X 10 -Y 30 -ControlWidth 145

$script:txtChannel = New-Object System.Windows.Forms.TextBox
Add-LabeledControl -LabelText "Channel (0, 1, 2)" -Control $script:txtChannel -X 315 -Y 30 -LabelWidth 120 -ControlWidth 145

$script:txtDuration = New-Object System.Windows.Forms.TextBox
Add-LabeledControl -LabelText "Duration (control only)" -Control $script:txtDuration -X 10 -Y 70 -ControlWidth 145

$script:txtFrequency = New-Object System.Windows.Forms.TextBox
Add-LabeledControl -LabelText "Frequency (e.g. 500kHz)" -Control $script:txtFrequency -X 315 -Y 70 -LabelWidth 120 -ControlWidth 145

$script:cboGenerator = New-Object System.Windows.Forms.ComboBox
$script:cboGenerator.DropDownStyle = "DropDownList"
[void]$script:cboGenerator.Items.Add("(saved/default)")
0..9 | ForEach-Object { [void]$script:cboGenerator.Items.Add($_.ToString()) }
$script:cboGenerator.SelectedIndex = 0
Add-LabeledControl -LabelText "Generator" -Control $script:cboGenerator -X 10 -Y 110 -ControlWidth 145

$script:txtPulse = New-Object System.Windows.Forms.TextBox
Add-LabeledControl -LabelText "Pulse ID (0-16)" -Control $script:txtPulse -X 315 -Y 110 -LabelWidth 120 -ControlWidth 145

$script:cboSimulation = New-Object System.Windows.Forms.ComboBox
$script:cboSimulation.DropDownStyle = "DropDownList"
[void]$script:cboSimulation.Items.Add("on")
[void]$script:cboSimulation.Items.Add("off")
$script:cboSimulation.SelectedIndex = 0
Add-LabeledControl -LabelText "Simulation" -Control $script:cboSimulation -X 10 -Y 150 -ControlWidth 145

$script:cboWaveform = New-Object System.Windows.Forms.ComboBox
$script:cboWaveform.DropDownStyle = "DropDownList"
$script:cboWaveform.Items.AddRange([object[]]@("No change", "sine", "square", "sawtooth", "hbomb"))
$script:cboWaveform.SelectedIndex = 0
Add-LabeledControl -LabelText "Waveform (control only)" -Control $script:cboWaveform -X 315 -Y 150 -LabelWidth 120 -ControlWidth 145

$script:cboOutput = New-Object System.Windows.Forms.ComboBox
$script:cboOutput.DropDownStyle = "DropDownList"
[void]$script:cboOutput.Items.Add("off")
[void]$script:cboOutput.Items.Add("on")
$script:cboOutput.SelectedIndex = 0
Add-LabeledControl -LabelText "Output (control only)" -Control $script:cboOutput -X 10 -Y 190 -ControlWidth 145

$script:txtIterations = New-Object System.Windows.Forms.TextBox
Add-LabeledControl -LabelText "Iterations (run/pulse)" -Control $script:txtIterations -X 315 -Y 190 -LabelWidth 120 -ControlWidth 145

$script:txtRunSource = New-Object System.Windows.Forms.TextBox
Add-LabeledControl -LabelText "Run source: ID or code" -Control $script:txtRunSource -X 10 -Y 230 -LabelWidth 135 -ControlWidth 620

# -----------------------------------------------------------------------------
# Preset browser
# -----------------------------------------------------------------------------
$presetGroup = New-Object System.Windows.Forms.GroupBox
$presetGroup.Text = "Preset Selection (used only by run)"
$presetGroup.Location = New-Object System.Drawing.Point(10, 440)
$presetGroup.Size = New-Object System.Drawing.Size(780, 170)
$script:form.Controls.Add($presetGroup)

$lblPresetFolder = New-Object System.Windows.Forms.Label
$lblPresetFolder.Location = New-Object System.Drawing.Point(10, 20)
$lblPresetFolder.Size = New-Object System.Drawing.Size(90, 20)
$lblPresetFolder.Text = "Preset Folder:"
$presetGroup.Controls.Add($lblPresetFolder)

$txtPresetFolder = New-Object System.Windows.Forms.TextBox
$txtPresetFolder.Location = New-Object System.Drawing.Point(110, 18)
$txtPresetFolder.Size = New-Object System.Drawing.Size(450, 20)
if (Test-Path -LiteralPath "C:\Spooky2\Preset Collections" -PathType Container) {
    $txtPresetFolder.Text = "C:\Spooky2\Preset Collections"
}
$presetGroup.Controls.Add($txtPresetFolder)

$btnPresetFolderBrowse = New-Object System.Windows.Forms.Button
$btnPresetFolderBrowse.Location = New-Object System.Drawing.Point(570, 16)
$btnPresetFolderBrowse.Size = New-Object System.Drawing.Size(100, 24)
$btnPresetFolderBrowse.Text = "Browse..."
$presetGroup.Controls.Add($btnPresetFolderBrowse)

$folderBrowserPreset = New-Object System.Windows.Forms.FolderBrowserDialog
$btnPresetFolderBrowse.Add_Click({
    if ($txtPresetFolder.Text -and (Test-Path -LiteralPath $txtPresetFolder.Text -PathType Container)) {
        $folderBrowserPreset.SelectedPath = $txtPresetFolder.Text
    }
    if ($folderBrowserPreset.ShowDialog($script:form) -eq [System.Windows.Forms.DialogResult]::OK) {
        $txtPresetFolder.Text = $folderBrowserPreset.SelectedPath
        Refresh-PresetTree
    }
})

$treeViewPresets = New-Object System.Windows.Forms.TreeView
$treeViewPresets.Location = New-Object System.Drawing.Point(10, 50)
$treeViewPresets.Size = New-Object System.Drawing.Size(500, 105)
$presetGroup.Controls.Add($treeViewPresets)

$btnRefreshPresets = New-Object System.Windows.Forms.Button
$btnRefreshPresets.Location = New-Object System.Drawing.Point(520, 50)
$btnRefreshPresets.Size = New-Object System.Drawing.Size(100, 30)
$btnRefreshPresets.Text = "Refresh"
$presetGroup.Controls.Add($btnRefreshPresets)

$btnLoadPreset = New-Object System.Windows.Forms.Button
$btnLoadPreset.Location = New-Object System.Drawing.Point(520, 90)
$btnLoadPreset.Size = New-Object System.Drawing.Size(100, 30)
$btnLoadPreset.Text = "Load Preset"
$presetGroup.Controls.Add($btnLoadPreset)

$txtPreset = New-Object System.Windows.Forms.TextBox
$txtPreset.Location = New-Object System.Drawing.Point(10, 140)
$txtPreset.Size = New-Object System.Drawing.Size(500, 20)
$txtPreset.ReadOnly = $true
$presetGroup.Controls.Add($txtPreset)

function Add-PresetNodes {
    param(
        [System.Windows.Forms.TreeNode]$ParentNode,
        [string]$Path
    )

    Get-ChildItem -LiteralPath $Path -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        # Avoid following junctions/reparse points into cycles or outside the selected folder.
        if (($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) {
            $directoryNode = New-Object System.Windows.Forms.TreeNode($_.Name)
            $directoryNode.Tag = $_.FullName
            [void]$ParentNode.Nodes.Add($directoryNode)
            Add-PresetNodes -ParentNode $directoryNode -Path $_.FullName
        }
    }
    Get-ChildItem -LiteralPath $Path -Filter *.txt -File -ErrorAction SilentlyContinue | ForEach-Object {
        $fileNode = New-Object System.Windows.Forms.TreeNode($_.Name)
        $fileNode.Tag = $_.FullName
        [void]$ParentNode.Nodes.Add($fileNode)
    }
}

function Refresh-PresetTree {
    $treeViewPresets.Nodes.Clear()
    $folder = $txtPresetFolder.Text.Trim()
    if (-not $folder -or -not (Test-Path -LiteralPath $folder -PathType Container)) {
        return
    }

    Get-ChildItem -LiteralPath $folder -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        if (($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) {
            $directoryNode = New-Object System.Windows.Forms.TreeNode($_.Name)
            $directoryNode.Tag = $_.FullName
            [void]$treeViewPresets.Nodes.Add($directoryNode)
            Add-PresetNodes -ParentNode $directoryNode -Path $_.FullName
        }
    }
    Get-ChildItem -LiteralPath $folder -Filter *.txt -File -ErrorAction SilentlyContinue | ForEach-Object {
        $fileNode = New-Object System.Windows.Forms.TreeNode($_.Name)
        $fileNode.Tag = $_.FullName
        [void]$treeViewPresets.Nodes.Add($fileNode)
    }
    $treeViewPresets.ExpandAll()
}

$btnRefreshPresets.Add_Click({ Refresh-PresetTree })
$treeViewPresets.Add_NodeMouseDoubleClick({
    param($sender, $eventArgs)
    $path = [string]$eventArgs.Node.Tag
    if ($path -and (Test-Path -LiteralPath $path -PathType Leaf)) {
        $txtPreset.Text = $path
    }
})
$btnLoadPreset.Add_Click({
    $selectedNode = $treeViewPresets.SelectedNode
    if ($null -ne $selectedNode -and $selectedNode.Tag -and
        (Test-Path -LiteralPath ([string]$selectedNode.Tag) -PathType Leaf)) {
        $txtPreset.Text = [string]$selectedNode.Tag
    }
    else {
        [System.Windows.Forms.MessageBox]::Show(
            $script:form,
            "Select a .txt preset file first.",
            "No preset file selected",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
    }
})
Refresh-PresetTree

# -----------------------------------------------------------------------------
# Command buttons and output
# -----------------------------------------------------------------------------
$cmdGroup = New-Object System.Windows.Forms.GroupBox
$cmdGroup.Text = "Commands"
$cmdGroup.Location = New-Object System.Drawing.Point(10, 620)
$cmdGroup.Size = New-Object System.Drawing.Size(780, 70)
$script:form.Controls.Add($cmdGroup)

$commands = @("status", "scan", "pulse", "run", "set", "control")
$xPos = 10
foreach ($commandName in $commands) {
    $button = New-Object System.Windows.Forms.Button
    $button.Text = $commandName
    $button.Size = New-Object System.Drawing.Size(110, 30)
    $button.Location = New-Object System.Drawing.Point($xPos, 25)
    $button.Tag = $commandName
    $xPos += 120
    $cmdGroup.Controls.Add($button)
    $script:commandButtons[$commandName] = $button
}

$script:commandButtons["scan"].Enabled = $false
$toolTip = New-Object System.Windows.Forms.ToolTip
$toolTip.SetToolTip(
    $script:commandButtons["scan"],
    "Disabled: finite scan counts do not bound a blocked device read, and this GUI has no cooperative stop control. Use the CLI with finite iterations; a read may still block.")

$lblSafety = New-Object System.Windows.Forms.Label
$lblSafety.Location = New-Object System.Drawing.Point(10, 695)
$lblSafety.Size = New-Object System.Drawing.Size(780, 20)
$lblSafety.Text = "Simulation defaults to ON. control output defaults to OFF. This program does not verify physical output or safety."
$script:form.Controls.Add($lblSafety)

$lblOutput = New-Object System.Windows.Forms.Label
$lblOutput.Location = New-Object System.Drawing.Point(10, 720)
$lblOutput.Size = New-Object System.Drawing.Size(140, 20)
$lblOutput.Text = "Command Output:"
$script:form.Controls.Add($lblOutput)

$script:txtOutput = New-Object System.Windows.Forms.TextBox
$script:txtOutput.Location = New-Object System.Drawing.Point(10, 745)
$script:txtOutput.Size = New-Object System.Drawing.Size(780, 75)
$script:txtOutput.Multiline = $true
$script:txtOutput.ScrollBars = "Vertical"
$script:txtOutput.ReadOnly = $true
$script:form.Controls.Add($script:txtOutput)

$buttonClearOutput = New-Object System.Windows.Forms.Button
$buttonClearOutput.Location = New-Object System.Drawing.Point(690, 825)
$buttonClearOutput.Size = New-Object System.Drawing.Size(100, 24)
$buttonClearOutput.Text = "Clear Output"
$script:form.Controls.Add($buttonClearOutput)
$buttonClearOutput.Add_Click({ $script:txtOutput.Clear() })

$script:processTimer = New-Object System.Windows.Forms.Timer
$script:processTimer.Interval = 200
$script:processTimer.Add_Tick({
    Drain-OutputQueue
    if ($null -ne $script:activeProcess) {
        try {
            if ($script:activeProcess.HasExited) {
                # WaitForExit() also waits for async stdout/stderr callbacks to drain.
                $script:activeProcess.WaitForExit()
                Drain-OutputQueue
                $exitCode = $script:activeProcess.ExitCode
                Add-OutputLine -Text "s2 exited with code $exitCode."
                $script:activeProcess.remove_OutputDataReceived($script:stdoutHandler)
                $script:activeProcess.remove_ErrorDataReceived($script:stderrHandler)
                $script:activeProcess.Dispose()
                $script:activeProcess = $null
                $script:processTimer.Stop()
                Set-CommandButtonsEnabled -Enabled $true
            }
        }
        catch {
            Add-OutputLine -Text ("Process monitoring error: " + $_.Exception.Message)
            Add-OutputLine -Text "Process state is unknown; the GUI will keep blocking close rather than risk leaving a child process unmanaged."
            $script:processTimer.Stop()
            Set-CommandButtonsEnabled -Enabled $false
        }
    }
})

foreach ($button in $script:commandButtons.Values) {
    $button.Add_Click({
        param($sender, $eventArgs)
        Run-S2Command -CommandName ([string]$sender.Tag)
    })
}

$script:form.Add_FormClosing({
    param($sender, $eventArgs)
    if ($null -ne $script:activeProcess) {
        try {
            if (-not $script:activeProcess.HasExited) {
                [System.Windows.Forms.MessageBox]::Show(
                    $script:form,
                    "A command is still running. The GUI cannot send a safe interrupt, so closing is blocked until the process exits. Output shutdown is only best effort.",
                    "Command still running",
                    [System.Windows.Forms.MessageBoxButtons]::OK,
                    [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
                $eventArgs.Cancel = $true
            }
            else {
                $script:activeProcess.WaitForExit()
                $script:activeProcess.remove_OutputDataReceived($script:stdoutHandler)
                $script:activeProcess.remove_ErrorDataReceived($script:stderrHandler)
                $script:activeProcess.Dispose()
                $script:activeProcess = $null
            }
        }
        catch {
            $eventArgs.Cancel = $true
        }
    }
})

[void]$script:form.ShowDialog()

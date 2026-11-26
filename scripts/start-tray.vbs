' Launch Job Inbox tray (STA required for NotifyIcon)
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = dir & "\start-tray.ps1"
' Windows PowerShell 5.1 + STA — иначе иконка в трее часто не появляется
cmd = "powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """"
sh.Run cmd, 0, False

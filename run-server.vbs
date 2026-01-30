Set WinScriptHost = CreateObject("WScript.Shell")
' The 0 at the end hides the window entirely
WinScriptHost.Run "node " & Chr(34) & "C:\Users\Dewey\Documents\Scripts\VolumeBridge\server.js" & Chr(34), 0
Set WinScriptHost = CreateObject("WScript.Shell")

' Force the script to look at the project folder
WinScriptHost.CurrentDirectory = "C:\Users\Dewey\Documents\Scripts\VolumeBridge"

' Run npm start (which uses the local tsx in package.json)
' Use '0' hide to hide the window (1 makes it visible)
WinScriptHost.Run "cmd /c npm start", 0
; Run as Admin automatically
if not A_IsAdmin
{
   Run *RunAs "%A_ScriptFullPath%"
   ExitApp
}

#SingleInstance, Force
#InstallKeybdHook
#UseHook On  ; <--- This forces AHK to intercept keys at a lower level
SetBatchLines, -2

; --- 1. KEY INTERCEPTION ---
$Volume_Up::
    SoundSet, +2
    Gosub, UpdateVolume
Return

$Volume_Down::
    SoundSet, -2
    Gosub, UpdateVolume
Return

$Volume_Mute::
    SoundSet, +2, , Mute
    Gosub, UpdateVolume
Return

; --- 2. THE WATCHDOG (Kills Windows OSD) ---
SetTimer, KillOSD, 10
Return

KillOSD:
    IfWinExist, ahk_class NativeHWNDHost
    {
        WinSet, Transparent, 0, ahk_class NativeHWNDHost
        WinMove, ahk_class NativeHWNDHost, , -10000, -10000
    }
Return

; --- 3. SERVER UPDATE ---
UpdateVolume:
    SoundGet, vol, Master
    SoundGet, mute, Master, Mute
    vol := Round(vol)
    
    ; Send "Quietly" to server (don't wait for response)
    url := "http://127.0.0.1:8085/update?vol=" . vol . "&mute=" . mute
    try {
        whr := ComObjCreate("WinHttp.WinHttpRequest.5.1")
        whr.Open("GET", url, true) ; true = Async mode
        whr.Send()
    }
return
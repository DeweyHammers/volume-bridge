# VolumeBridge Server

A local Node.js middleware that bridges **HeadsetControl.exe** status (Battery, Connection) to a web overlay. It specifically monitors **Audeze Maxwell** headsets and handles connection drops or "Unavailable" battery states intelligently.

## 🚀 Quick Start

### 1\. Start the Server

Double-click **run-server.vbs** to start the server.

- **Invisible Mode:** Modify the script to use , 0 to hide the window.
- **Visible Mode:** Modify the script to use , 1 to show the console window.

### 2\. View Logs

Logs are automatically saved to server_logs.txt in the same folder.

- Tracks startup time, device switches, and battery updates.
- Tracks BATTERY_UNAVAILABLE errors and retry attempts.

## 🛑 How to Stop the Server

### Manual Force Kill (Admin Terminal)

If the server is stuck or running in the background, use these commands in an Administrator Command Prompt:

1.  netstat -ano | findstr :8085*Look for the number at the far right (e.g., 1234).*
2.  taskkill /F /PID _(Replace with the number you found in step 1)._

## ⚙️ Configuration & Features

### Volume Control Integration (`VolumeControl.ahk`)

The project includes an AutoHotkey script (`VolumeControl.ahk`) that enhances the volume management experience:

- **OSD Suppression:** It automatically detects and hides the default Windows Volume OSD (On-Screen Display) to provide a cleaner interface.
- **Data Synchronization:** When volume keys (Up, Down, Mute) are pressed, the script intercepts the input, updates the system volume, and immediately sends the new state (volume level and mute status) to the local server via an asynchronous HTTP GET request to `http://127.0.0.1:8085/update`.
- **iCue / Web Overlay Support:** The server receives this data and broadcasts it via Socket.io. This allows web-based overlays—such as an **XENEON EDGE Iframe** or a custom browser source to react in real-time to volume changes, enabling a fully customized and integrated volume UI.

### Battery Retry Logic

The server checks battery levels every **10 minutes**.

- **Smart Retry:** If the headset returns BATTERY_UNAVAILABLE (common on Audeze Maxwells), the server retries **10 times** (every 20 seconds).
- **Fail-Safe:** If all 10 retries fail, it stops checking until the next 5-minute cycle to prevent log spam.

### Files

- server.js: Main logic.
- HeadsetControl.exe: Third-party tool used to query device data.
- run-server.vbs: Script to launch the server silently or with a visible window.
- server_logs.txt: Auto-generated log history.

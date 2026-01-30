import express from "express";
import http from "http";
import { Server } from "socket.io";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import dayjs from "dayjs";

// --- LOGGING TO FILE SETUP ---
const logFile = path.join(__dirname, "server_logs.txt");
const logStream = fs.createWriteStream(logFile, { flags: "a" }); // 'a' means append

// Write a startup header with the date
const startupHeader =
  `\n========================================\n` +
  `SERVER START: ${dayjs().format("YYYY-MM-DD HH:mm:ss")}\n` +
  `========================================\n`;
logStream.write(startupHeader);

// Redirect console to both the terminal and the file
const originalLog = console.log;
const originalError = console.error;

console.log = function (...args) {
  const msg = `[${dayjs().format("HH:mm:ss")}] ${args.join(" ")}\n`;
  logStream.write(msg);
  originalLog.apply(console, args);
};

console.error = function (...args) {
  const msg = `[${dayjs().format("HH:mm:ss")}] ERROR: ${args.join(" ")}\n`;
  logStream.write(msg);
  originalError.apply(console, args);
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const DATA_FILE = path.join(__dirname, "volume_data.json");
const SVV_PATH = path.join(__dirname, "SoundVolumeView.exe");
const HC_PATH = path.join(__dirname, "HeadsetControl.exe");

app.use(express.static(__dirname));

// --- GLOBAL TRAFFIC COP ---
let systemBusy = false;

interface Profile {
  vol: string | number | qs.ParsedQs | (string | qs.ParsedQs)[];
  mute: string | qs.ParsedQs | (string | qs.ParsedQs)[];
}

let memory: {
  currentDev: string;
  battery: string;
  profiles: Record<string, Profile>;
} = {
  currentDev: "Detecting...",
  battery: "--",
  profiles: {},
};

// --- STARTUP: CLEANUP & LOAD ---
if (fs.existsSync(DATA_FILE)) {
  try {
    memory = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    console.error(e);
  }
}

try {
  const files = fs.readdirSync(__dirname);
  for (const file of files) {
    if (file.startsWith("dump_") && file.endsWith(".csv")) {
      fs.unlinkSync(path.join(__dirname, file));
    }
  }
} catch (e) {}

let saveTimeout: NodeJS.Timeout | null = null;
function saveToDisk() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    fs.writeFile(DATA_FILE, JSON.stringify(memory, null, 2), (err) => {});
  }, 2000);
}

// --- 1. BATTERY CHECKER (With "Unavailable" Retry Logic) ---
function checkBattery(retryCount = 0) {
  // Device Validation
  if (
    !memory.currentDev.includes("Maxwell") &&
    !memory.currentDev.includes("Audeze")
  ) {
    return;
  }

  if (retryCount === 0) console.log("CHECKING BATTERY...");

  if (systemBusy) {
    console.log("System busy. Retrying Battery Check in 1s...");
    setTimeout(() => checkBattery(retryCount), 1000);
    return;
  }

  systemBusy = true;

  execFile(HC_PATH, ["-b"], (error, stdout, stderr) => {
    systemBusy = false;

    // --- UNAVAILABLE / ERROR LOGIC ---
    if (
      stdout.includes("BATTERY_UNAVAILABLE") ||
      stdout.includes("Error") ||
      error
    ) {
      console.log(`[Attempt ${retryCount + 1}/10] Battery UNAVAILABLE.`);
      if (retryCount < 10) {
        console.log(">> Retrying in 20 seconds...");
        setTimeout(() => checkBattery(retryCount + 1), 20000);
      } else {
        console.log(
          ">> Max retries (10) reached. Giving up until next scheduled cycle."
        );
      }
      return;
    }

    // --- SUCCESS LOGIC ---
    if (!error && stdout) {
      const levelMatch = stdout.match(/Level:\s*(\d+)%/);
      const newLevel = levelMatch ? levelMatch[1] : null;

      if (newLevel) {
        if (retryCount > 0) {
          console.log(`>> Success on attempt ${retryCount + 1}!`);
        }

        if (memory.battery !== newLevel) {
          console.log(`BATTERY UPDATE: ${newLevel}%`);
          memory.battery = newLevel;
          io.emit("state-change", getCurrentState());
          saveToDisk();
        } else {
          console.log(`Battery current level has not changed.`);
        }
      }
    }
  });
}

// Run every 10 minutes (600,000)
// This starts a fresh check with retryCount = 0
setInterval(checkBattery, 600000);

// --- 2. HELPERS ---
function cleanName(rawName: string) {
  if (!rawName || rawName.length < 2) return null;
  if (rawName.includes("Logitech G560")) return "Logitech G560";
  if (rawName.includes("Audeze Maxwell")) return "Audeze Maxwell";
  return rawName.replace(/^Speakers \((.*)\)$/, "$1").trim();
}

function getCurrentState() {
  const dev = memory.currentDev;
  const profile = memory.profiles[dev] || { vol: 0, mute: "Off" };
  const isHeadphone = dev.includes("Maxwell") || dev.includes("Audeze");

  return {
    dev: dev,
    vol: profile.vol,
    mute: profile.mute,
    batt: isHeadphone ? memory.battery : "--",
  };
}

// --- 3. DEVICE WATCHER ---
function checkDevice() {
  if (systemBusy) return;

  systemBusy = true;
  const tempDumpFile = `./dump_${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 5)}.csv`;

  execFile(SVV_PATH, ["/scomma", tempDumpFile], (error) => {
    try {
      if (!error && fs.existsSync(tempDumpFile)) {
        const content = fs.readFileSync(tempDumpFile, "utf8");

        try {
          fs.unlinkSync(tempDumpFile);
        } catch (e) {}

        const lines = content.split("\n");
        let foundName = null;

        for (const line of lines) {
          const parts = line.split(",");
          if (parts.length < 5) continue;

          const name = parts[0];
          const type = parts[1];
          const direction = parts[2];
          const deviceName = parts[3];
          const isDefault = parts[4];

          if (
            type === "Device" &&
            direction === "Render" &&
            isDefault &&
            isDefault.includes("Render")
          ) {
            foundName = deviceName || name;
            break;
          }
        }

        if (foundName) {
          const prettyName = cleanName(foundName);
          if (prettyName && prettyName !== memory.currentDev) {
            console.log(`SWITCHED: ${memory.currentDev} -> ${prettyName}`);
            memory.currentDev = prettyName;

            // Trigger Battery Check Immediately on Switch
            if (
              prettyName.includes("Maxwell") ||
              prettyName.includes("Audeze")
            ) {
              console.log(
                ">> Maxwell Switch Detected: Triggering immediate battery check..."
              );
              // calling checkBattery(0) here will hit the 'systemBusy' lock
              // inside checkBattery, causing it to retry in 1s.
              checkBattery(0);
            }

            if (!memory.profiles[prettyName])
              memory.profiles[prettyName] = { vol: 50, mute: "Off" };
            io.emit("state-change", getCurrentState());
            saveToDisk();
          }
        }
      }
    } catch (err) {
      console.log("Error in checkDevice:", err);
      try {
        if (fs.existsSync(tempDumpFile)) fs.unlinkSync(tempDumpFile);
      } catch (e) {}
    } finally {
      // CRITICAL: Always unlock
      systemBusy = false;
    }
  });
}

// --- STARTUP DELAY ---
setTimeout(() => {
  console.log("Starting Device Polling...");
  setInterval(checkDevice, 3000);

  checkDevice();
  // Stagger battery check by 1.5s to avoid startup collision
  setTimeout(checkBattery, 1500);
}, 5000);

app.get("/update", (req, res) => {
  const { vol, mute } = req.query;
  const dev = memory.currentDev;
  let changed = false;

  if (!memory.profiles[dev]) memory.profiles[dev] = { vol: 0, mute: "Off" };
  if (vol !== undefined && memory.profiles[dev].vol != vol) {
    memory.profiles[dev].vol = vol;
    changed = true;
  }
  if (mute !== undefined && memory.profiles[dev].mute != mute) {
    memory.profiles[dev].mute = mute;
    changed = true;
  }

  if (changed) {
    io.emit("state-change", getCurrentState());
    saveToDisk();
  }
  res.sendStatus(200);
});

io.on("connection", (socket) => {
  socket.emit("state-change", getCurrentState());
});

server.listen(8085, "0.0.0.0", () => console.log("Server running on :8085"));

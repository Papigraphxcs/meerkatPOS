import { app, BrowserWindow, ipcMain, shell, session } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { initDatabase, closeDatabase } from "./database/dbService";
import { registerDbHandlers } from "./database/ipcHandlers";
import { initRealtimeStock, disconnectRealtime } from "./sync/realtimeStock";
import { initAutoUpdater, stopAutoUpdater } from "./autoUpdater";
import { startHubServer, stopHubServer } from "./hub/hubServer";
import { initTillClient, runTillSync, pingHub } from "./hub/tillClient";
import { type NodeRole } from "./hub/nodeConfig";
import { getMeta, setMeta } from "./database/dbService";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store ref so it won't be GC'd
let mainWindow: BrowserWindow | null = null;

// Server URL – set via env or stored settings
const SERVER_URL = process.env.XPOS_SERVER_URL || "http://localhost:8000";

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: "X POS",
    icon: path.join(__dirname, "../public/pwa-512x512.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    autoHideMenuBar: true,
    show: false,
  });

  // Show when ready to avoid white flash
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    // Dev mode: load Vite dev server
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    // Production: load built files
    mainWindow.loadFile(path.join(__dirname, "../dist/index.electron.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── IPC Handlers ──────────────────────────────────────────────────

// Return server URL to renderer
ipcMain.handle("get-server-url", () => SERVER_URL);

// Return platform info
ipcMain.handle("get-platform-info", () => ({
  platform: process.platform,
  arch: process.arch,
  version: app.getVersion(),
  isElectron: true,
}));

// Set server URL (from login/settings screen)
ipcMain.handle("set-server-url", (_event, url: string) => {
  process.env.XPOS_SERVER_URL = url;
  return true;
});

// Set session cookie for authenticated API calls
ipcMain.handle(
  "set-auth-cookie",
  async (_event, cookies: { name: string; value: string; domain: string }[]) => {
    const ses = session.defaultSession;
    for (const cookie of cookies) {
      await ses.cookies.set({
        url: SERVER_URL,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
      });
    }
    return true;
  }
);

// Clear cookies on logout
ipcMain.handle("clear-auth", async () => {
  const ses = session.defaultSession;
  const cookies = await ses.cookies.get({ url: SERVER_URL });
  for (const cookie of cookies) {
    await ses.cookies.remove(SERVER_URL, cookie.name);
  }
  disconnectRealtime();
  return true;
});

// Start real-time stock connection (called after auth)
ipcMain.handle("start-realtime", async () => {
  try {
    await initRealtimeStock(process.env.XPOS_SERVER_URL || SERVER_URL);
    return true;
  } catch {
    return false;
  }
});

// ── Hub / Till Role IPC ───────────────────────────────────────────

let currentRole: NodeRole = "hub";
let tillSyncInterval: ReturnType<typeof setInterval> | null = null;

ipcMain.handle("node:get-role", () => currentRole);

ipcMain.handle("node:set-role", async (_event, config: {
  role: NodeRole;
  hubUrl?: string;
  tillId?: string;
  hubApiPort?: number;
}) => {
  try {
    currentRole = config.role;
    await setMeta("node_role", config.role);

    if (config.role === "hub") {
      // Stop till sync if running
      if (tillSyncInterval) { clearInterval(tillSyncInterval); tillSyncInterval = null; }
      const port = config.hubApiPort || 6789;
      await setMeta("hub_api_port", String(port));
      await startHubServer(port);
    } else {
      // Stop hub server if running
      await stopHubServer();
      const hubUrl = config.hubUrl || "http://localhost:6789";
      const tillId = config.tillId || "TILL-01";
      await setMeta("hub_url", hubUrl);
      await setMeta("till_id", tillId);
      initTillClient(hubUrl, tillId);
      // Start periodic till sync (every 30 seconds)
      if (tillSyncInterval) clearInterval(tillSyncInterval);
      tillSyncInterval = setInterval(async () => {
        try { await runTillSync(); } catch (e) {
          console.error("[TillSync]", e instanceof Error ? e.message : e);
        }
      }, 30_000);
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle("node:ping-hub", async () => pingHub());

ipcMain.handle("node:trigger-till-sync", async () => {
  try {
    const result = await runTillSync();
    return { success: true, ...result };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// ── App Lifecycle ─────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Initialize local MariaDB connection + schema
  try {
    await initDatabase();
    console.log("[Main] Local MariaDB initialized");

    // Restore hub/till role from settings
    const savedRole = await getMeta("node_role");
    currentRole = (savedRole === "till" ? "till" : "hub") as NodeRole;

    if (currentRole === "hub") {
      const portStr = await getMeta("hub_api_port");
      const port = portStr ? Number(portStr) : 6789;
      startHubServer(port).catch((e) =>
        console.error("[Main] Hub server failed to start:", e)
      );
    } else {
      const hubUrl = (await getMeta("hub_url")) || "http://localhost:6789";
      const tillId = (await getMeta("till_id")) || "TILL-01";
      initTillClient(hubUrl, tillId);
      tillSyncInterval = setInterval(async () => {
        try { await runTillSync(); } catch { /* logged inside */ }
      }, 30_000);
    }
  } catch (err) {
    console.error("[Main] MariaDB init failed — app will run without local DB:", err);
  }

  // Register database IPC handlers
  registerDbHandlers();

  // Initialize auto-updater (checks for updates on start + periodically)
  initAutoUpdater();

  createWindow();

  // macOS: re-create window when dock icon clicked
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows closed (except macOS)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Clean up DB pool on quit
app.on("will-quit", async () => {
  stopAutoUpdater();
  if (tillSyncInterval) { clearInterval(tillSyncInterval); tillSyncInterval = null; }
  await stopHubServer();
  await closeDatabase();
});

// Security: limit navigation to expected origins
app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (event, url) => {
    const allowed = [
      SERVER_URL,
      process.env.VITE_DEV_SERVER_URL || "",
      "file://",
    ].filter(Boolean);

    if (!allowed.some((origin) => url.startsWith(origin))) {
      event.preventDefault();
    }
  });
});

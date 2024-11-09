const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const squirrelStartup = require('electron-squirrel-startup');

if (squirrelStartup) {
  app.quit();
}

let mainWindow;

let blacklist = ['localhost', '127.0.0.1'];
let dcVersion;
let browserUserAgent;
const response = fetch('https://api.zamakowany.pl/getDcInfo').then(res => res.json()).then(data => {
  dcVersion = data.dcVersion;
  browserUserAgent = data.browserUserAgent;
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  mainWindow.webContents.openDevTools(); // Otwórz narzędzia deweloperskie

  session.defaultSession.clearCache().then(() => {
    console.log("Cache cleared");
  });

  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['Cookie'] = '';
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Set-Cookie': null
      }
    });
  });
  mainWindow.loadURL(`file://${__dirname}/index.html`).then(() => {
    console.log('index.html loaded successfully');
  }).catch((err) => {
    console.error('Failed to load index.html:', err);
  });

  // Sprawdź aktualizacje po utworzeniu okna
  autoUpdater.checkForUpdatesAndNotify();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.on('open-proxy-window', (event, { n, proxyUser, proxyPass, dcToken }) => {
  console.log('New proxy window:', n, proxyUser);
  const newSession = session.fromPartition(`persist:proxy-session-${n}`);
  newSession.setProxy({ proxyRules: 'p.webshare.io:80' })
    .then(() => {
      const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
          session: newSession,
          nodeIntegration: true,
          contextIsolation: true,
          enableRemoteModule: false,
          webSecurity: false,
          preload: path.join(__dirname, 'preload.js')
        }
      });

      win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        const headers = { ...details.responseHeaders };
        const removedHeaders = [];
        for (const key of Object.keys(headers)) {
          if (key.toLowerCase().includes('content-security-policy')) {
            removedHeaders.push(key);
            delete headers[key];
          }
        }
        if (removedHeaders.length > 0) { console.log("CSP headers removed:", removedHeaders); };

        callback({
          cancel: false,
          responseHeaders: headers,
        });
      });

      win.webContents.on('login', (event, details, authInfo, callback) => {
        const username = proxyUser + n;
        callback(username, proxyPass);
        console.log('Proxy login:', username);
      });

      win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
        if (blacklist.some(domain => details.url.includes(domain))) {
          console.log('Blocked:', details.url);
          callback({ cancel: true });
        } else {
          callback({ cancel: false });
        }
      });

      win.loadURL("https://discord.com/").then(() => {
        console.log('Main page loaded');
        setTimeout(() => {
          win.webContents.send('localStorage-clear');
          setTimeout(() => {
            win.webContents.send('localStorage-set', 'token', dcToken);
            console.log('Token set');

            setTimeout(() => {
              win.loadURL("https://discord.com/login");
              console.log('/login loaded');
            }, 1000);
          }, 500);
        }, 1000);
      });

      win.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
        details.requestHeaders['User-Agent'] = browserUserAgent;

        if (details.requestHeaders['X-Super-Properties']) {
          let superProperties = Buffer.from(details.requestHeaders['X-Super-Properties'], 'base64').toString('utf-8');
          superProperties = JSON.parse(superProperties);

          let client_build_number = superProperties['client_build_number'];

          superProperties = {
            "os": "Windows",
            "browser": "Chrome",
            "device": "",
            "system_locale": "pl-PL",
            "browser_user_agent": `"${browserUserAgent}"`,
            "browser_version": `"${dcVersion}"`,
            "os_version": "10",
            "referrer": "https://discord.com/",
            "referring_domain": "discord.com",
            "referrer_current": "",
            "referring_domain_current": "",
            "release_channel": "stable",
            "client_build_number": client_build_number,
            "client_event_source": null
          };
          details.requestHeaders['X-Super-Properties'] = Buffer.from(JSON.stringify(superProperties)).toString('base64');
        }

        callback({ cancel: false, requestHeaders: details.requestHeaders });
      });

      win.on('closed', () => {
        newSession.setProxy({ proxyRules: '' });
      });
    })
    .catch((error) => {
      console.error("Proxy set error:", error);
    });
});
const { app, BrowserWindow, ipcMain, session, Menu } = require('electron');
const path = require('path');
const log = require('electron-log');
const { autoUpdater } = require('electron-updater');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const squirrelStartup = require('electron-squirrel-startup');

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('App starting...');
log.info('App version:', app.getVersion());

let template = [];
if (process.platform === 'darwin') {
  // OS X
  const name = app.getName();
  template.unshift({
    label: name,
    submenu: [
      {
        label: 'About ' + name,
        role: 'about'
      },
      {
        label: 'Quit',
        accelerator: 'Command+Q',
        click() { app.quit(); }
      },
    ]
  });
}

let mainWindow;

function sendStatusToWindow(text) {
  log.info(text);
  mainWindow.webContents.send('message', text);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  session.defaultSession.clearCache().then(() => {
    log.info("Cache cleared");
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

  mainWindow.loadFile(path.join(__dirname, 'index.html')).then(() => {
    log.info('index.html loaded successfully');
  }).catch((err) => {
    log.error('Failed to load index.html:', err);
  });

  autoUpdater.checkForUpdatesAndNotify();
}

autoUpdater.on('checking-for-update', () => {
  sendStatusToWindow('Checking for update...');
});
autoUpdater.on('update-available', (info) => {
  sendStatusToWindow('Update available.');
});
autoUpdater.on('update-not-available', (info) => {
  sendStatusToWindow('Update not available.');
});
autoUpdater.on('error', (err) => {
  sendStatusToWindow('Error in auto-updater. ' + err);
});
autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  sendStatusToWindow(log_message);
});
autoUpdater.on('update-downloaded', (info) => {
  sendStatusToWindow('Update downloaded');
});

app.on('ready', function() {
  // Create the Menu
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

if (squirrelStartup) {
  app.quit();
}

let blacklist = ['localhost', '127.0.0.1'];
let dcVersion;
let browserUserAgent;
let proxyUrl;

const response = fetch('https://api.zamakowany.pl/getDcInfo').then(res => res.json()).then(data => {
  dcVersion = data.dcVersion;
  browserUserAgent = data.browserUserAgent;
});

ipcMain.on('open-proxy-window', (event, { n, proxyUser, proxyPass, proxyUrl, dcToken }) => {
  log.info('New proxy window:', n, proxyUser, proxyUrl);
  const newSession = session.fromPartition(`persist:proxy-session-${n}`);
  newSession.setProxy({ proxyRules: proxyUrl })
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

        callback({
          cancel: false,
          responseHeaders: headers,
        });
      });

      win.webContents.on('login', (event, details, authInfo, callback) => {
        const username = proxyUser + n;
        log.info('Proxy login:', username);
        callback(username, proxyPass);
      });

      win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
        if (blacklist.some(domain => details.url.includes(domain))) {
          log.info('Blocked:', details.url);
          callback({ cancel: true });
        } else {
          callback({ cancel: false });
        }
      });

      win.loadURL("https://discord.com").then(() => {
        log.info('Main page loaded');
        setTimeout(() => {
          win.webContents.send('localStorage-clear');
          setTimeout(() => {
            win.webContents.send('localStorage-set', 'token', dcToken);
            log.info('Token set');
            setTimeout(() => {
              win.loadURL("https://discord.com/login");
              log.info('/login loaded');
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
      log.error("Proxy set error:", error);
    });
});
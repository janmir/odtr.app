const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const Tray = electron.Tray; 
const Menu = electron.Menu;
const path = require('path');
const url = require('url');

var mainWindow;
var appTray;
var args = process.argv;

console.log("Arguments:");
console.log(args);

function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 380, 
    height: 230,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    // backgroundColor: "#181516" ,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true   
  });

  // and load the index.html of the app.
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  //Set Context menu
  appTray = new Tray(path.join(__dirname, '/static/favicon-16x16.png'));
  var contextMenu = Menu.buildFromTemplate([{
          label: 'Show odtr.app', click: ()=>{
            mainWindow.show();
      }},{
          label: 'Quit odtr.app', click: ()=>{
              app.isQuiting = true;
              app.quit();
      }}
  ]);
  appTray.setContextMenu(contextMenu);

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    mainWindow = null
  });

  /*mainWindow.on('minimize', function (event) {
    event.preventDefault()
    mainWindow.hide();
  });*/

  /*mainWindow.on('show', function () {
    appTray.setHighlightMode('selection');
    appTray.setToolTip("odtr.App");
  });*/

  // Open the DevTools.
  if(args.includes("--debug")){
    mainWindow.webContents.openDevTools()
  }

  //save to app
  app.mainWindow = mainWindow;
}

app.on('ready', createWindow)
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
  if (mainWindow === null) {
    createWindow();
  }else{
    mainWindow.show();
  }
})

global.app = app;
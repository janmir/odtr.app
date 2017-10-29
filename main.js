const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const Tray = electron.Tray; 
const Menu = electron.Menu;
const path = require('path');
const url = require('url');

var mainWindow;
var args = process.argv;

console.log("Arguments:");
console.log(args);

function createWindow () {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 360, 
    height: 220,
    frame: false,
    transparent: false,
    backgroundColor: "#181516" ,
    resizable: false   
  });

  // and load the index.html of the app.
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  //Set Context menu
  var appTray = new Tray(path.join(__dirname, '/static/favicon-16x16.png'));
  var contextMenu = Menu.buildFromTemplate([
      {
          label: 'Show App', click: ()=>{
            mainWindow.show();
          }
      },{
          label: 'Quit', click: ()=>{
              app.isQuiting = true;
              app.quit();
          }
      }
  ])
  appTray.setContextMenu(contextMenu);

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    mainWindow = null
  });

  mainWindow.on('minimize', function (event) {
    event.preventDefault()
    mainWindow.hide();
  });

  mainWindow.on('show', function () {
    appTray.setHighlightMode('selection');
    // appTray.setTitle("ODTR App");
    appTray.setToolTip("odtr.App");
    appTray.displayBalloon({
      title: "odtr.App",
      content: "Hello world? I'm just here.",
      //icon: ""
    });
  });

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
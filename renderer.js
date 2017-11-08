const m = require("mithril");
const anime = require("animejs");
const fs = require('fs');
const remote = require('electron').remote;
const application = remote.getGlobal("app");
const path = require('path');
const url = require('url');
const moment = require('moment-timezone');
const transform = require('moment-transform');
const yaml = require('js-yaml');
const jaml = require('json2yaml');
const schedule = require('node-schedule');
const os = require('os');
const NodeNotifier = require('node-notifier');
const WindowsToaster = require('node-notifier').WindowsToaster;
const isOnline = require('is-online');
const child = require('child_process').execFile;

/******************* Globals ********************/
var urls = {
    WAKE_UP: "https://api.janmir.me/aws-odtr-v2/wakeup",
    LOGIN: "https://api.janmir.me/aws-odtr-v2/login",
    CHECK: "https://api.janmir.me/aws-odtr-v2/check",
    TIME_IN_OUT:"https://api.janmir.me/aws-odtr-v2/bitmenot",
    HOLIDAY_LIST: "https://api.janmir.me/holiday/list",
    HOLIDAY_TODAY: "https://api.janmir.me/holiday/today"
};

var paths = {
    CONFIG_FILE: "user.yaml",
    NOTIFICATION_ICON: "android-chrome-192x192.png",
    NOTIFICATION_EXE: "SnoreToast.exe",

    get: (file)=>{
        let dir = application.getPath("userData");
        let pat = path.join(dir, file);

        return pat;
    },
    getStatic: (file)=>{
        let dir = __dirname + "/static";
        let pat = path.join(dir, file);

        return pat;
    },
    getCurrent: (file)=>{
        let dir = __dirname;
        let pat = path.join(dir, file);

        return pat;
    }
}

var svg = {
    logo: null,
    login: null,
    icon: null,
    init: ()=>{
        svg.logo = svg.getSVG('./static/logo.svg');
        svg.login = svg.getSVG('./static/login.svg');
        svg.icon = svg.getSVG('./static/icon_big.svg');
    },
    getSVG: (path)=>{
        let _svg = fs.readFileSync(path, 'utf8');
        return m.trust(_svg);
    }
};

var fn = {
    notifier: null,
    maxTry: 5,
    reSpawn: 0,

    //handles
    handle_loginCredentials: 0,
    handle_wakeupAsync: 0,
    handle_onlineAsync: 0,
    handle_timeInOut: 0,
    handle_checkLogin: 0,

    checkCredentials: (timeout=0)=>{
        Toast.show("Looking for saved credentials.");
        
        return new Promise((resolve, reject) => {
            
            let yaml_file = paths.get(paths.CONFIG_FILE);
            let out = {type: fn.checkCredentials.name};
            
            try {
                let data = fn.localYamlJson(yaml_file);

                if(data.credentials.username === null && data.credentials.password === null){
                    out.result = false;
                    out.message = "Username and password not yet set.";
                }else{
                    out.result = true;
                    out.data = data;
                }          
            } catch (error) {
                out.result = false;

                if (error instanceof URIError){
                    console.log("create file");
                    
                    fn.saveCredentials({
                        credentials:{
                            username: null,
                            password: null
                        }
                    }).then((res)=>{
                        console.log(res);
                    });

                    out.message = "File does not exists."
                }else{
                    out.message = error.message;
                }
            }

            setTimeout(()=>{
                resolve(out);
            },timeout);
        });
    },
    saveCredentials: (json)=>{
        return new Promise((resolve, reject) => {
            let yaml_file = paths.get(paths.CONFIG_FILE);
            let out = {type:fn.saveCredentials.name};
            
            try {
                let data = fn.localJsonYaml(yaml_file, json, true);
                out.result = true;
                out.data = data;
            } catch (error) {
                out.result = false;
                out.message = error.message;
            }
            resolve(out);
        });
    },
    loginCredentials: (username, password)=>{
        return new Promise((resolve, reject) => {
            let out = {type: fn.loginCredentials.name};
            
            try {
                let counter = 0;
                let skip = false;

                handle_loginCredentials = setInterval(()=>{
                    counter++;
                    console.log("Trying to Login: " + counter);

                    if(counter > fn.maxTry){
                        //clear
                        clearInterval(handle_loginCredentials);

                        //alert
                        out.result = false;
                        out.message = "Timeout maxed!";
                        
                        resolve(out);
                    }

                    if(!skip){
                        skip = true;

                        m.request({
                            method: "GET",
                            url: urls.LOGIN,
                            background: true,
                            data: {
                                username: username,
                                password: password
                            }
                        })
                        .then(function(result) {
                            console.log()
                            if(result.result !== undefined){
                                //set data
                                result.username = username;
                                result.password = password;
                                out = Object.assign({}, out, result);

                                //clear
                                clearInterval(handle_loginCredentials);

                                //return
                                resolve(out);
                            }
                            
                            skip = false;
                        });
                    }
                }, 5000);

            } catch (error) {
                out.result = false;
                out.message = error.message;
                
                resolve(out);
            }
        });
    },
    wakeupAsync: (timeout=1000)=>{
        _.ODTR_CHECK_OVERRIDE = true;
        Toast.show("Checking ODTR availability..", -1);        
        
        return new Promise((resolve, reject) => {
            let counter = 0;
            handle_wakeupAsync = setInterval(function(){
                if(!_.ODTR_AVAILABLE){

                    if(_.ODTR_CHECK_OVERRIDE || counter == 60 * 10){//per 10 minute check
                        console.log("Counter: " + counter);
                        
                        _.ODTR_CHECK_OVERRIDE = false;

                        m.request({
                            method: "GET",
                            url: urls.WAKE_UP,
                            background: true
                        })
                        .then(result => {
                            if(result.result !== undefined){
                                if(result.result){    
                                    //hide
                                    Loading.hide();
    
                                    //Stop recheck
                                    clearInterval(handle_wakeupAsync);
        
                                    //Set global state
                                    _.ODTR_AVAILABLE = true;
    
                                    //resolve
                                    setTimeout(()=>{
                                        resolve(true);  
                                    },timeout);
                                }else{
                                    //display no internet loading screen
                                    Loading.show("ODTR is DOWN!");
                                    Loading.animate();
    
                                    _.ODTR_AVAILABLE = false;
                                }
                            }else{
                                _.ODTR_CHECK_OVERRIDE = true;                                
                            }
                        })
                        .catch((error)=>{
                            console.log("%cError occured on ODTR check!", "color: darkred; font-weight: bold;");

                            Loading.show("ODTR is DOWN!");
                            Loading.animate();
                        });
    
                        counter = 0;
                    } else{                        
                        counter++;
                    }
                }else{
                    //Stop recheck
                    clearInterval(handle_wakeupAsync);
                }
            }, 1000);
        });
    },
    onlineAsync: (timeout=1000)=>{
        _.ONLINE_CHECK_OVERRIDE = true;
        Toast.show("Checking internet connection..");        

        return new Promise((resolve, reject) => {
            let counter = 0;
            handle_onlineAsync = setInterval(function(){
                if(!_.INTERNET_CONNECTED){

                    if(_.ONLINE_CHECK_OVERRIDE || counter == 60 * 5){//per minute check
                        console.log("Counter: " + counter);
                        
                        _.ONLINE_CHECK_OVERRIDE = false;

                        isOnline().then(online => {
                            if(online){    
                                //hide
                                Loading.hide();

                                //Stop recheck
                                clearInterval(handle_onlineAsync);
    
                                //Set global state
                                _.INTERNET_CONNECTED = true;

                                //resolve
                                setTimeout(()=>{
                                    resolve(true);  
                                },timeout);
                            }else{
                                //display no internet loading screen
                                Loading.show();
                                Loading.animate();

                                _.INTERNET_CONNECTED = false;
                            }
                        })
                        .catch(()=>{
                            console.log("%cError occured on internet check!", "color: darkred; font-weight: bold;");                            

                            Loading.show();
                            Loading.animate();
                    });
    
                        counter = 0;
                    } else{                        
                        counter++;
                    }
                }else{
                    //Stop recheck
                    clearInterval(handle_onlineAsync);
                }
            }, 1000);
        });
    },
    timeInOut: ()=>{
        return new Promise((resolve, reject) => {
            let out = {type: fn.checkLogin.name};
            
            try {
                let counter = 0;
                let skip = false;
                handle_timeInOut = setInterval(()=>{
                    counter++;
                    console.log("Trying to timein/timeout: " + counter);

                    if(counter > fn.maxTry){
                        //clear
                        clearInterval(handle_timeInOut);

                        //alert
                        out.result = false;
                        out.message = "Timeout maxed!";
                        
                        resolve(out);
                    }

                    if(!skip){
                        skip = true;

                        m.request({
                            method: "GET",
                            url: urls.TIME_IN_OUT,
                            background: true,
                            data: {
                                username: username,
                                password: password
                            }
                        })
                        .then(function(result) {
                            console.log()
                            if(result.result !== undefined){
                                //set data
                                result.username = username;
                                result.password = password;
                                out = Object.assign({}, out, result);

                                //clear
                                clearInterval(handle_timeInOut);

                                //return
                                resolve(out);
                            }
                            
                            skip = false;
                        });
                    }
                }, 5000);

            } catch (error) {
                out.result = false;
                out.message = error.message;
                
                resolve(out);
            }
        });
    },
    holidayToday: ()=>{
        return new Promise((resolve, reject) => {
            let out = {type: fn.holidayToday.name};
            try {
                m.request({
                    method: "GET",
                    url: urls.HOLIDAY_TODAY,
                    background: true
                })
                .then(function(result) {
                    out = Object.assign({}, out, result);

                    resolve(out);
                });

            } catch (error) {
                out.message = error.message;
                out.result = false;

                resolve(out);
            }
        });
    },
    checkLogin: (username, password)=>{
        return new Promise((resolve, reject) => {
            let out = {type: fn.checkLogin.name};
            
            try {
                let counter = 0;
                let skip = false;

                handle_checkLogin = setInterval(()=>{
                    counter++;
                    console.log("Trying to check: " + counter);

                    if(counter > fn.maxTry){
                        //clear
                        clearInterval(handle_checkLogin);

                        //alert
                        out.result = false;
                        out.message = "Timeout maxed!";
                        
                        resolve(out);
                    }

                    if(!skip){
                        skip = true;

                        m.request({
                            method: "GET",
                            url: urls.CHECK,
                            background: true,
                            data: {
                                username: username,
                                password: password
                            }
                        })
                        .then(function(result) {
                            console.log()
                            if(result.result !== undefined){
                                //set data
                                result.username = username;
                                result.password = password;
                                out = Object.assign({}, out, result);

                                //clear
                                clearInterval(handle_checkLogin);

                                //return
                                resolve(out);
                            }
                            
                            skip = false;
                        });
                    }
                }, 5000);

            } catch (error) {
                out.result = false;
                out.message = error.message;
                
                resolve(out);
            }
        });
    },
    localYamlJson: (yaml_file)=>{
        //Get from local file
        if(fs.existsSync(yaml_file)){
            let file = fs.readFileSync(yaml_file, 'utf8')
            let config = yaml.safeLoad(file);
            let indentedJson = JSON.stringify(config, null, 4);

            return JSON.parse(indentedJson);
        }else{
            throw new URIError("File Not Found");
        }
    },
    localJsonYaml: (yaml_file, json, override=false)=>{
        //Get from local file
        if(override || fs.existsSync(yaml_file)){
            let data = jaml.stringify(json);
            let file = fs.writeFileSync(yaml_file, data);

            return data;
        }else{
            throw new URIError("File Not Found");
        }
    },
    now: (which, separator=':', offset = '+0')=>{
        let value = -1;
        let mom = moment().tz('Asia/Tokyo');
        switch(which){
          case "time":{
            value = mom.format('hh'+separator+'mm A');
          }break;
          case "day":{
            value = mom.transform(offset,'DD').format('DD');
          }break;
          case "month":{
            value = mom.transform(offset,'MM').format('MM');
          }break;
          case "date":{
            value = mom.transform('MM' + separator + offset,'MM'+separator+'DD').format('MM'+separator+'DD');
          }break;
          case "week":{
            value = mom.format('e');
            value = parseInt(value);                                    
            if(value == 0){
                value = 7;
            }
          }break;
        }
    
        return value;
    },
    notificationHandler: (error, response, metadata)=>{
        console.log("Response!");                                
        console.log(response, metadata);

        switch(response){
            case "closed":
            case "activate":{
                //"contentsClicked" -> body was clicked
                //"actionClicked" -> button was clicked
                switch(metadata.activationValue){
                    case "Cancel":{
                        alert("You cancelled!");
                    }break;
                    case "Time-in":{
                        alert("You timed-in!");
                    }break;
                    case "Time-out":{
                        alert("You timed-out!");
                    }break;
                }
            }break;                                    
            case "the user clicked on the toast.":{ //clicked on body
                application.mainWindow.show();
            }break;
            case "the toast has timed out.": //closed on timeout  
            case "timeout":{
                //Wait 5 mins this show again
            }break;
            case "the user dismissed this toast.": //clicked close button
            case "replied":{}break;
        }

        /*fn.notifier.on('click', function (notifierObject, options) {
            alert("click");
        });                  
        fn.notifier.on('timeout', function (notifierObject, options) {
            alert("timeout");
        });*/

    },
    notificationCenter: (type, data, callback = fn.notificationHandler )=>{
        let notification;
        let message = type;
        let time = 60 * 10;
        let icon = paths.getStatic(paths.NOTIFICATION_ICON);

        //OS specific settings
        switch(_.OS){
            case "Windows_NT":{
                if(fn.notifier == null){
                    fn.notifier = new WindowsToaster({
                        withFallback: false,
                        customPath: paths.getCurrent(paths.NOTIFICATION_EXE)
                    });
                    //fn.notifier = NodeNotifier;
                }
                
                notification = {
                    title: '(☞ﾟ∀ﾟ)☞',
                    icon: icon,
                    sound: Notification.Reminder,//"Notification.Reminder",//"Notification.IM", Notification.SMS, Notification.Mail
                    wait: true,
                    id: 1,
                    appID: "odtr.app",
                };
            }break;
            default:{
                if(fn.notifier == null){
                    fn.notifier = NodeNotifier;
                }
                notification = {
                    title: '(☞ﾟ∀ﾟ)☞',
                    icon: icon,
                    sound: "Hero",
                    timeout: time,
                    closeLabel: "Cancel",
                };
            }break;
        }

        //Type changes
        switch(type){
            case "time-in":{
                message = `You have not yet timed-in. ${App.holiday?"But it's a " +
                              App.holiday_description + 
                              " so it is okay. I guess..":"Time-in now?"}`;
                
                if(!App.holiday){
                    notification.actions = "Time-in";
                }

            }break;
            case "time-out":{
                message = `Phewwww! What a day! You can time out now.`;
            }break;
            case "time-remaining":{
                let timeToGo = _.TIME_REMAINING;
                let timeIn = _.TIME_IN;

                message = "Hello there! your time-in was " + timeIn + ", " 
                        + fn.wordify("number", timeToGo) + " more hour" + ((timeToGo > 1)?"s":"") + " to go!"
            }break;
            default:{
                if(_.OS === "Windows_NT"){
                    //hide defaults after 3 secods
                    setTimeout(()=>{
                        //hide
                        console.log("Hide all default notifications");

                        //remove previous
                        child(paths.getCurrent(paths.NOTIFICATION_EXE), ['-close','1'],function(err, data) {
                            console.log(err,data);
                        });
                    },5000);
                }                
            }break;
        }

        //Show new
        notification.message = message;     
        fn.notifier.notify(notification, callback);
    },
    wordify: (type, index)=>{
        switch(type){
            case "number":{
                return ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][index];
            }break;
        }

        return type;
    },
    resetAllFlags: ()=>{
        console.log("%cA reset was performed.", "color: green; font-weight: bold;");
        _.TIMED_IN = false;
        _.TIMED_OUT = false;
        _.TIME_REMAINING = 0;
        _.TIME_IN = null;
    },
    startUpSchedules: ()=>{
        //everyday @ 12 am reset all
        schedule.scheduleJob("0 0 * * *", fn.resetAllFlags);

        //every weekday every hour
    },
    scheduleTimeout: (result)=>{
        if(result.record !== undefined){
            let timeIn = result.record.split("|");
            timeIn = timeIn[timeIn.length - 1].trim();
            
            let futureTime = moment(timeIn, "HH:mm A").transform("+09","HH").format('mm HH * * *');  
            let everyTime = moment(timeIn, "HH:mm A").transform("+09","HH").format('mm * * * *');  
            
            console.log(futureTime);
    
            _.TIME_OUT_JOB = schedule.scheduleJob(futureTime, function(){
                fn.notificationCenter("time-out");
                
                TimeInButtons.setTime(2);                                                                      
                
                alert('The answer to life, the universe, and everything!');
            });

            _.TIME_INCREMENT_JOB = schedule.scheduleJob(everyTime, function(){
                let timeToGo = --_.TIME_REMAINING;
                Countdown.setTime(timeToGo); 
            });
        }

        return 0;
    },
}

var _ = {
    STATE: -1, //-1-> init, 0->splash, 1->login, 2->qoute, 3->notifications

    //States
    SPLASH: -1,
    INIT: 0,
    LOGIN: 1,
    QOUTE: 2,
    NOTIF: 3,
    DASHBOARD: 4,

    //global variables
    INIT_DELAY: 1000,
    LOGIN_DELAY: 3000,
    QOUTE_DELAY: 100,
    NOTIF_DELAY: 1000,
    DASHBOARD_DELAY: 1000,

    OS: "",
    WORK_TIME: 9,
    FIRST_HIDE: true,

    //Scheduler jobs
    TIME_OUT_JOB: null,
    TIME_INCREMENT_JOB: null,
    
    //internet connection
    ONLINE_CHECK_OVERRIDE: false,
    INTERNET_CONNECTED: false,
    ODTR_AVAILABLE: false,
    ODTR_CHECK_OVERRIDE: false,

    //FLAGS of the STATES
    TIMED_IN: false,
    TIMED_OUT: false,
    TIME_REMAINING: 0,
    TIME_IN: null,
    TIME_OUT: null,
    WORK_TOTAL: null,
}
/******************* Listeners ********************/
application.mainWindow.on('hide', function () {
    if(_.FIRST_HIDE){
        fn.notificationCenter("I'm just hiding here under the system tray.");
        _.FIRST_HIDE = false;
    }

    //set css
    let root = document.getElementById("root");
    root.style = "opacity: 1; transform: scaleX(1) scaleY(1);";
});

/******************* Components *******************/
var Logo = {
    onbeforeremove: (node)=>{
        console.log("onbeforeremove: " + node.dom.id);  
        return App.transitionOut(node);
    },

    view: (node)=>{
        return m("#logo",[
            svg.logo
        ]);            
    }
}

var Mini = {
    onbeforeremove: (node)=>{
        console.log("onbeforeremove: " + node.dom.id);  
        return App.transitionOut(node);
    },

    view: (node)=>{
        let which = node.attrs.which;

        switch(which){
            case "Credits":{
                return m("#credit", [
                    m("span", "v0.1"),
                    " Alpha",
                    m("img.heart", {src: "./static/heart.svg"}),
                    "janmir 2017"
                ]);
            }break;
            case "Qoute":{
                return m("#qoute.slide-in", [
                    m("img.qoute_left", {src:"./static/qoute_left.svg"}),
                    "You're the last of the real ones.",
                    m("img.qoute_right", {src:"./static/qoute_right.svg"}),
                    m(".by", "- Anonymous")
                ])
            }break;
        }
    }
}

var TimeB = {
    view: (node)=>{
        return m("#time_button",[
            m("img.clock", {src: "./static/clock.svg"}),
            m("span.text", "Time-in")
        ]);
    }
}

var TimeInButtons = {
    time_in: "",
    time_out: "",
    work_time: 0,

    state: 0,

    setTime: (state)=>{
        switch(state){
            case 0:{ //time-in button
                TimeInButtons.state = 0;
            }break;
            case 1:{ //time-in display
                TimeInButtons.state = 1;
                TimeInButtons.time_in = _.TIME_IN || "--:--";
            }break;
            case 2:{ //time-out button
                TimeInButtons.state = 2;
            }break;
            case 2:{ //work-time display
                TimeInButtons.state = 3;
                TimeInButtons.time_out = _.TIME_OUT || "--:--";
                TimeInButtons.work_time = _.WORK_TOTAL || "???";
            }break;
        }

        TimeInButtons.animate();
    },
    animate: ()=>{
        let margin = TimeInButtons.state * 23 * -1;
        anime({
            targets: "#timein > .text:nth-child(1)",
            marginTop: [
                { value: margin, duration: 100, delay: 2000, easing: 'easeInOutSine' }
            ]
        });
    },
    oncreate: ()=>{
        TimeInButtons.animate();
    },
    view: ()=>{
        return m("#timein",{
            class: TimeInButtons.state == 0 || TimeInButtons == 2 ? ".touchable": ""
        },[
            m(".text", [
                m("img.clock", {src: "./static/clock.svg"}),
                m("span", "Time-in")
            ]),
            m(".text", "Time-In: " + TimeInButtons.time_in),
            m(".text", [
                m("img.clock", {src: "./static/clock.svg"}),
                m("span", "Time-out")
            ]),
            m(".text", "Work Time: " + TimeInButtons.work_time),
        ]);
    }
}

var Countdown = {
    count: 0,

    setTime: (remaining)=>{
        _.TIME_REMAINING = remaining;
    },

    tick: (time)=>{
        //flash first
        anime({
            targets: "#countdown > .dimmer",
            opacity: [
                { value: 0, duration: 100, delay: 0, easing: 'easeInOutSine' },
                { value: 0.3, duration: 100, delay: 0, easing: 'easeInOutSine' }
            ]
        });

        anime({
            targets: "#countdown > .brighter",
            opacity: [
                { value: 0.5, duration: 50, delay: 60, easing: 'easeInOutSine' },
                { value: 0, duration: 200, delay: 0, easing: 'easeInOutSine' }
            ]
        });

        anime({
            targets: "#countdown > .count",
            opacity: [
                { value: 0, duration: 100, delay: 0, easing: 'easeInOutSine' },
                { value: 1, duration: 50, delay: 0, easing: 'easeInOutSine' }
            ],
            complete: ()=>{
                if(Countdown.count >= 0){        
                    //Change text
                    Countdown.count += time;
                    document.querySelector("#countdown > .count").innerHTML = Countdown.count;
                }
            }
        });

    },

    oncreate: ()=>{
        //start animation
        setTimeout(()=>{
            let count = 0;
            let rem = Countdown.count - _.TIME_REMAINING;
            let time = rem >= 0 ? -1:1;
            rem = Math.abs(rem);
    
            let handle = setInterval(()=>{
                if(count < rem){
                    Countdown.tick(time);
                    count++;
                }else{
                    clearInterval(handle);
                }
            }, 400);
        },1000);        
    },

    view: (node)=>{
        return m("#countdown",[
            m(".top"),
            m(".bottom_under_under"),
            m(".bottom_under"),
            m(".bottom"),
            m(".count", Countdown.count),
            m(".hour", "HR"),
            m(".tminus", "T-minus"),
            //m(TimeB),
            m(".dimmer"),            
            m(".brighter"),            
        ]);
    }
}

var Close = {
    onbeforeremove: (node)=>{
        console.log("onbeforeremove: " + node.dom.id);  
        return App.transitionOut(node);
    },

    view: (node)=>{
        return m("img#close", {
            src: "./static/close.svg",
            alt: "I just hide the application.",
            onclick: (event)=>{
                //remote.getCurrentWindow().close();
                application.mainWindow.hide();

                event.redraw = false;
            }
        })
    }
}

var Loading = {
    message: "No Connection.",

    show: (message=Loading.message)=>{
        let loading = document.querySelector("#loading");
        loading.className = "";

        //change text
        let text = document.querySelector("#loading > .text");
        text.innerHTML = message;
    },   
    hide: ()=>{
        let loading = document.querySelector("#loading");
        loading.className = "hide";
    },   
    onbeforeremove: (node)=>{
        console.log("onbeforeremove: " + node.dom.id);  
        return App.transitionOut(node);
    },
    animate: ()=>{
        let text = document.querySelector(".text");
        if(text !== undefined && text !== null){
            text.className += " shake";
        }
        setTimeout(()=>{
            let text = document.querySelector(".text");
            if(text !== undefined && text !== null){
                text.className = "text";
            }
        },2000);
    },
    view: (node)=>{
        let className = ["pulse", "bounce", "rubberBand", "flash", "tada"];
        let index = Math.floor(Math.random() * ((className.length-1) + 1));
        
        className = className[index];
        //console.log(index+ ":" + className);

        return m("#loading.hide", [
            m(".overlay"),
            m(".image", {
                class: className
            }, svg.icon),
            m(".text", Loading.message)
        ])
    }
}

var Button = {
    join: (nodes)=>{
        let newArray = [];
        let len = nodes.length - 1;
        let counter = 0;

        nodes.forEach(el=>{
            newArray.push(el);

            if(counter < len){
                newArray.push(m("img.separator", {src:"./static/separator.svg"}));
            }else{
                newArray.push(
                    m(".separator",
                        m("img.arrow", {src:"./static/arrow.svg"})
                    )
                );
            }

            counter++;
        });

        return newArray;
    },

    onbeforeremove: (node)=>{
        console.log("onbeforeremove: " + node.dom.id);
        return App.transitionOut(node);
    },

    view: (node)=>{
        let types = node.attrs.type;

        let buttons = types.map(el=>{
            /*return m(".button",[
                    m("img", {
                        src:`./static/${el}.svg`, 
                        onclick:(node)=>{
                            App.onclick(node.target.id);
                        }, 
                        id: el
                    }),
                    m(".line")
            ]);*/
            return m(".button",{
                onclick:(e)=>{
                    // console.log(e);
                    // App.onclick(e.target.id);
                    App.onclick(e.target.innerHTML);
                }, 
                id: el
            },[
                svg.login,
                m(".line")
            ],);
        });


        buttons = Button.join(buttons);        

        return m("#buttons", [
            buttons
        ]);
    }
}

var Form = {
    onchange: (node)=>{
        App.changeValue(node.target);
    },
    
    onbeforeremove: (node)=>{
        console.log("onbeforeremove: " + node.dom.id);  
        return App.transitionOut(node);
    },

    onfocus: (node)=>{
        node.target.select();

        node.target.className = [node.target.className.split(" ")[0]];
        App.user_error = false;
        App.pass_error = false;
    },

    view: (node)=>{
        return m("#form", [
            m("img.user", {src: "./static/user.svg"}),
            m("img.pass", {src: "./static/pass.svg"}),
            m("input#username.input",{
                placeholder:"Username", 
                type:"text", 
                class:`${node.attrs.user_error?'error':''} ${node.attrs.disabled?'disabled':''}`, 
                onchange:(node)=>{Form.onchange(node)},
                onfocus:(node)=>{Form.onfocus(node)},
                disabled: `${node.attrs.disabled?'true':''}`
            }),
            m("input#password.input",{
                placeholder:"Password", 
                type:"password", 
                class:`${node.attrs.pass_error?'error':''} ${node.attrs.disabled?'disabled':''}`, 
                onchange:(node)=>{Form.onchange(node)},
                onfocus:(node)=>{Form.onfocus(node)},
                disabled: `${node.attrs.disabled?'true':''}`
            })
        ]);
    }
}

var Toast = {
    handler: null,

    show: (message, timeout=7000)=>{
        let span = document.querySelector("#toast > span");
        span.innerHTML = message;

        //show animation
        anime({
            targets: "#toast",
            bottom: [
                { value: 0, duration: 300, delay: 0, easing: 'easeInOutSine' }
            ],
            opacity: [
                { value: 1, duration: 100, delay: 0, easing: 'easeInOutSine' }
            ]
        });

        if(Toast.handler !== null){
            clearTimeout(Toast.handler);
        }

        if(timeout >= 0){
            Toast.handler = setTimeout(()=>{
                Toast.hide();
            }, timeout);
        }
    },
    hide: ()=>{
        //hide animation
        anime({
            targets: "#toast",
            bottom: [
                { value: -20, duration: 300, delay: 0, easing: 'easeInOutSine' }
            ],
            opacity: [
                { value: 0, duration: 100, delay: 100, easing: 'easeInOutSine' }
            ]
        });

    },
    view: (node)=>{
        return m("#toast",[
            m("span", "Status should be written here.")
        ]);
    }    
}

var App = {
    username: "",
    password: "",
    user_error: false,
    pass_error: false,

    input_disabled: false,
    children: [],

    holiday: false,
    holiday_description: "",

    oninit:(node)=>{
        //Init SVG assets
        svg.init();
        
        //Initializations
        _.OS =  os.type();

        //Startup items
        fn.startUpSchedules();

        //Logging
        let data = {
            "directory": application.getPath("userData"),
            "os": _.OS
        };
        console.info(data);
    },

    changeState: (state)=>{
        _.STATE = state;

        //redraw 
        m.redraw();
    },

    transitionOut: (node, animation="fade-out")=>{
        //Add fadeout class
        node.dom.classList.add(animation)
        
        return new Promise(function(resolve) {
            setTimeout(resolve, 300)
        });
    },

    transitionIn: (node, animation="fade-in")=>{
        //Add children  to list
        let newChild = [];
        node.dom.childNodes.forEach(el => {
            let check = App.children.includes(el.id);
            if(!check){
                App.children.push(el.id);
                newChild.push(el);
            }
        });

        //fade in
        newChild.forEach(el => {
            if(el.classList === undefined || el.id === "credit")
                return;
            el.classList.add(animation);
        });
    },

    windowsTransitionIn: (window)=>{
        let animation = anime({
            targets: window,
            opacity: [
                { value: 1, duration: 300, delay: 0, easing: 'easeInOutSine' }
            ],
            scaleX: [
                { value: 1, duration: 200, delay: 100, easing: 'easeInOutSine' }
            ],
            scaleY: [
                { value: 1, duration: 200, delay: 100, easing: 'easeInOutSine' }
            ]
        });

        return animation.finished;
    },

    windowsTransitionOut: (window)=>{
        let animation = anime({
            targets: window,
            opacity: [
                { value: 0, duration: 300, delay: 0, easing: 'easeInOutSine' }
            ],
            scaleX: [
                { value: 0.6, duration: 200, delay: 100, easing: 'easeInOutSine' }
            ],
            scaleY: [
                { value: 0.6, duration: 200, delay: 100, easing: 'easeInOutSine' }
            ],
        });

        return animation.finished;
    },

    onbeforeupdate: (node, old)=>{
        // console.log("onbeforeupdate");
        // console.log(node);
        // console.log(old);
    },

    onupdate: (node)=>{
        //Add enter transition
        App.transitionIn(node);

        //Do processes
        App.main_process(node);
    },

    oncreate: (node)=>{
        //Add enter transition
        App.transitionIn(node);

        //Do processes
        App.main_process(node);
    },

    onclick: (id)=>{
        //show loading 
        console.log("Onclick!" + id);

        switch(id){
            case "yes":{
            }break;
            case "no":{
            }break;
            case "login":{
                if(App.username !== "" && App.password !== "" ){
                    App.input_disabled = true;

                    Toast.show("Logging in..");
                    
                    //Ajax
                    fn.loginCredentials(App.username, App.password)
                    .then(function(result) {
                        console.log(result);
                        if(result.result && result.verified){
                            //redraw after delay
                            setTimeout(()=>{
                                App.changeState(_.QOUTE);
                            }, _.QOUTE_DELAY);

                            Toast.show("Login successful..");
                        }else{
                            App.user_error = true;
                            App.pass_error = true;
                            App.input_disabled = false;
    
                            Toast.show("Login error..");
                            m.redraw();
                        }        
                    });
                }else{
                    App.user_error = (App.username === "");
                    App.pass_error = (App.password === "");
                }
            }break;
            case "snooze":{
            }break;
        }
    },

    changeValue: (node)=>{
        switch(node.id){
            case "username":{
                App.username = node.value;
            }break;
            case "password":{
                App.password = node.value;
            }break;
        }
    },

    main_process: (node)=>{
        let className = node.dom.className;
        className = className.split(" ")[0];

        console.log("%cProcess " + className, "color: olive; font-weight: bold;");

        switch(className){
            case 'splash':{
                let baseTimeout = 2000;
                //animate svg
                anime({
                    targets: `.${className} #logo #swirl`,
                    strokeDashoffset: [anime.setDashoffset, 0],
                    easing: 'easeInOutSine',
                    duration: 1000,
                    delay: baseTimeout
                });
                anime({
                    targets: `.${className} #logo #line`,
                    strokeDashoffset: [anime.setDashoffset, 0],
                    easing: 'easeInOutSine',
                    duration: 200,
                    delay: baseTimeout + 800
                });
                anime({
                    targets: `.${className} #credit`,
                    opacity: 1,
                    easing: 'easeInOutSine',
                    duration: 500,
                    delay: baseTimeout
                });

                //animate text
                var obj = { charged: 0 };
                var el = document.querySelector(`.${className} #credit span`);
                anime({
                    delay: baseTimeout,
                    targets: obj,
                    charged: 100,
                    round: 1,
                    duration: 2000,
                    easing: 'linear',
                    update: function() {
                    el.innerHTML = "v0." + obj.charged;
                    }
                });

                anime({
                    targets: el,
                    width: 21,
                    delay: baseTimeout + 2400,
                    duration: 500,
                    easing: 'linear',
                    complete: ()=>{
                        //redraw after delay
                        setTimeout(()=>{                                                                    
                            App.changeState(_.INIT);
                        }, _.INIT_DELAY);
                    }
                });
            }break;
            case 'loading':{
                //Check for internet connection
                console.log("Check internet connection.");
                fn.onlineAsync().then((inOnline)=>{
                    if(isOnline){
                        console.log("Connected!");
                        //Do wake up call
                        console.log("Check ODTR connection.");
                        
                        fn.wakeupAsync().then((result)=>{

                            if(result){
                                console.log("Alive!");                                
                                console.log("Check credentials.");
                                
                                //Check if there is saved credentials
                                fn.checkCredentials()
                                .then((data)=>{
                                    let state = _.LOGIN;

                                    if(data.result){
                                        //Save to be used in login
                                        App.username = data.data.credentials.username;
                                        App.password = data.data.credentials.password;

                                        //Move on with date
                                        state = _.QOUTE;
                                    }

                                    //wait then start
                                    setTimeout(()=>{                
                                        App.changeState(state);
                                    }, _.LOGIN_DELAY);

                                    //redraw after delay
                                    Toast.show("Do useless checks..");  
                                })
                                .catch((error)=>{
                                    alert(error);
                                });
                            }
                        });
                    }
                });
            }break;
            case 'login':{
                // Toast.show("Please Login..");        
                
                //animate svg
                anime({
                    targets: `.${className} #logo svg`,
                    translateY: -30,
                    height: 45,
                    easing: 'easeInOutSine',
                    duration: 700
                });

                //animate form
                anime({
                    targets: `.${className} #form`,
                    top: 90,
                    easing: 'easeInOutSine',
                    duration: 500,
                    delay: 900
                });

                //retate close
                anime({
                    targets: `.${className} #close`,
                    rotate: 360 * 2,
                    easing: 'easeInOutSine',
                    duration: 1000,
                    delay: 700
                });

                //animate buttons
                let arImages = [];
                let imgs = document.querySelectorAll(`.${className} #buttons > *`);
                imgs = imgs.forEach(el => {
                    arImages.push(el);
                });
                arImages.reverse();

                anime({
                    targets: arImages,
                    opacity: 0.8,
                    translateX: 10,
                    easing: 'easeInOutSine',
                    duration: 400,
                    delay: (target, index)=>{
                        return 800 + (100 * index);
                    },
                });
            }break;
            case 'qoute':{
                Toast.show("Doing secret background stuff..");

                //slide left
                /*let divs = document.querySelectorAll(`.${className} .fade-out`);
                anime({
                    targets: divs,
                    left: 50,
                    easing: 'easeOutQuad',
                    duration: 500
                });*/

                let promises = [];

                //Check credentials
                promises.push(fn.checkCredentials());

                //if have log in again
                promises.push(fn.loginCredentials(App.username, App.password));                                

                //today is a holiday?
                promises.push(fn.holidayToday());

                //process all promises
                Promise.all(promises)
                .then((result)=>{
                    try{
                        let save = false;
                        result.forEach((res)=>{

                            console.log(res);
        
                            //process promises
                            switch(res.type){
                                case "checkCredentials":{
                                    if(res.result){
                                        //Reset just to be sure
                                        App.username = res.data.credentials.username;
                                        App.password = res.data.credentials.password;
                                    }else{
                                        console.log("To save new credentials.");

                                        //expected to be false
                                        save = true;
                                    }
                                }break;
                                case "loginCredentials":{
                                    if(res.result){
                                        
                                        let data = {
                                            credentials:{
                                                username: App.username,
                                                password: App.password
                                            }
                                        };
                        
                                        if(save){
                                            console.log("Saving new credentials: ");
                                            console.log(data.credentials);

                                            //save credentials
                                            fn.saveCredentials(data)
                                            .then((data)=>{
                                                console.log(data);
                                            });
                                        }
                        
                                    }else{
                                        //rewrite the file
                                        fn.saveCredentials({
                                            credentials:{
                                                username: null,
                                                password: null
                                            }
                                        }).then((res)=>{
                                            console.log(res);
                                        });

                                        //handle error
                                        let err = {message: res.message};
                                        throw err;
                                    }
                                }break;
                                case "holidayToday":{
                                    if(res.result){
                                        //check if weekend
                                        let dayOfWeek = fn.now("week");

                                        //check if holiday
                                        if(res.holiday){
                                            App.holiday_description = "holiday"

                                            App.holiday = true;
                                        }else if(dayOfWeek > 5){
                                            App.holiday_description = "weekend"

                                            App.holiday = true;
                                        }
                                    }else{
                                        //handle error
                                        let err = {message: res.message};
                                        throw err;
                                    }
                                }break;
                            }
                        });

                        //redraw after delay
                        Toast.show("This window will now close..");        
                        
                        setTimeout(()=>{
                            //hide Toast
                            Toast.hide();
                    
                            //then move on
                            App.changeState(_.NOTIF);

                        }, _.NOTIF_DELAY);

                    }catch(error){
                        alert(error.message);
                    }
                })
                .catch((error)=>{
                    throw error;
                });

            }break;
            case 'notif':{

                //check if already logged in
                App.windowsTransitionOut("#root")
                .then(()=>{

                    //hide it!
                    application.mainWindow.hide();

                    //redraw after delay
                    Toast.show("Checking Login Status..");  

                    //checkLogin
                    fn.checkLogin(App.username, App.password)
                    .then((result)=>{
                        console.log(result);

                        if(result.result){
                            if(result.since === null){ //Not yet timed in
                                fn.notificationCenter("time-in");                    

                                //reset
                                fn.resetAllFlags();
                                
                            }else{ //check if already timed out
                                _.TIMED_IN = true;

                                //Not yet timed-out
                                if(result.actual === undefined){
                                    //Set Time remaining
                                    let timeToGo = _.WORK_TIME - result.since;
                                    //Set Time in
                                    let timeIn = result.record.split("|")
                                    _.TIME_IN = timeIn[timeIn.length - 1].trim();

                                    Countdown.setTime(timeToGo);  
                                    TimeInButtons.setTime(1);                                                                      

                                    //notify for hours to go
                                    fn.notificationCenter("time-remaining", result);

                                    //cron job for since to be 9
                                    fn.scheduleTimeout(result);
                                }
                                //Already timed-out
                                else{
                                    //Nothing to do
                                    _.TIMED_OUT = true;
                                }
                            }
                        }else{
                            //handle error
                            console.error(result.message);
                        }

                        //Goto dashboard
                        setTimeout(()=>{
                            //then move on
                            App.changeState(_.DASHBOARD);

                        }, _.DASHBOARD_DELAY);
                    });
                });
                
                
            }break;
            case 'dashboard':{
            }break;
        }
    },

    view: (node)=>{
        console.log("%creDraw!", "color: green; font-weight: bold");
        
        switch(_.STATE){
            case _.SPLASH:{
                return m("#root.splash", [
                    m(Logo),
                    m(Mini, {which:"Credits"})
                ])
            }break;
            case _.INIT:{
                //check if has credentials
                return m("#root.loading", [
                    m(Logo),
                    m(Mini, {which:"Credits"}),
                    m(Toast),                    
                    m(Loading)                   
                ]);
            }break;
            case _.LOGIN:{
                return m("#root.login", [
                    m(Logo),
                    m(Close),
                    m(Form, {
                        user_error: App.user_error,
                        pass_error: App.pass_error,
                        disabled: App.input_disabled
                    }),
                    m(Button, {type:[
                        "login"
                    ]}),
                    m(Toast),
                    m(Loading)                   
                ])
            }break;
            case _.QOUTE:{
                return m("#root.qoute", [
                    m(Close),
                    m(Mini, {which:"Qoute"}),
                    m(Toast)                    
                ]);
            }break;
            case _.NOTIF:{
                return m("#root.notif", [
                    m(Close),
                    m(Mini, {which:"Qoute"}),
                    m(Toast)
                ]);
            }break;
            case _.DASHBOARD:{
                return m("#root.dashboard", [
                    m(Close),
                    m(Countdown),
                    m(TimeInButtons),                    
                    m(Toast),
                    m(Loading)                                       
                ]);
            }break;
        }
    }
}

//Mount it, baby mount it!
m.mount(document.body, App);
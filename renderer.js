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
const notifier = require('node-notifier');

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

    get: (file)=>{
        let dir = application.getPath("userData");
        let pat = path.join(dir, file);

        return pat;
    },
    getStatic: (file)=>{
        let dir = __dirname + "/static";
        let pat = path.join(dir, file);

        return pat;
    }
}

var svg = {
    logo: null,
    init: ()=>{
        svg.logo = svg.getSVG('./static/logo.svg');
    },
    getSVG: (path)=>{
        let _svg = fs.readFileSync(path, 'utf8');
        return m.trust(_svg);
    }
};
svg.init();

var _ = {
    STATE: -1, //-1-> init, 0->splash, 1->login, 2->qoute, 3->notifications

    //States
    INIT: -1,
    SPLASH: 0,
    LOGIN: 1,
    QOUTE: 2,
    NOTIF: 3,

    //global variables
    INIT_DELAY: 3000,
    LOGIN_DELAY: 4000,
    QOUTE_DELAY: 100,
    NOTIF_DELAY: 100
}

var fn = {
    checkCredentials: ()=>{
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
                
                resolve(out);
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
                resolve(out);
            }
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
                let handle = 0;
                let counter = 0;
                let skip = false;

                handle = setInterval(()=>{
                    counter++;
                    console.log("Trying to Login: " + counter);

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
                                clearInterval(handle);

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
                let handle = 0;
                let counter = 0;
                let skip = false;

                handle = setInterval(()=>{
                    counter++;
                    console.log("Trying to check: " + counter);

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
                                clearInterval(handle);

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
            case "timeout":{
                //Wait 5 mins this show again
            }break;
            case "replied":{}break;                                    
        }
    },
    notificationCenter: (type, callback = fn.notificationHandler )=>{
        let time = 60 * 10;
        let icon = paths.getStatic(paths.NOTIFICATION_ICON);
        let notification = {
            title: 'ODTR App',
            icon: icon,
            sound: "Hero",//"Submarine",
            timeout: time,
            closeLabel: "Cancel",
            //actions: "Time-out",
            //actions: ["Snooze 5 minutes", "Snooze 10 minutes", "Snooze 1 hour"],
            //dropdownLabel: "Snooze"
            //reply: true
        };

        switch(type){
            case "time-in":{
                let message = `You have not yet timed-in. ${App.holiday?"But it's a " +
                              App.holiday_description + 
                              " so it is okay. I guess..":"Time-in now?"}`;
                
                notification.message = message;
                if(!App.holiday){
                    notification.actions = "Time-in";
                }

                notifier.notify(notification, callback);
            }break;
            case "time-out":{
                let message = `Phewwww! You can time out now. Pressing cancel will snooze for 5 mins.`;
                
                notification.message = message;
                if(!App.holiday){
                    notification.actions = "Time-out";
                }

                notifier.notify(notification, callback);
            }break;
        }
    },
    startUpSchedules: ()=>{
        //everyday @ 8 am
        //every weekday every hour
    }
}

/******************* Components *******************/
var Mini = {
    onbeforeremove: (node)=>{
        console.log("onbeforeremove: " + node.dom.id);  
        return App.transitionOut(node);
    },

    view: (node)=>{
        let which = node.attrs.which;

        switch(which){
            case "Logo":{
                return m("#logo",[
                    svg.logo
                ]);
            }break;
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
                    m("img.qoute_right", {src:"./static/qoute_right.svg"})
                ])
            }break;
        }
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
    onbeforeremove: (node)=>{
        console.log("onbeforeremove: " + node.dom.id);  
        return App.transitionOut(node);
    },

    view: (node)=>{
        let className = ["pulse", "bounce", "rubberBand", "shake", "flash", "tada"];
        let index = Math.floor(Math.random() * ((className.length-1) + 1));
        
        className = className[index];
        console.log(index+ ":" + className);

        return m("#loading", [
            m(".overlay"),
            m("img", {
                src:"./static/icon_big.svg",
                class: className
            }),
            m(".text","Loading...")
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
            return m(
                ".button",[
                    m("img", {
                        src:`./static/${el}.svg`, 
                        onclick:(node)=>{
                            App.onclick(node.target.id);
                        }, 
                        id: el
                    }),
                    m(".line")
                ]
            );
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

var App = {
    username: "",
    password: "",
    user_error: false,
    pass_error: false,
    input_disabled: false,
    children: [],
    loading: false,
    holiday: false,
    holiday_description: "",
    
    oninit:(node)=>{
        //Call login to initialize API

        //Ajax
        /*
        m.request({
            method: "GET",
            url: urls.LOGIN,
            background: true
        })
        .then(function(result) {
            console.log(result);
        });
        */
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
            setTimeout(resolve, 500)
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
            if(el.classList === undefined)
                return;
            el.classList.add(animation);
        });
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

        switch(id){
            case "yes":{

            }break;
            case "no":{

            }break;
            case "login":{
                if(App.username !== "" && App.password !== "" ){
                    App.input_disabled = true;
                    App.loading = true;

                    //Ajax
                    fn.loginCredentials(App.username, App.password)
                    .then(function(result) {
                        console.log(result);
                        if(result.result && result.verified){
                            //redraw after delay
                            setTimeout(()=>{
                                App.changeState(_.QOUTE);
                            }, _.QOUTE_DELAY);

                        }else{
                            App.user_error = true;
                            App.pass_error = true;
                            App.input_disabled = false;
                            App.loading = false;
    
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

        switch(className){
            case 'loading':{
                fn.checkCredentials()
                .then((data)=>{
                    let state = _.SPLASH;

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
                    }, _.INIT_DELAY);
                })
                .catch((error)=>{
                    alert(error);
                });
            }break;
            case 'splash':{
                //animate svg
                anime({
                    targets: `.${className} #logo #swirl`,
                    strokeDashoffset: [anime.setDashoffset, 0],
                    easing: 'easeInOutSine',
                    duration: 1000,
                    delay: 100
                });
                anime({
                    targets: `.${className} #logo #line`,
                    strokeDashoffset: [anime.setDashoffset, 0],
                    easing: 'easeInOutSine',
                    duration: 200,
                    delay: 900
                });

                //animate text
                var obj = { charged: 0 };
                var el = document.querySelector(`.${className} #credit span`);
                anime({
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
                    delay: 2500,
                    duration: 500,
                    easing: 'linear'
                });

                //redraw after delay
                setTimeout(()=>{
                    App.changeState(_.LOGIN);
                }, _.LOGIN_DELAY);
            }break;
            case 'login':{
                //animate svg
                anime({
                    targets: `.${className} #logo svg`,
                    translateY: -30,
                    height: 45,
                    easing: 'easeInOutSine',
                    duration: 700
                });

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
                //slide left
                let divs = document.querySelectorAll(`.${className} .fade-out`);
                anime({
                    targets: divs,
                    left: 0,
                    easing: 'easeInOutSine',
                    duration: 500
                });

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

                            //console.log(res);
        
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
                        setTimeout(()=>{
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
                application.mainWindow.hide();
                
                //checkLogin
                fn.checkLogin(App.username, App.password)
                .then((result)=>{
                    console.log(result);

                    if(result.result){
                        if(result.since === null){
                            fn.notificationCenter("time-in");                            
                        }else{
                            //cron job for since to be 9
                        }
                    }else{
                        //handle error
                        console.log("here");
                    }
                });
            }break;
        }
    },

    view: (node)=>{
        console.log("%cDraw!", "color: green; font-weight: bold");
        
        switch(_.STATE){
            case _.INIT:{
                //check if has credentials
                return m("#root.loading", [
                    m(Loading)
                ]);
            }break;
            case _.SPLASH:{
                return m("#root.splash", [
                    m(Mini, {which:"Logo"}),
                    m(Mini, {which:"Credits"})
                ])
            }break;
            case _.LOGIN:{
                return m("#root.login", [
                    m(Mini, {which:"Logo"}),
                    m(Close),
                    m(Form, {
                        user_error: App.user_error,
                        pass_error: App.pass_error,
                        disabled: App.input_disabled
                    }),
                    m(Button, {type:[
                        "login"
                    ]}),
                    App.loading ? m(Loading):null                    
                ])
            }break;
            case _.QOUTE:{
                return m("#root.qoute", [
                    m(Close),
                    m(Mini, {which:"Qoute"})
                ]);
            }break;
            case _.NOTIF:{
                return m("#root.notif", [
                    m(Close)
                ]);
            }break;
        }
    }
}

//Mount it!
m.mount(document.body, App);
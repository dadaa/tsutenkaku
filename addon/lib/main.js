/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
 
var tabs = require("tabs");
var timers = require("timers");
var xhr = require("xhr");
var arduino = require("arduino.js");

const WEATHER_URL = "http://rss.weather.yahoo.co.jp/rss/days/6200.xml";
const OFF_RGB = {r:0,g:0,b:0};
const SUNNY_RGB = {r:0,g:255,b:0};
const CLOUDY_RGB = {r:255,g:0,b:0};
const RAINNY_RGB = {r:0,g:0,b:255};

const GREEN = 13;
const BLUE = 12;
const RED = 11;
const FADE_RESOLUTION = 100;
const NEXT_INTERVAL = 20;

var timeoutkey = -1;
var current_rgb = {r:0, g:0, b:0};
var forecast_rgb_list = [SUNNY_RGB, CLOUDY_RGB, RAINNY_RGB, OFF_RGB];

//setup arduino
arduino.open("/dev/cu.usbmodemfd121");
//arduino.open("/dev/cu.usbmodem411");
arduino.pinMode(GREEN, true);
arduino.pinMode(BLUE, true);
arduino.pinMode(RED, true);

function next(count, listIndex, rgbList) {
    count += 1;
    var nextRGB = rgbList[listIndex];
    var previousRGB = rgbList[listIndex != 0 ? listIndex-1 : rgbList.length-1]
    lighting(count, FADE_RESOLUTION, nextRGB, previousRGB);
    //next state
    if (count == FADE_RESOLUTION) {
        listIndex = listIndex == rgbList.length-1 ? 0 : listIndex+1;
        count = 0;
    }
    timeoutkey = timers.setTimeout(next, NEXT_INTERVAL, count, listIndex, rgbList);
}

function fadeout(count, previousRGB, callback) {
    count += 1;
    lighting(count, FADE_RESOLUTION, OFF_RGB, previousRGB);
    if (count == FADE_RESOLUTION) {
        callback();
    } else {
        timeoutkey = timers.setTimeout(fadeout, NEXT_INTERVAL, count, previousRGB, callback);
    }
}

function lighting(count, resolution, nextRGB, previousRGB) {
    var rate = count / resolution;
    var r = Math.floor(previousRGB.r + (nextRGB.r - previousRGB.r) * rate);
    var g = Math.floor(previousRGB.g + (nextRGB.g - previousRGB.g) * rate);
    var b = Math.floor(previousRGB.b + (nextRGB.b - previousRGB.b) * rate);
    current_rgb.r = r;
    current_rgb.g = g;
    current_rgb.b = b;
    arduino.analogWrite(RED, r);
    arduino.analogWrite(GREEN, g);
    arduino.analogWrite(BLUE, b);
}

var request = new xhr.XMLHttpRequest();
request.open('GET', WEATHER_URL, true);
request.onreadystatechange = function (e) {
    if (request.readyState == 4) {
        if(request.status == 200) {
            var xml = request.responseXML;
            var items = xml.documentElement.getElementsByTagName("item");
            if (items.length < 2) {
                console.log("No weather forecast found.");
                return;
            }
            //get tomorrow's weather
            var tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate()+2);
            var dateOfTomorrow = tomorrow.getDate();
            var targetItem = null;
            for (var i = 0, n = items.length; i < n; i++) {
                var item = items[i];
                var title = item.getElementsByTagName("title")[0];
                if (title.textContent.match(" "+dateOfTomorrow+"日")) {
                    targetItem = item;
                    break;
                }
            }
            if (!targetItem) {
                console.log("No target item found.");
                return;
            }
            //weather
            //晴, 曇, 雨, 雪
            var description = item.getElementsByTagName("description")[0].textContent;
            var isSunny = description.match(/晴/);
            var isCloudy = description.match(/曇/);
            var isRainy = description.match(/雨|雪/);
            if (isSunny) {
                if (isCloudy) {
                    forecast_rgb_list = [SUNNY_RGB, CLOUDY_RGB];
                } else if (isRainy) {
                    forecast_rgb_list = [SUNNY_RGB, RAINNY_RGB];
                } else {
                    forecast_rgb_list = [SUNNY_RGB, OFF_RGB];
                }
            } else if (isCloudy) {
                if (isRainy) {
                    forecast_rgb_list = [CLOUDY_RGB, RAINNY_RGB];
                } else {
                    forecast_rgb_list = [CLOUDY_RGB, OFF_RGB];
                }
            } else {
                forecast_rgb_list = [RAINNY_RGB, OFF_RGB];
            }
        } else {
            console.log('Error', request.responseText);
        }
    }
};
request.send(null);

tabs.on('ready', function(tab) {
    var currentRGB = {r:current_rgb.r, g:current_rgb.g, b:current_rgb.b};
    timers.clearTimeout(timeoutkey);
    if (!tab.url.match(/osaka/)) {
        fadeout(0, currentRGB, function() {});
        return;
    }
    var nextList = forecast_rgb_list;
    if (currentRGB.r == 0 && currentRGB.g == 0 && currentRGB.b == 0) {
        next(0, 0, nextList);
    } else {
        fadeout(0, currentRGB, function() {
            next(0, 0, nextList);
        });
    }
});

'use strict'
const express = require('express');
const router = express.Router();
const http = require('http');
const huePkg = require('node-hue-api'),
  HueApi = huePkg.HueApi,
  lightState = huePkg.lightState;
const request = require('request-promise');
const fs = require('fs');
const CONFIG = require('../config.json');

/* GET home page. */
router.get('/home', function (req, res, next) {
  res.sendFile('index.html');
});

router.get('/api/goal', (req, res, next) => {
  if (!isAuthorized(req.get('apiKey'))) {
    res.json({ "status": "unauthorized", "code": 401 });
    res.statusCode = 401;
    return;
  }

  let json = processGoal(req, res, next);
  if (json) {
    res.json(json);
    res.statusCode = json.code || 500;
  }
  else res.json({ "status": "success", "code": 200 });
});

router.get('/api/reset', (req, res, next) => {
  if (!isAuthorized(req.get('apiKey'))) {
    res.json({ "status": "unauthorized", "code": 401 });
    res.statusCode = 401;
    return;
  }

  endMusic();
  resetLights()
    .then(() => {
      res.json({ "status": "success", "code": 200 });
    });
});

router.get('/api/instavom', (req, res, next) => {
  if (!isAuthorized(req.get('apiKey'))) {
    res.json({ "status": "unauthorized", "code": 401 });
    res.statusCode = 401;
    return;
  }

  instavom()
    .then(() => {
      res.json({ "status": "success", "code": 200 });
    })
    .catch((error) => {
      res.json({ "status": "failed", "code": 500, "error": error });
      res.status = 500;
    });
});

const processGoal = (req, res, next) => {
  console.log(getTimestamp() + 'Received API request...')
  let err = checkLastProcessed();
  if (err) return err;

  startMusic()
    .then(getHueGroupState)
    .then((ogStates) => {
      console.log('original state', ogStates);
      startLights()
        .then(sleep)
        .then(() => {
          endMusic().then(resetLights(ogStates))
            .then(() => {
              return { "status": "success", "code": 200 };
            });
        });
    });
};

const isAuthorized = (apiKey) => {
  if (!apiKey) return false;
  let file = JSON.parse(fs.readFileSync('data/api_keys.json', 'utf8'));
  for (let i in file.clients) {
    if (file.clients[i].key === apiKey)
      return true;
  }
  return false;
};

const checkLastProcessed = () => {
  let date = new Date();
  date.setSeconds(date.getSeconds() - (CONFIG.COOLDOWN + CONFIG.RUNTIME));
  let file = JSON.parse(fs.readFileSync('data/last_processed.json', 'utf8'));
  let last_processed = new Date(file.last_processed);
  console.log(last_processed);
  console.log(date);
  if (last_processed > date) {
    return { "status": "failed", "code": 429, "error": `Too many requests, please wait ${Math.round((last_processed - date) / 60000 * 60 * 10) / 10} seconds before trying again` };
  }
  fs.writeFileSync('data/last_processed.json', JSON.stringify({ "last_processed": Date.now() }), 'utf8');
};

const startMusic = () => {
  return new Promise((resolve, reject) => {

    let httpOptions = {
      hostname: CONFIG.SONOS.HOSTNAME,
      port: CONFIG.SONOS.PORT,
      path: encodeURI('/' + CONFIG.SONOS.ROOM_NAME + '/playlist/' + CONFIG.SONOS.PLAYLIST_NAME),
      method: 'GET'
    };
    console.log(getTimestamp() + 'Sending play request to SONOS...');
    http.request(httpOptions, (result) => {
      console.log(getTimestamp() + 'Request sent to SONOS.');
      resolve(result);
    }).setTimeout(0)
      .on('error', (error) => {
        console.log(getTimestamp() + 'An error occurred while attempting to play the playlist via SONOS:', error);
        reject(error);
      })
      .end();
  });
};

const startLights = () => {
  var onState = {
    "on": true,
    "bri": 254,
    "hue": 65531,
    "effect": "none",
    "alert": "lselect",
    "xy": [
      0.6865,
      0.2937
    ]
  };

  return setHueGroupState(onState);
}

const instavom = () => {
  let vomState = {
    "on": true,
    "bri": 254,
    "hue": 65531,
    "sat": 140,
    "effect": "colorloop",
    "xy": [
      0.6865,
      0.2937
    ]
  };

  return setHueGroupState(vomState);
};

const setHueGroupState = (json) => {
  return new Promise((resolve, reject) => {

    let state = JSON.stringify(json);

    let options = {
      hostname: CONFIG.HUE.IP_ADDRESS,
      port: 80,
      method: 'PUT',
      path: encodeURI(`/api/${CONFIG.HUE.USERNAME}/groups/${CONFIG.HUE.GROUP_ID}/action`),
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(state)
      }
    };

    http.request(options, (res) => {
      let response = "";
      res.setEncoding('utf8');
      res.on('data', (data) => {
        if (data)
          response += data;
      });
      res.on('end', () => {
        console.log(getTimestamp() + 'Successfully set group state');
        resolve(response);
      });
      res.on('error', (error) => {
        console.log(getTimestamp() + 'An error occurred while sending group state', error)
        reject(error);
      })
    }).write(state);
  });
};

const getHueGroupState = () => {
  return new Promise((resolve, reject) => {
    console.log('Getting the current group state...');
    let options = {
      hostname: CONFIG.HUE.IP_ADDRESS,
      port: 80,
      method: 'GET',
      path: encodeURI(`/api/${CONFIG.HUE.USERNAME}/groups/${CONFIG.HUE.GROUP_ID}`),
      accept: "application/json"
    };

    http.request(options, (res) => {
      let response = {};
      res.setEncoding('utf8');
      res.on('data', (data) => {
        if (data)
          response += data;
      });
      res.on('end', () => {
        console.log(getTimestamp() + 'Successfully got group state', response);
        resolve(response.action);
      });
      res.on('error', (error) => {
        console.log(getTimestamp() + 'An error occurred while sending group state', error)
        reject(error);
      })
    }).end();
  });
}

const sleepFor = (delay) => {
  var start = new Date().getTime();
  while (new Date().getTime() < start + delay);
}

const sleep = () => {
  return new Promise((resolve, reject) => {
    let runtime = CONFIG.RUNTIME || 15;
    console.log(getTimestamp() + 'Waiting', runtime, 'seconds before ending...');
    sleepFor(runtime * 1000);
    console.log(getTimestamp() + 'done.');
    resolve(`Slept for ${runtime} seconds.`);
  });
};

const resetLights = (state) => {
  let defaultLights = {
    "on": true,
    "bri": 254,
    "hue": 65531,
    "effect": "none",
    "alert": "none",
    "xy": [
      0.4573,
      0.41
    ]
  };

  return setHueGroupState(state || defaultLights);
};

const endMusic = () => {
  return new Promise((resolve, reject) => {
    console.log(getTimestamp() + 'Stopping the music...');
    let httpOptions = {
      hostname: CONFIG.SONOS.HOSTNAME,
      port: CONFIG.SONOS.PORT,
      path: encodeURI(`/${CONFIG.SONOS.ROOM_NAME}/pause`),
      method: 'GET'
    };
    http.request(httpOptions, (result) => {
      console.log(getTimestamp() + 'Request sent to SONOS.');
      resolve(result);
    }).setTimeout(0)
      .on('error', (error) => {
        console.log(getTimestamp() + 'An error occurred while attempting to play the playlist via SONOS:', error);
        reject(error);
      })
      .end();
  });
};

const getTimestamp = () => {
  let date = new Date();
  return date.getHours() + ':' + date.getMinutes() + ':' + date.getSeconds() + '  ';
};


module.exports = router;

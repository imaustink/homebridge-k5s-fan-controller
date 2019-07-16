
'use strict'

const mosca = require('mosca');
const {
  TOGGLE_LIGHT,
  SPEED_STOP,
  SPEED_LOW,
  SPEED_MEDIUM,
  SPEED_HIGH,
  IDENTIFY
} = require('./command-constants')

let Service, Characteristic

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory('K5S-fan-controller', 'K5SFanController', K5SFanController);
};

class K5SFanController {
  constructor(log, { port = 1883 }) {
    const server = this.server = new mosca.Server({ port });
    this.log = log

    server.on('ready', () => console.log('Mosca server is up and running'));

    server.on('published', ({ payload }) => {
      console.log('Published', payload.toString('utf8'));
    });

    server.on('clientConnected', client => {
      console.log('Client Connected:', client.id);
    });


    server.on('clientDisconnected', client => {
      console.log('Client Disconnected:', client.id);
    });
  }

  state = {
    light_on: false,
    fan_speed: 0
  };

  sendCommand(payload, callback) {
    this.server.publish({
      topic: '/fan/control',
      payload,
      qos: 2,
      retain: false
    }, callback);
  }

  identify(callback) {
    this.log("Identify requested!");
    this.sendCommand(IDENTIFY, callback);
  };

  getServices() {
    const fan = new Service.Fan();
    const light = new Service.Lightbulb();
    let debounceTimer;
    let lastError = null;
    const setFanSpeedHandler = (value, callback) => {
      // This is terrible, but the event emitter doesn't emit the next event until callback is called
      if (lastError) {
        callback(lastError);
        lastError = null;
        return;
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      debounceTimer = setTimeout(() => {
        this.setFanSpeed(value, error => {
          lastError = error;
        })
      }, 800);
      callback();
    }

    fan.getCharacteristic(Characteristic.RotationSpeed)
      .setProps({
        minValue: 0,
        maxValue: 100
      })
      .on('get', callback => callback(null, this.state.fan_speed))
      .on('set', setFanSpeedHandler);

    light.getCharacteristic(Characteristic.On)
      .on('get', callback => callback(null, this.state.light_on))
      .on('set', (value, callback) => this.setLightState(value, callback));

    return [fan, light];
  };

  setLightState(value, callback) {
    this.log(`Setting light state to ${value}`);
    this.sendCommand(TOGGLE_LIGHT, callback);
    this.light_on = value;
  };

  setFanSpeed(value, callback) {
    this.log(`Setting fan speed to ${value}`);
    if (value > 90) {
      this.sendCommand(SPEED_HIGH, callback)
    } else if (value > 49) {
      this.sendCommand(SPEED_MEDIUM, callback)
    } else if (value > 1) {
      this.sendCommand(SPEED_LOW, callback)
    } else {
      this.sendCommand(SPEED_STOP, callback)
    }
    this.state.fan_speed = value;
  };
}

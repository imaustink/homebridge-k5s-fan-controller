'use strict'

var mqtt = require('mqtt')
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
  constructor(log, { port = 1883, brokerAddress = 'localhost' }) {

    var client = this.client = client = mqtt.connect(`mqtt://${brokerAddress}:${port}`)

    client.on('connect', function () {
      client.subscribe('presence', function (err) {
        if (!err) {
          client.publish('presence', 'Hello mqtt')
        }
      })
    })

    this.log = log
  }

  state = {
    light_on: false,
    fan_speed: 0
  };

  sendCommand(payload, callback) {
    this.client.publish('/fan/control', payload, { qos: 2 }, callback)
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
      // I think this can go away if I debounce on the client instead.
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
    if (this.state.light_on === value) {
      this.log(`Light is already ${value ? 'on' : 'off'}, ignoring`);
      callback();
      return;
    }
    this.sendCommand(TOGGLE_LIGHT, callback);
    this.state.light_on = value;
    this.log(`Light has been turned ${value ? 'on' : 'off'}`);
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
    this.log(`Fan speed has been set to ${value}`);
  };
}

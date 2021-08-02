import { PlatformAccessory, CharacteristicValue, CharacteristicSetCallback, CharacteristicGetCallback, Characteristic } from 'homebridge';
import { HomebrigdeHomeKitManager } from './platform';
import {PythonShell} from 'python-shell';
import { open } from 'fs';
import { PRIORITY_BELOW_NORMAL } from 'constants';
const sprintf = require('sprintf-js').sprintf;


/**
 * Characteristic "ButtonPairing"
 */
export declare class ButtonPairing extends Characteristic {
    static readonly ACTIVE = true;
    static readonly DISABLE = false;
    static readonly UUID: string;
    constructor();
}


/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class PlatformHomeKitManager {
  public services = {};

  private buffer_get: Array<string> = [];

  public list_event = {};

  private aid: number;

  getInformation(accessory) {
    return accessory.context.device.services.filter(
      (data) => {
        return data.type === '0000003E-0000-1000-8000-0026BB765291';
      },
    );
  }

  getManufacturer(information) {
    return information[0].characteristics.filter(
      (data) => {
        return data.type === '00000020-0000-1000-8000-0026BB765291';
      },
    );
  }

  getModel(information) {
    return information[0].characteristics.filter(
      (data) => {
        return data.type === '00000021-0000-1000-8000-0026BB765291';
      },
    );
  }

  getSerialNumber(information) {
    return information[0].characteristics.filter(
      (data) => {
        return data.type === '00000030-0000-1000-8000-0026BB765291';
      },
    );
  }

  getFirmwareRevision(information) {
    return information[0].characteristics.filter(
      (data) => {
        return data.type === '00000052-0000-1000-8000-0026BB765291';
      },
    );
  }

  getAcessories(accessory) {
    return accessory.context.device.services.filter(
      (data) => {
        return data.type != '0000003E-0000-1000-8000-0026BB765291' && data.type != '00000096-0000-1000-8000-0026BB765291';
      },
    );
  }

  getName(information) {
    return information.characteristics.filter(
      (data) => {
        return data.type === '00000023-0000-1000-8000-0026BB765291';
      },
    );
  }

  getCharacteristics(characteristics){
    return characteristics.filter(
      (data) => {
        return data.type != '00000023-0000-1000-8000-0026BB765291';
      },
    );
  }

  genID(iid){
    return String(this.aid) + '.' + String(iid);
  }

  check_service(service_homekit){
    // eslint-disable-next-line max-len
    return this.accessory.getService((this.getName(service_homekit)[0] || {}).value) || this.accessory.getServiceById(this.uuid_map_accessories[service_homekit.type], service_homekit.iid) || this.accessory.addService(this.uuid_map_accessories[service_homekit.type], (this.getName(service_homekit)[0] || {}).value, service_homekit.iid);
  }

  private uuid_map_accessories = {
    '00000043-0000-1000-8000-0026BB765291': this.platform.Service.Lightbulb,
    '00000089-0000-1000-8000-0026BB765291': this.platform.Service.StatelessProgrammableSwitch,
    '0000007E-0000-1000-8000-0026BB765291': this.platform.Service.SecuritySystem,
    '00000085-0000-1000-8000-0026BB765291': this.platform.Service.MotionSensor,
    '00000082-0000-1000-8000-0026BB765291': this.platform.Service.HumiditySensor,
    '0000008A-0000-1000-8000-0026BB765291': this.platform.Service.TemperatureSensor,
    // '9715BF53-AB63-4449-8DC7-2785D617390A': this.platform.Service.Pairing,
  };

  constructor(
    private readonly platform: HomebrigdeHomeKitManager,
    private readonly accessory: PlatformAccessory,
    private readonly dev_platform,

  ) {

    const information = this.getInformation(accessory);

    this.aid = accessory.context.device.aid;

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, this.getManufacturer(information)[0].value)
      .setCharacteristic(this.platform.Characteristic.Model, this.getModel(information)[0].value)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.getSerialNumber(information)[0].value)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.getFirmwareRevision(information)[0].value);

    for (const service_homekit of this.getAcessories(accessory)) {
      // Accessories Knowledge
      if (service_homekit.type in this.uuid_map_accessories) {
        this.services[service_homekit.iid] = {
          'accessory': this.check_service(service_homekit),
          'homekit': service_homekit,
          'characteristics': {},
        };
        // Add characteristics for each service
        const problem_log = this.associatedCharacteristics(
          this.services[service_homekit.iid],
          this.getCharacteristics(service_homekit.characteristics),
        );
        if (problem_log.length > 0){
          // eslint-disable-next-line max-len
          this.platform.log.warn('characteristic(s) of %s (service) doesn`t map above:\n%s', (this.getName(service_homekit)[0] || {}).value, problem_log);
        }
      }else{
        this.platform.log.debug('Service `%s` doesn`t map:\n%s', service_homekit.type, JSON.stringify(service_homekit, null, 2));
      }
    }

  }

  private uuid_map = {
    '00000025-0000-1000-8000-0026BB765291': this.platform.Characteristic.On,
    '00000008-0000-1000-8000-0026BB765291': this.platform.Characteristic.Brightness,
    '00000013-0000-1000-8000-0026BB765291': this.platform.Characteristic.Hue,
    '0000002F-0000-1000-8000-0026BB765291': this.platform.Characteristic.Saturation,
    '00000073-0000-1000-8000-0026BB765291': this.platform.Characteristic.ProgrammableSwitchEvent,
    '00000066-0000-1000-8000-0026BB765291': this.platform.Characteristic.SecuritySystemCurrentState,
    '00000067-0000-1000-8000-0026BB765291': this.platform.Characteristic.SecuritySystemTargetState,
    '00000022-0000-1000-8000-0026BB765291': this.platform.Characteristic.MotionDetected,
    '00000079-0000-1000-8000-0026BB765291': this.platform.Characteristic.StatusLowBattery,
    '00000011-0000-1000-8000-0026BB765291': this.platform.Characteristic.CurrentTemperature,
    '00000010-0000-1000-8000-0026BB765291': this.platform.Characteristic.CurrentRelativeHumidity,
  };



  associatedCharacteristics(accessory, characteristics){
    let problem_associatedCharacteristics = '';
    for (const element of characteristics){
      const iid = String(element.iid);
      if(element.type in this.uuid_map){
        const characteristic = accessory.accessory.getCharacteristic(this.uuid_map[element.type]);
        if (element.perms.includes('pr')){
          characteristic.on('get', this.get.bind(this, this.genID(element.iid)));
        }
        if (element.perms.includes('pw')){
          characteristic.on('set', this.set.bind(this, this.genID(element.iid)));
        }
        if (element.perms.includes('ev')){
          // eslint-disable-next-line max-len
          this.list_event[this.genID(element.iid)] = {
            'iid': iid,
            'full_id': this.genID(element.iid),
            'accessory': accessory,
            'type': this.uuid_map[element.type],
          };
        }
      }else{
        problem_associatedCharacteristics += sprintf('%s\n', JSON.stringify(element, null, 2));
      }
    }
    return problem_associatedCharacteristics;
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  set(characteristicId, value: CharacteristicValue, callback: CharacteristicSetCallback) {

    const options = {
      pythonOptions: ['-m'],
      args: ['-f', String(this.platform.config.configFile), '-a', this.dev_platform, '-c', characteristicId, String(value)],  //TODO
    };

    this.platform.log.debug('Set Characteristic "%s" to "%s" Homekit "aqara" device', characteristicId, String(value));
    PythonShell.run('homekit.put_characteristic', options, (err) => {
      if (err) {
        this.platform.log.error('Deu pau no set %s', err);
      }
    });
    // you must call the callback function
    callback(null);
  }

  get(characteristicId, callback: CharacteristicGetCallback) {
    this.platform.log.debug('Get Characteristic "%s" Homekit "aqara" device', characteristicId);
    const options = {
      pythonOptions: ['-m'],
      args: ['-f', String(this.platform.config.configFile), '-a', this.dev_platform, '-c', characteristicId],  //TODO
    };
    PythonShell.run('homekit.get_characteristic', options, (err, results) => {
      if (err) {
        this.platform.log.error('Deu pau "%s" no get %s', characteristicId, err);
      }
      try {
        this.platform.log.debug('dict of %s %s', characteristicId, results);
        const dict = (results as Array<string>).join('');
        this.platform.log.debug('dict %s', dict);
        const value = JSON.parse(dict)[characteristicId].value;
        this.platform.log.debug('value %s', value);
        callback(null, value);
      } catch(e){
        callback(null);
      }
    });
  }



  sync_status(){
    // this.platform.log.debug('test information %s', this.buffer_get.length > 0);
    // setInterval(() => {
    //   if (this.buffer_get.length > 0){
    //     this.platform.log.debug('Get information');
    //     this.get_hub_information();
    //   }
    // }, 10000);
  }


  get_hub_information(){
    const list_exec: Array<string> = [];

    this.platform.log.debug('Get Characteristic from Homekit "aqara" device');
    const options = {
      pythonOptions: ['-m'],
      args: ['-f', String(this.platform.config.configFile), '-a', this.dev_platform],  //TODO
    };

    for (const item of this.buffer_get){
      options.args.push('-c', item);
      list_exec.push(item);
    }
    PythonShell.run('homekit.get_characteristic', options, (err, results) => {
      if (err) {
        this.platform.log.error('Deu pau no get %s', err);
        return;
      }
      try {
        // this.platform.log.debug('dict: %s', results);
        const dict = (results as Array<string>).join('');
        this.platform.log.debug('dict %s', dict);
        const response = JSON.parse(dict);
        this.platform.log.error('this.buffer_get %s', this.buffer_get);


        // this.platform.log.error('list %s', this.services['65792']);

        Object.keys(response).forEach((key) => {
          this.buffer_get = this.buffer_get.filter((s) => {
            return s !== key;
          });

        });
        this.platform.log.debug('value %s', response);

      // eslint-disable-next-line no-empty
      } catch(e){}
    });
  }
}

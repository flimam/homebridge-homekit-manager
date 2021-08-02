import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { PlatformHomeKitManager } from './platformAccessory';
import { PythonShell } from 'python-shell';
import { platform } from 'os';
import { request } from 'http';
const axios = require('axios');
const sprintf = require('sprintf-js').sprintf;

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class HomebrigdeHomeKitManager implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  private list_event = {};

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    this.log.debug('config:', this.config);

    if (String(this.config.configFile).length > 0){
      log.debug('Starting homekit ...');
      this.homekitInit();

      //Python code
      this.homekitDiscoverDevices();
    }else{
      this.log.error('`configFile` missing in homebrigde.conf, please using absolute path to more security');
    }

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories

      this.discoverDevices();
    });
  }

  parseHomekitDiscovery(item){
    const description = item.split('\n');
    const result = {};
    for (let index = 0; index < description.length; index++) {
      const div = description[index].indexOf(':');
      const line = description[index].substring(0, div);
      switch (line) {
        case 'Name':
          result['name'] = description[index].substring(div+1);
          break;
        case 'Device ID (id)':
          result['device_id'] = description[index].substring(div+1);
          break;
        case 'Model Name (md)':
          result['model'] = description[index].substring(div+1);
          break;
        default:
          break;
      }
    }
    return result;
  }

  homekitInit(){
    PythonShell.run('homekit.init_controller_storage', {
      pythonOptions: ['-m'],
      args: ['-f', String(this.config.configFile)],
    }, (err) => {
      if (err) {
        this.log.error('There is no package in host\n\n is required install the package: `python3 -m pip install homekit` \n\n' + err);
      }
    });
  }

  homekitDiscoverDevices(){
    PythonShell.run('homekit.discover', {
      pythonOptions: ['-m'],
    }, (err, results) => {
      if (err) {
        this.log.error('Problem in python execution ...');
        throw err;
      }
      let discovery_response = '';
      let discovery_response_debug = '';
      let devices;
      if (results !== null){
        // log.error((results as Array<string>).join('\n'));
        devices = ((results as Array<string>).join('\n')).replace(/Name:/gi, '||Name:').split('||');
        if (devices.length > 0){
          // eslint-disable-next-line max-len
          discovery_response += sprintf('\n\nYou can add devices already in your local network, using the commands above in Terminal shell on homebridge host:\n\t (Replace XXX-XX-XXX to device pin code) \n\n');
          for (let index = 0; index < devices.length; index++) {
            discovery_response_debug += sprintf('%s\n', devices[index]) ;

            if (devices[index].length>0){
              const new_device = this.parseHomekitDiscovery(devices[index]);
              const name_device = new_device['model'].replace(/ /gi, '_');
              if (!(this.config.devicesUsed as Array<string>).includes(name_device)) {
                discovery_response += sprintf(
                  '\n\nDevice: %s(%s)\n'+
                '\tCommand: python -m homekit.pair -d %s -p XXX-XX-XXX -f %s -a %s\n'+
                '\tName to add in homebrigde.conf: %s',
                  new_device['name'],
                  new_device['model'],
                  new_device['device_id'],
                  String(this.config.configFile),
                  name_device,
                  name_device,
                );
              }
            }
          }
        }
        this.log.debug('\n\n%s\n\n', discovery_response_debug);
        this.log.info(discovery_response + '\n\n');
      }
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to setup event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    // this.log.info('opaaa paraceu ai', accessory);
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {

    for ( const dev_platform of (this.config.devicesUsed as Array<string>) ){
      const options = {
        pythonOptions: ['-m'],
        args: ['-f', String(this.config.configFile), '-a', String(dev_platform), '-o', 'json'],
      };

      PythonShell.run('homekit.get_accessories', options, (err, results) => {
        if (err) {
          // eslint-disable-next-line max-len
          this.log.error('There is a problem! Could have three possibilities:\n 1 - ConfigFile path is wrong (%s).\n 2 - devicesUsed list has wrong names (%s).\n 3 - You need pair device, yet.\n\n Show more : %s', String(this.config.configFile), String(dev_platform), err);
          return;
        }
        let devices;
        if (results !== null){
          devices = JSON.parse((results as Array<string>).join(''));
        }

        this.log.debug('Loop "%s" devices  Homekit', String(dev_platform));
        for (const device of devices) {
          const uuid = this.api.hap.uuid.generate(String(device.aid));

          // see if an accessory with the same uuid has already been registered and restored from
          // the cached devices we stored in the `configureAccessory` method above
          const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

          if (existingAccessory) {
            // the accessory already exists
            // if (device) {
            this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

            // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
            // existingAccessory.context.device = device;
            // this.api.updatePlatformAccessories([existingAccessory]);

            // create the accessory handler for the restored accessory
            // this is imported from `platformAccessory.ts`
            const acessory = new PlatformHomeKitManager(this, existingAccessory, String(dev_platform));
            // acessory.sync_status();
            this.list_event = Object.assign({}, this.list_event, acessory.list_event);

            // update accessory cache with any changes to the accessory details and information
            this.api.updatePlatformAccessories([existingAccessory]);
            // } else if (!device) {
            //   // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, eg.:
            //   // remove platform accessories when no longer present
            //   this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
            //   this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
            // }
          } else {
            // the accessory does not yet exist, so we need to create it
            this.log.info('Adding new accessory:', device.services[0].characteristics[2].value);

            // create a new accessory
            const accessory = new this.api.platformAccessory(device.services[0].characteristics[2].value, uuid);


            // store a copy of the device object in the `accessory.context`
            // the `context` property can be used to store any data about the accessory you may need
            accessory.context.device = device;

            this.log.info(accessory.context.device);

            // create the accessory handler for the newly create accessory
            // this is imported from `platformAccessory.ts`
            const acessory = new PlatformHomeKitManager(this, accessory, String(dev_platform));

            this.list_event = Object.assign({}, this.list_event, acessory.list_event);

            // link the accessory to your platform
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          }
        }
        this.homekit_event_listen(String(dev_platform));
      });
    }

  }


  // Watch changed event
  homekit_event_listen(dev_platform){
    this.log.info('watch event Homekit');

    // Build parameter to python watch event
    const options = {
      pythonOptions: ['-um'],
      args: ['-f', String(this.config.configFile), '-a', dev_platform],  //TODO
    };

    Object.keys(this.list_event).forEach((key) => {
      options.args.push('-c', key);
    });

    // If not event
    if(Object.keys(this.list_event).length === 0){
      return;
    }

    // Execution
    const shell = new PythonShell('homekit.get_events', options);
    shell.on('message', (message) => {
      const value = message.substr(message.lastIndexOf(':')+1);
      const characteristic = (message.substr(10, message.lastIndexOf(':')).split(':')[0]);
      this.log.info('teste "%s"', characteristic);
      this.log.info('event %s', value);
      this.log.debug('events %s', this.list_event[characteristic]);
      this.list_event[characteristic].accessory.accessory.updateCharacteristic(
        this.list_event[characteristic].type,
        value,
      );


      // Proactive option (Will send to endpoint the status changed), on development yet
      if (characteristic in Object(this.config.actions)){
        Object(this.config.actions)[characteristic];

        this.log.info('DEU CERTO %s', value);

        const url: string = Object(this.config.actions)[characteristic];

        this.log.debug(' %s', url );

        // axios({
        //   method: 'post',
        //   url: url,
        //   responseType: 'json',
        //   headers: {
        //     'Content-Type': 'application/json',
        //   },
        //   data: {
        //     value: value,
        //     characteristic: characteristic,
        //     object: this.list_event[characteristic],
        //   },
        // }).then( (response) => {
        //   this.log.info('Retorno %s', response.status);
        // });

        // axios.get({
        //   url,
        //   responseType: 'json',
        //   headers: {
        //     'Content-Type': 'application/json',
        //   },
        // }).then((response) => {
        //   this.log.info(response.data);
        //   this.log.info(response.status);
        //   this.log.info(response.statusText);
        //   this.log.info(response.headers);
        //   this.log.info(response.config);
        // });


      }

    });
    shell.end((err, code, signal) => {
      if (err) {
        this.log.error('Problem in event: %s', err);
      }
      this.log.error('The exit code was: ' + code);
      this.log.error('The exit signal was: ' + signal);
      this.log.error('finished');
      if (signal !== 'SIGTERM'){
        this.log.error('restart event_listen(%s, %s, %s)');
        this.homekit_event_listen(dev_platform);
      }
    });
  }

}

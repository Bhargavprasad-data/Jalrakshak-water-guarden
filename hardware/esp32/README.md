# ESP32 Hardware Setup Guide

## Components Required

1. **ESP32 Development Board** (ESP32-WROOM-32)
2. **Flow Sensor** (Hall Effect, YF-S201 or similar)
3. **Pressure Sensor** (0-10 bar analog, MPX5700AP or similar)
4. **Turbidity Sensor** (Analog, SEN0189 or similar)
5. **Temperature Sensor** (DS18B20 waterproof)
6. **GPS Module** (NEO-6M)
7. **Power Supply** (5V/3A or battery with charging circuit)
8. **Resistors** (10kΩ for pull-up, voltage dividers)
9. **Jumper wires and breadboard/PCB**

## Wiring Diagram

```
ESP32 Pin    Component
--------     ---------
GPIO 4       Flow Sensor (Digital, Interrupt)
GPIO 34      Pressure Sensor (Analog)
GPIO 35      Turbidity Sensor (Analog)
GPIO 5       DS18B20 Temperature (OneWire)
GPIO 16      GPS RX
GPIO 17      GPS TX
3.3V         Sensor VCC
GND          Common Ground
5V           GPS VCC (if 5V module)
```

## Sensor Connections

### Flow Sensor (YF-S201)
- Red wire → 5V
- Black wire → GND
- Yellow wire → GPIO 4 (with 10kΩ pull-up to 3.3V)

### Pressure Sensor (MPX5700AP)
- Pin 1 (Vout) → GPIO 34 (via voltage divider if needed)
- Pin 2 (GND) → GND
- Pin 3 (Vs) → 3.3V

### Turbidity Sensor
- VCC → 3.3V
- GND → GND
- Signal → GPIO 35

### DS18B20 Temperature
- Red (VCC) → 3.3V
- Black (GND) → GND
- Yellow (Data) → GPIO 5 (with 4.7kΩ pull-up to 3.3V)

### GPS Module (NEO-6M)
- VCC → 5V (or 3.3V if module supports)
- GND → GND
- TX → GPIO 16 (ESP32 RX)
- RX → GPIO 17 (ESP32 TX)

## Configuration

1. **Update WiFi credentials** in `jalrakshak_firmware.ino`:
   ```cpp
   const char* ssid = "YOUR_WIFI_SSID";
   const char* password = "YOUR_WIFI_PASSWORD";
   ```

2. **Update MQTT server**:
   ```cpp
   const char* mqtt_server = "YOUR_MQTT_SERVER";
   ```

3. **Update device ID** (unique for each device):
   ```cpp
   const char* device_id = "ESP32_001";
   ```

4. **Calibrate sensors**:
   - Adjust `FLOW_CALIBRATION_FACTOR` based on your flow sensor
   - Adjust pressure sensor mapping based on ADC range
   - Calibrate turbidity sensor with known samples

## Flashing Firmware

### Using Arduino IDE

1. Install ESP32 board support:
   - File → Preferences → Additional Board Manager URLs
   - Add: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
   - Tools → Board → Boards Manager → Search "ESP32" → Install

2. Install required libraries:
   - PubSubClient (MQTT)
   - ArduinoJson
   - OneWire
   - DallasTemperature
   - TinyGPS++

3. Open `jalrakshak_firmware.ino`

4. Select board: Tools → Board → ESP32 Dev Module

5. Upload

### Using PlatformIO

1. Create `platformio.ini`:
   ```ini
   [env:esp32dev]
   platform = espressif32
   board = esp32dev
   framework = arduino
   lib_deps = 
       knolleary/PubSubClient@^2.8
       bblanchon/ArduinoJson@^6.21.0
       paulstoffregen/OneWire@^2.3.7
       paulstoffregen/DallasTemperature@^3.11.0
       mikalhart/TinyGPSPlus@^1.0.3
   ```

2. Run: `pio run -t upload`

## Testing

1. Open Serial Monitor (115200 baud)
2. Check WiFi connection
3. Verify MQTT connection
4. Monitor sensor readings
5. Check data transmission every 10 seconds

## Troubleshooting

- **WiFi not connecting**: Check SSID/password, signal strength
- **MQTT fails**: Verify server address, port, network connectivity
- **Sensors read 0**: Check wiring, power supply, sensor calibration
- **GPS not working**: Ensure clear sky view, wait for satellite lock
- **Data not transmitting**: Check HTTP fallback endpoint, network connectivity

## Bill of Materials (BOM)

| Component | Quantity | Approx. Cost (INR) |
|-----------|----------|-------------------|
| ESP32 Dev Board | 1 | 300 |
| Flow Sensor | 1 | 200 |
| Pressure Sensor | 1 | 400 |
| Turbidity Sensor | 1 | 500 |
| DS18B20 | 1 | 150 |
| GPS Module | 1 | 300 |
| Resistors | 5 | 50 |
| Enclosure | 1 | 200 |
| Power Supply | 1 | 300 |
| **Total** | | **~2,400** |

## Power Consumption

- ESP32: ~80mA (active), ~10mA (sleep)
- Sensors: ~50mA total
- GPS: ~25mA
- **Total**: ~155mA @ 3.3V

For battery operation, use 18650 Li-ion (2600mAh) with TP4056 charger module.
Expected battery life: ~16 hours continuous operation.







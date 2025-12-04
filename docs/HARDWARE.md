# Hardware Setup Guide

## Bill of Materials (BOM)

| Component | Quantity | Approx. Cost (INR) | Supplier |
|-----------|----------|-------------------|----------|
| ESP32 Development Board | 1 | 300 | Local/Online |
| Flow Sensor (YF-S201) | 1 | 200 | Online |
| Pressure Sensor (MPX5700AP) | 1 | 400 | Online |
| Turbidity Sensor (SEN0189) | 1 | 500 | Online |
| DS18B20 Temperature Sensor | 1 | 150 | Online |
| GPS Module (NEO-6M) | 1 | 300 | Online |
| Resistors (10kΩ, 4.7kΩ) | 5 | 50 | Local |
| Jumper Wires | 20 | 100 | Local |
| Breadboard/PCB | 1 | 200 | Local |
| Enclosure (IP65) | 1 | 500 | Local |
| Power Supply (5V/3A) | 1 | 300 | Local |
| **Total per unit** | | **~2,400** | |

## Wiring Diagram

```
ESP32 Pin    Component          Connection
--------     ---------          -----------
GPIO 4       Flow Sensor        Digital Input (with 10kΩ pull-up)
GPIO 34      Pressure Sensor    Analog Input
GPIO 35      Turbidity Sensor   Analog Input
GPIO 5       DS18B20            OneWire (with 4.7kΩ pull-up)
GPIO 16      GPS RX             Serial RX
GPIO 17      GPS TX             Serial TX
3.3V         Sensors VCC        Power
GND          Common Ground       Ground
5V           GPS VCC            Power (if 5V module)
```

## Sensor Calibration

### Flow Sensor
- Calibration factor: 4.5 pulses per liter (adjust based on sensor)
- Test with known water volume to calibrate

### Pressure Sensor
- ADC range: 0-4095 (12-bit)
- Pressure range: 0-10 bar
- Formula: `pressure = (ADC_value / 4095) * 10`

### Turbidity Sensor
- ADC range: 0-4095
- Turbidity range: 0-100 NTU
- Calibrate with standard turbidity solutions

### Temperature Sensor
- DS18B20 provides direct temperature reading
- No calibration needed

## Power Consumption

- ESP32: ~80mA (active), ~10mA (sleep)
- Sensors: ~50mA total
- GPS: ~25mA
- **Total**: ~155mA @ 3.3V

For battery operation:
- Use 18650 Li-ion (2600mAh) with TP4056 charger
- Expected battery life: ~16 hours continuous
- Add solar panel (5W) for extended operation

## Installation Steps

1. **Assemble hardware** on breadboard/PCB
2. **Flash firmware** using Arduino IDE or PlatformIO
3. **Configure WiFi** credentials in firmware
4. **Test sensors** individually
5. **Deploy** in waterproof enclosure
6. **Mount** at monitoring location
7. **Verify** data transmission

## Troubleshooting

- **WiFi not connecting**: Check SSID/password, signal strength
- **MQTT fails**: Verify server address, network connectivity
- **Sensors read 0**: Check wiring, power supply, sensor calibration
- **GPS not working**: Ensure clear sky view, wait for satellite lock
- **Data not transmitting**: Check HTTP fallback endpoint

## Maintenance

- Clean sensors monthly
- Check battery/power supply weekly
- Verify GPS antenna positioning
- Update firmware as needed
- Replace sensors per manufacturer recommendations







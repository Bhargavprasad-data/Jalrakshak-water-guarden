/*
 * JalRakshak ESP32 Firmware
 * IoT Water Supply Monitoring System
 * 
 * Sensors:
 * - Flow Sensor (Hall Effect)
 * - Pressure Sensor (Analog)
 * - Turbidity Sensor (Analog)
 * - Temperature Sensor (DS18B20)
 * - GPS Module (NEO-6M)
 * 
 * Communication:
 * - MQTT (Primary)
 * - HTTP (Fallback)
 * 
 * Data transmission: Every 10 seconds
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <TinyGPS++.h>
#include <HardwareSerial.h>

// WiFi Credentials
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// MQTT Configuration
const char* mqtt_server = "YOUR_MQTT_SERVER";
const int mqtt_port = 1883;
const char* mqtt_topic = "jalrakshak/DEVICE_ID/telemetry";
const char* device_id = "ESP32_001"; // Change for each device

// HTTP Fallback
const char* http_endpoint = "http://YOUR_SERVER:3000/api/telemetry";

// Sensor Pins
#define FLOW_SENSOR_PIN 4        // Digital pin for flow sensor (interrupt)
#define PRESSURE_SENSOR_PIN 34   // Analog pin for pressure sensor
#define TURBIDITY_SENSOR_PIN 35  // Analog pin for turbidity sensor
#define TEMP_SENSOR_PIN 5        // OneWire pin for DS18B20
#define GPS_RX_PIN 16            // GPS RX
#define GPS_TX_PIN 17            // GPS TX

// Sensor Calibration
#define FLOW_CALIBRATION_FACTOR 4.5  // Pulses per liter
#define PRESSURE_MIN 0.0              // Minimum pressure (bar)
#define PRESSURE_MAX 10.0             // Maximum pressure (bar)
#define PRESSURE_ADC_MIN 0            // ADC value at min pressure
#define PRESSURE_ADC_MAX 4095         // ADC value at max pressure
#define TURBIDITY_MIN 0               // Minimum turbidity (NTU)
#define TURBIDITY_MAX 100             // Maximum turbidity (NTU)

// Variables
WiFiClient espClient;
PubSubClient mqttClient(espClient);
HTTPClient http;
OneWire oneWire(TEMP_SENSOR_PIN);
DallasTemperature tempSensor(&oneWire);
HardwareSerial gpsSerial(2);
TinyGPS++ gps;

// Flow sensor variables
volatile int flowPulseCount = 0;
unsigned long lastFlowTime = 0;
float flowRate = 0.0; // L/min

// GPS variables
float gpsLat = 0.0;
float gpsLon = 0.0;
bool gpsValid = false;

// Battery monitoring (if using battery)
int batteryLevel = 100; // Percentage (0-100)

// Pump status (if connected to pump relay)
bool pumpStatus = false;

// Timing
unsigned long lastTransmission = 0;
const unsigned long transmissionInterval = 10000; // 10 seconds

// Interrupt handler for flow sensor
void IRAM_ATTR flowPulse() {
  flowPulseCount++;
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("JalRakshak ESP32 Starting...");

  // Initialize sensors
  pinMode(FLOW_SENSOR_PIN, INPUT_PULLUP);
  pinMode(PRESSURE_SENSOR_PIN, INPUT);
  pinMode(TURBIDITY_SENSOR_PIN, INPUT);
  
  // Attach interrupt for flow sensor
  attachInterrupt(digitalPinToInterrupt(FLOW_SENSOR_PIN), flowPulse, RISING);

  // Initialize temperature sensor
  tempSensor.begin();

  // Initialize GPS
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);

  // Connect to WiFi
  connectWiFi();

  // Connect to MQTT
  mqttClient.setServer(mqtt_server, mqtt_port);
  mqttClient.setCallback(mqttCallback);
  connectMQTT();

  Serial.println("Setup complete. Starting main loop...");
}

void loop() {
  // Maintain WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  // Maintain MQTT connection
  if (!mqttClient.connected()) {
    connectMQTT();
  }
  mqttClient.loop();

  // Read GPS
  readGPS();

  // Calculate flow rate
  calculateFlowRate();

  // Transmit data every 10 seconds
  if (millis() - lastTransmission >= transmissionInterval) {
    readSensors();
    transmitData();
    lastTransmission = millis();
  }

  delay(100);
}

void connectWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi connection failed!");
  }
}

void connectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Connecting to MQTT...");
    
    if (mqttClient.connect(device_id)) {
      Serial.println("MQTT connected!");
      String topic = String(mqtt_topic);
      mqttClient.subscribe((topic + "/command").c_str());
    } else {
      Serial.print("MQTT connection failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" Retrying in 5 seconds...");
      delay(5000);
    }
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  // Handle incoming MQTT commands
  Serial.print("Message received on topic: ");
  Serial.println(topic);
  
  // Parse command and respond if needed
  // Example: pump control, sensor calibration, etc.
}

void readGPS() {
  while (gpsSerial.available() > 0) {
    if (gps.encode(gpsSerial.read())) {
      if (gps.location.isValid()) {
        gpsLat = gps.location.lat();
        gpsLon = gps.location.lng();
        gpsValid = true;
      }
    }
  }
}

void calculateFlowRate() {
  unsigned long currentTime = millis();
  unsigned long timeDiff = currentTime - lastFlowTime;
  
  if (timeDiff >= 1000) { // Calculate every second
    if (flowPulseCount > 0) {
      // Convert pulses to liters per minute
      float liters = flowPulseCount / FLOW_CALIBRATION_FACTOR;
      flowRate = (liters / (timeDiff / 1000.0)) * 60.0; // L/min
      flowPulseCount = 0;
    } else {
      flowRate = 0.0;
    }
    lastFlowTime = currentTime;
  }
}

void readSensors() {
  // Read pressure sensor
  int pressureADC = analogRead(PRESSURE_SENSOR_PIN);
  float pressure = map(pressureADC, PRESSURE_ADC_MIN, PRESSURE_ADC_MAX, 
                       PRESSURE_MIN * 100, PRESSURE_MAX * 100) / 100.0;

  // Read turbidity sensor
  int turbidityADC = analogRead(TURBIDITY_SENSOR_PIN);
  float turbidity = map(turbidityADC, 0, 4095, TURBIDITY_MIN, TURBIDITY_MAX);

  // Read temperature
  tempSensor.requestTemperatures();
  float temperature = tempSensor.getTempCByIndex(0);

  // Read battery level (if battery monitoring circuit exists)
  // batteryLevel = readBatteryLevel();

  // Read pump status (if connected)
  // pumpStatus = digitalRead(PUMP_RELAY_PIN);

  // Store sensor values (will be sent in transmitData)
  sensorData.flow_rate = flowRate;
  sensorData.pressure = pressure;
  sensorData.turbidity = turbidity;
  sensorData.temperature = temperature;
  sensorData.battery_level = batteryLevel;
  sensorData.pump_status = pumpStatus ? "on" : "off";
  sensorData.gps_lat = gpsLat;
  sensorData.gps_lon = gpsLon;
  sensorData.timestamp = millis();
}

// Sensor data structure
struct SensorData {
  float flow_rate;
  float pressure;
  float turbidity;
  float temperature;
  int battery_level;
  String pump_status;
  float gps_lat;
  float gps_lon;
  unsigned long timestamp;
} sensorData;

void transmitData() {
  // Create JSON payload
  StaticJsonDocument<512> doc;
  doc["device_id"] = device_id;
  doc["flow_rate"] = sensorData.flow_rate;
  doc["pressure"] = sensorData.pressure;
  doc["turbidity"] = sensorData.turbidity;
  doc["temperature"] = sensorData.temperature;
  doc["battery_level"] = sensorData.battery_level;
  doc["pump_status"] = sensorData.pump_status;
  doc["gps_lat"] = sensorData.gps_lat;
  doc["gps_lon"] = sensorData.gps_lon;
  doc["timestamp"] = sensorData.timestamp;

  String payload;
  serializeJson(doc, payload);

  Serial.println("Transmitting data:");
  Serial.println(payload);

  // Try MQTT first
  bool mqttSuccess = false;
  if (mqttClient.connected()) {
    String topic = String(mqtt_topic);
    if (mqttClient.publish(topic.c_str(), payload.c_str())) {
      mqttSuccess = true;
      Serial.println("Data sent via MQTT");
    }
  }

  // Fallback to HTTP if MQTT fails
  if (!mqttSuccess) {
    Serial.println("MQTT failed, trying HTTP...");
    sendHTTP(payload);
  }
}

void sendHTTP(String payload) {
  http.begin(http_endpoint);
  http.addHeader("Content-Type", "application/json");

  int httpResponseCode = http.POST(payload);

  if (httpResponseCode > 0) {
    Serial.print("HTTP Response code: ");
    Serial.println(httpResponseCode);
    String response = http.getString();
    Serial.println(response);
  } else {
    Serial.print("HTTP Error: ");
    Serial.println(httpResponseCode);
  }

  http.end();
}







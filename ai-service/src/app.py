from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv
from services.anomaly_detector import AnomalyDetector
from services.leak_detector import LeakDetector
from services.contamination_detector import ContaminationDetector
from services.maintenance_predictor import MaintenancePredictor

load_dotenv()

app = Flask(__name__)
CORS(app)

# Initialize AI models
anomaly_detector = AnomalyDetector()
leak_detector = LeakDetector()
contamination_detector = ContaminationDetector()
maintenance_predictor = MaintenancePredictor()


def clamp(value, min_value, max_value):
    return max(min_value, min(value, max_value))


def score_turbidity(turbidity):
    if turbidity is None:
        return 60
    # NTU: 0 best, 50 worst
    return clamp(100 - (clamp(turbidity, 0, 50) / 50) * 100, 0, 100)


def score_conductivity(conductivity):
    if conductivity is None:
        return 65
    # µS/cm: <500 good, 1500 poor
    return clamp(100 - ((clamp(conductivity, 0, 1500) - 250) / 1250) * 100, 0, 100)


def score_temperature(temperature):
    if temperature is None:
        return 70
    # Ideal 15-30°C
    if 15 <= temperature <= 30:
        return 100
    deviation = min(abs(temperature - 22.5), 15)
    return clamp(100 - (deviation / 15) * 100, 0, 100)


def score_ph(ph):
    if ph is None:
        return 70
    ideal = 7.4
    deviation = abs(ph - ideal)
    if deviation >= 3:
        return 0
    return clamp(100 - (deviation / 3) * 100, 0, 100)


def classify_wqi(wqi):
    if wqi >= 80:
        return {
            'status': 'good',
            'color': 'green',
            'indicator': '🟢',
            'message': 'Water quality is good and safe for supply.'
        }
    if wqi >= 60:
        return {
            'status': 'average',
            'color': 'yellow',
            'indicator': '🟡',
            'message': 'Water quality is acceptable but should be monitored.'
        }
    return {
        'status': 'bad',
        'color': 'red',
        'indicator': '🔴',
        'message': 'Water quality is poor. Immediate action required.'
    }


def calculate_water_quality(turbidity, ph, temperature, conductivity):
    turbidity_score = score_turbidity(turbidity)
    ph_score = score_ph(ph)
    temperature_score = score_temperature(temperature)
    conductivity_score = score_conductivity(conductivity)

    # Weighted WQI
    wqi = (
        turbidity_score * 0.3 +
        ph_score * 0.3 +
        temperature_score * 0.2 +
        conductivity_score * 0.2
    )
    wqi = round(wqi, 2)

    classification = classify_wqi(wqi)
    return {
        'wqi': wqi,
        **classification
    }

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'service': 'jalrakshak-ai'})

@app.route('/analyze', methods=['POST'])
def analyze():
    """
    Main analysis endpoint - detects anomalies in real-time telemetry
    """
    try:
        data = request.json
        device_id = data.get('device_id')
        flow_rate = data.get('flow_rate', 0)
        pressure = data.get('pressure', 0)
        turbidity = data.get('turbidity', 0)
        temperature = data.get('temperature', 0)
        ph = data.get('ph')
        conductivity = data.get('conductivity')
        timestamp = data.get('timestamp')
        gps_lat = data.get('gps_lat')
        gps_lon = data.get('gps_lon')

        # Anomaly detection
        anomaly_result = anomaly_detector.detect(
            flow_rate=flow_rate,
            pressure=pressure,
            turbidity=turbidity,
            temperature=temperature,
            device_id=device_id
        )

        # Leak detection (if pressure/flow anomaly)
        leak_result = None
        if anomaly_result.get('anomaly_detected') and anomaly_result.get('anomaly_type') in ['leak', 'pressure_anomaly']:
            leak_result = leak_detector.detect(
                device_id=device_id,
                pressure=pressure,
                flow_rate=flow_rate,
                gps_lat=gps_lat,
                gps_lon=gps_lon
            )

        # Contamination detection (if turbidity anomaly)
        contamination_result = None
        if anomaly_result.get('anomaly_detected') and anomaly_result.get('anomaly_type') in ['contamination', 'turbidity_anomaly']:
            contamination_result = contamination_detector.detect(
                device_id=device_id,
                turbidity=turbidity,
                temperature=temperature,
                gps_lat=gps_lat,
                gps_lon=gps_lon
            )

        # Water quality index
        water_quality = calculate_water_quality(
            turbidity=turbidity,
            ph=ph,
            temperature=temperature,
            conductivity=conductivity
        )

        # Combine results
        result = {
            'anomaly_detected': anomaly_result.get('anomaly_detected', False),
            'anomaly_type': anomaly_result.get('anomaly_type'),
            'severity': anomaly_result.get('severity', 'low'),
            'confidence': anomaly_result.get('confidence', 0),
            'description': anomaly_result.get('description', ''),
            'gps_estimate': leak_result.get('gps_estimate') if leak_result else None,
            'recommended_action': anomaly_result.get('recommended_action', ''),
            'water_quality': water_quality
        }

        # Merge leak/contamination specific data
        if leak_result:
            result['leak_details'] = leak_result
            result['gps_estimate'] = leak_result.get('gps_estimate')

        if contamination_result:
            result['contamination_details'] = contamination_result

        return jsonify(result)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/detect-leak', methods=['POST'])
def detect_leak():
    """
    Dedicated leak detection endpoint
    """
    try:
        data = request.json
        device_id = data.get('device_id')
        pressure_data = data.get('pressure_data', [])
        flow_data = data.get('flow_data', [])

        result = leak_detector.detect_with_history(
            device_id=device_id,
            pressure_data=pressure_data,
            flow_data=flow_data
        )

        return jsonify(result)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/predict-maintenance', methods=['POST'])
def predict_maintenance():
    """
    Predictive maintenance endpoint
    """
    try:
        data = request.json
        device_id = data.get('device_id')
        historical_data = data.get('historical_data', [])

        result = maintenance_predictor.predict(
            device_id=device_id,
            historical_data=historical_data
        )

        return jsonify(result)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)


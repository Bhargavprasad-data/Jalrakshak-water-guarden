import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import IsolationForest

class ContaminationDetector:
    def __init__(self):
        # Water quality thresholds
        self.turbidity_safe = 5.0  # NTU
        self.turbidity_warning = 7.0  # NTU
        self.turbidity_critical = 10.0  # NTU
        self.temperature_range = (15, 35)  # Celsius

    def detect(self, device_id, turbidity, temperature, gps_lat=None, gps_lon=None):
        """
        Detect water contamination based on turbidity and temperature
        """
        contamination_detected = False
        severity = 'low'
        confidence = 0
        description = ''

        # Check turbidity levels
        if turbidity >= self.turbidity_critical:
            contamination_detected = True
            severity = 'critical'
            confidence = 0.95
            description = f'Critical contamination detected: Turbidity {turbidity:.2f} NTU exceeds safe limit (5 NTU)'
        elif turbidity >= self.turbidity_warning:
            contamination_detected = True
            severity = 'high'
            confidence = 0.8
            description = f'High contamination risk: Turbidity {turbidity:.2f} NTU above warning threshold'
        elif turbidity >= self.turbidity_safe:
            contamination_detected = True
            severity = 'medium'
            confidence = 0.6
            description = f'Moderate contamination: Turbidity {turbidity:.2f} NTU above safe limit'

        # Check temperature anomalies (can indicate contamination source)
        if temperature < self.temperature_range[0] or temperature > self.temperature_range[1]:
            if contamination_detected:
                confidence = min(confidence + 0.1, 1.0)
                description += f'. Temperature anomaly: {temperature:.2f}°C'
            else:
                contamination_detected = True
                severity = 'low'
                confidence = 0.5
                description = f'Temperature anomaly detected: {temperature:.2f}°C (expected: 15-35°C)'

        gps_estimate = None
        if contamination_detected and gps_lat and gps_lon:
            gps_estimate = {
                'lat': gps_lat,
                'lon': gps_lon,
                'confidence': confidence,
                'method': 'sensor_location'
            }

        return {
            'contamination_detected': contamination_detected,
            'severity': severity,
            'confidence': confidence,
            'description': description,
            'turbidity': turbidity,
            'temperature': temperature,
            'gps_estimate': gps_estimate,
            'recommended_action': self._get_action(severity)
        }

    def _get_action(self, severity):
        """Get recommended action based on severity"""
        actions = {
            'critical': 'IMMEDIATE: Stop water supply. Notify health authorities. Conduct emergency water quality test.',
            'high': 'URGENT: Issue public advisory. Increase monitoring frequency. Investigate contamination source.',
            'medium': 'Monitor closely. Increase sampling frequency. Check upstream sources.',
            'low': 'Continue monitoring. Review sensor calibration.'
        }
        return actions.get(severity, 'Monitor and investigate')

    def detect_pattern(self, turbidity_history, temperature_history):
        """
        Detect contamination patterns over time
        """
        if len(turbidity_history) < 5:
            return {'contamination_detected': False, 'message': 'Insufficient data'}

        turbidity_array = np.array(turbidity_history)
        temperature_array = np.array(temperature_history)

        # Detect sudden spikes
        turbidity_mean = np.mean(turbidity_array[:-1])  # Mean of previous values
        turbidity_std = np.std(turbidity_array[:-1])
        current_turbidity = turbidity_array[-1]

        spike_detected = current_turbidity > turbidity_mean + 3 * turbidity_std

        # Detect gradual increase (trend)
        if len(turbidity_history) >= 10:
            recent_trend = np.polyfit(range(len(turbidity_array[-10:])), turbidity_array[-10:], 1)[0]
            increasing_trend = recent_trend > 0.1  # Increasing by >0.1 NTU per reading
        else:
            increasing_trend = False

        contamination_detected = spike_detected or (increasing_trend and current_turbidity > self.turbidity_safe)

        return {
            'contamination_detected': contamination_detected,
            'spike_detected': spike_detected,
            'increasing_trend': increasing_trend,
            'current_turbidity': float(current_turbidity),
            'baseline_turbidity': float(turbidity_mean),
            'confidence': 0.7 if spike_detected else 0.5
        }







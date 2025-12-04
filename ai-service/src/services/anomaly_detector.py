import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import joblib
import os

class AnomalyDetector:
    def __init__(self):
        self.model_path = os.path.join(os.path.dirname(__file__), '../../models/anomaly_detector.pkl')
        self.scaler_path = os.path.join(os.path.dirname(__file__), '../../models/scaler.pkl')
        
        # Initialize or load model
        if os.path.exists(self.model_path):
            self.model = joblib.load(self.model_path)
            self.scaler = joblib.load(self.scaler_path)
        else:
            self.model = IsolationForest(contamination=0.1, random_state=42)
            self.scaler = StandardScaler()
            # Train with initial dummy data (will be retrained with real data)
            dummy_data = np.array([[10, 5, 2, 25], [12, 6, 3, 26], [11, 5.5, 2.5, 25.5]])
            self.scaler.fit(dummy_data)
            self.model.fit(self.scaler.transform(dummy_data))
            self._save_model()
        
        # Normal ranges (will be learned from data)
        self.normal_ranges = {
            'flow_rate': (5, 50),  # L/min
            'pressure': (2, 8),    # bar
            'turbidity': (0, 5),   # NTU
            'temperature': (15, 35) # Celsius
        }

    def _save_model(self):
        """Save trained model"""
        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
        joblib.dump(self.model, self.model_path)
        joblib.dump(self.scaler, self.scaler_path)

    def detect(self, flow_rate, pressure, turbidity, temperature, device_id=None):
        """
        Detect anomalies in sensor readings
        Returns: dict with anomaly_detected, anomaly_type, severity, confidence
        """
        # Prepare feature vector
        features = np.array([[flow_rate, pressure, turbidity, temperature]])
        features_scaled = self.scaler.transform(features)
        
        # Predict anomaly
        prediction = self.model.predict(features_scaled)
        anomaly_score = self.model.score_samples(features_scaled)[0]
        
        # Determine anomaly type and severity
        anomaly_detected = prediction[0] == -1
        anomaly_type = None
        severity = 'low'
        confidence = abs(anomaly_score) * 100  # Convert to percentage
        
        if anomaly_detected:
            # Check which parameter is out of range
            if pressure < self.normal_ranges['pressure'][0] or pressure > self.normal_ranges['pressure'][1]:
                anomaly_type = 'pressure_anomaly'
                if pressure < 1:
                    severity = 'critical'
                elif pressure < 1.5:
                    severity = 'high'
                else:
                    severity = 'medium'
            
            elif flow_rate < self.normal_ranges['flow_rate'][0] * 0.5:
                anomaly_type = 'low_flow'
                severity = 'high' if flow_rate < 1 else 'medium'
            
            elif turbidity > self.normal_ranges['turbidity'][1]:
                anomaly_type = 'contamination'
                if turbidity > 10:
                    severity = 'critical'
                elif turbidity > 7:
                    severity = 'high'
                else:
                    severity = 'medium'
            
            elif abs(flow_rate - pressure * 5) > 20:  # Expected correlation
                anomaly_type = 'leak'
                severity = 'high'
            
            else:
                anomaly_type = 'general_anomaly'
                severity = 'medium'
            
            description = self._generate_description(anomaly_type, flow_rate, pressure, turbidity, temperature)
            recommended_action = self._get_recommended_action(anomaly_type, severity)
        else:
            description = 'All parameters within normal range'
            recommended_action = 'Continue monitoring'
        
        return {
            'anomaly_detected': anomaly_detected,
            'anomaly_type': anomaly_type,
            'severity': severity,
            'confidence': min(confidence, 100),
            'description': description,
            'recommended_action': recommended_action
        }

    def _generate_description(self, anomaly_type, flow_rate, pressure, turbidity, temperature):
        """Generate human-readable description"""
        descriptions = {
            'pressure_anomaly': f'Pressure anomaly detected: {pressure:.2f} bar (expected: 2-8 bar)',
            'low_flow': f'Low flow rate detected: {flow_rate:.2f} L/min (expected: 5-50 L/min)',
            'contamination': f'Water quality issue: Turbidity {turbidity:.2f} NTU (expected: <5 NTU)',
            'leak': f'Possible leak detected: Flow-Pressure mismatch (Flow: {flow_rate:.2f} L/min, Pressure: {pressure:.2f} bar)',
            'general_anomaly': 'Anomaly detected in sensor readings'
        }
        return descriptions.get(anomaly_type, 'Anomaly detected')

    def _get_recommended_action(self, anomaly_type, severity):
        """Get recommended action based on anomaly"""
        actions = {
            'pressure_anomaly': 'Check pump operation and pipeline integrity',
            'low_flow': 'Inspect for blockages or valve issues',
            'contamination': 'Immediate water quality test required. Notify health authorities.',
            'leak': 'Dispatch field team to investigate leak. Use GPS coordinates for location.',
            'general_anomaly': 'Review sensor readings and perform diagnostic check'
        }
        return actions.get(anomaly_type, 'Investigate anomaly')

    def update_model(self, training_data):
        """Retrain model with new data"""
        try:
            X = np.array(training_data)
            X_scaled = self.scaler.fit_transform(X)
            self.model.fit(X_scaled)
            self._save_model()
            return True
        except Exception as e:
            print(f"Error updating model: {e}")
            return False







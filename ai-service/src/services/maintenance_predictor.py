import numpy as np
from sklearn.ensemble import RandomForestRegressor
import joblib
import os

class MaintenancePredictor:
    def __init__(self):
        self.model_path = os.path.join(os.path.dirname(__file__), '../../models/maintenance_predictor.pkl')
        
        # Initialize or load model
        if os.path.exists(self.model_path):
            self.model = joblib.load(self.model_path)
        else:
            # Initialize with dummy model (will be trained with real data)
            self.model = RandomForestRegressor(n_estimators=100, random_state=42)
            # Train with dummy data
            dummy_X = np.random.rand(100, 5)  # 5 features
            dummy_y = np.random.rand(100) * 30  # Days until maintenance
            self.model.fit(dummy_X, dummy_y)
            self._save_model()

    def _save_model(self):
        """Save trained model"""
        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
        joblib.dump(self.model, self.model_path)

    def predict(self, device_id, historical_data):
        """
        Predict maintenance needs based on historical data
        historical_data: List of {timestamp, flow_rate, pressure, turbidity, temperature, pump_status}
        """
        if len(historical_data) < 30:
            return {
                'maintenance_needed': False,
                'days_until_maintenance': None,
                'confidence': 0,
                'message': 'Insufficient historical data (need at least 30 readings)'
            }

        # Extract features
        features = self._extract_features(historical_data)
        
        # Predict days until maintenance
        prediction = self.model.predict([features])[0]
        
        # Determine if maintenance is needed soon
        maintenance_needed = prediction < 7  # Less than 7 days
        urgency = 'low'
        
        if prediction < 1:
            urgency = 'critical'
        elif prediction < 3:
            urgency = 'high'
        elif prediction < 7:
            urgency = 'medium'

        # Calculate confidence based on data quality
        confidence = min(len(historical_data) / 100, 1.0)  # More data = higher confidence

        return {
            'maintenance_needed': maintenance_needed,
            'days_until_maintenance': float(prediction),
            'urgency': urgency,
            'confidence': confidence,
            'recommended_actions': self._get_recommended_actions(urgency, features)
        }

    def _extract_features(self, historical_data):
        """
        Extract features from historical data for prediction
        """
        flow_rates = [d.get('flow_rate', 0) for d in historical_data]
        pressures = [d.get('pressure', 0) for d in historical_data]
        turbidities = [d.get('turbidity', 0) for d in historical_data]
        temperatures = [d.get('temperature', 0) for d in historical_data]
        pump_statuses = [1 if d.get('pump_status') == 'on' else 0 for d in historical_data]

        # Feature engineering
        features = [
            np.mean(flow_rates),      # Average flow
            np.std(flow_rates),       # Flow variability
            np.mean(pressures),       # Average pressure
            np.std(pressures),        # Pressure variability
            np.mean(turbidities),     # Average turbidity
            np.sum(pump_statuses) / len(pump_statuses)  # Pump runtime ratio
        ]

        return features

    def _get_recommended_actions(self, urgency, features):
        """Get recommended maintenance actions"""
        actions = {
            'critical': [
                'Schedule immediate maintenance',
                'Check pump motor and bearings',
                'Inspect pipeline for leaks',
                'Review sensor calibrations'
            ],
            'high': [
                'Schedule maintenance within 3 days',
                'Monitor pump performance closely',
                'Check for unusual vibrations or sounds',
                'Review recent sensor readings'
            ],
            'medium': [
                'Schedule maintenance within 1 week',
                'Continue regular monitoring',
                'Prepare maintenance checklist'
            ],
            'low': [
                'Continue regular monitoring',
                'Schedule routine maintenance as per schedule'
            ]
        }
        return actions.get(urgency, [])







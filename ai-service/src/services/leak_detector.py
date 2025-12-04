import numpy as np
from scipy import signal
from sklearn.cluster import DBSCAN

class LeakDetector:
    def __init__(self):
        # Leak detection parameters
        self.pressure_threshold = 0.5  # bar drop indicates leak
        self.flow_threshold = 0.3  # Flow increase without pressure increase
        self.min_confidence = 0.6

    def detect(self, device_id, pressure, flow_rate, gps_lat=None, gps_lon=None):
        """
        Detect leak from current pressure and flow readings
        """
        leak_detected = False
        confidence = 0
        gps_estimate = None

        # Simple leak detection logic
        # Leak typically shows: pressure drop + flow increase (or flow maintained with pressure drop)
        if pressure < 2.0 and flow_rate > 0:
            # Possible leak: pressure dropped but flow continues
            leak_detected = True
            confidence = 0.7
        elif pressure < 1.5:
            # Critical leak: very low pressure
            leak_detected = True
            confidence = 0.9
        elif flow_rate > 50 and pressure < 3:
            # High flow with low pressure = leak
            leak_detected = True
            confidence = 0.8

        if leak_detected and gps_lat and gps_lon:
            gps_estimate = {
                'lat': gps_lat,
                'lon': gps_lon,
                'confidence': confidence,
                'method': 'sensor_location'
            }

        return {
            'leak_detected': leak_detected,
            'confidence': confidence,
            'gps_estimate': gps_estimate,
            'pressure': pressure,
            'flow_rate': flow_rate
        }

    def detect_with_history(self, device_id, pressure_data, flow_data):
        """
        Advanced leak detection using historical data
        Uses pressure gradient analysis and flow pattern matching
        """
        if len(pressure_data) < 10 or len(flow_data) < 10:
            return {
                'leak_detected': False,
                'confidence': 0,
                'message': 'Insufficient data for leak detection'
            }

        pressure_array = np.array(pressure_data)
        flow_array = np.array(flow_data)

        # Method 1: Pressure gradient analysis
        pressure_gradient = np.gradient(pressure_array)
        pressure_drop = np.min(pressure_gradient)
        
        # Method 2: Flow-pressure correlation
        # During leak: flow increases or stays constant while pressure drops
        correlation = np.corrcoef(pressure_array, flow_array)[0, 1]
        
        # Method 3: Statistical anomaly in pressure
        pressure_mean = np.mean(pressure_array)
        pressure_std = np.std(pressure_array)
        recent_pressure = pressure_array[-5:].mean()
        
        leak_detected = False
        confidence = 0
        leak_location_estimate = None

        # Decision logic
        if pressure_drop < -0.3:  # Significant pressure drop
            leak_detected = True
            confidence += 0.4
        
        if correlation < -0.5:  # Negative correlation (pressure down, flow up/stable)
            leak_detected = True
            confidence += 0.3
        
        if recent_pressure < pressure_mean - 2 * pressure_std:  # Statistical outlier
            leak_detected = True
            confidence += 0.3

        # Estimate leak location using pressure gradient
        if leak_detected:
            # Find point of maximum pressure drop
            max_drop_idx = np.argmin(pressure_gradient)
            leak_location_estimate = {
                'index': int(max_drop_idx),
                'pressure_drop': float(pressure_drop),
                'method': 'pressure_gradient_analysis'
            }

        return {
            'leak_detected': leak_detected,
            'confidence': min(confidence, 1.0),
            'leak_location_estimate': leak_location_estimate,
            'pressure_drop': float(pressure_drop),
            'correlation': float(correlation),
            'pressure_stats': {
                'mean': float(pressure_mean),
                'std': float(pressure_std),
                'recent': float(recent_pressure)
            }
        }

    def localize_leak(self, sensor_readings, pipeline_network):
        """
        Localize leak using multiple sensor readings and pipeline topology
        sensor_readings: List of {device_id, pressure, flow_rate, gps_lat, gps_lon}
        pipeline_network: Graph structure of pipeline network
        """
        # Simple implementation: find sensor with maximum pressure drop
        if not sensor_readings:
            return None

        pressures = [s['pressure'] for s in sensor_readings]
        min_pressure_idx = np.argmin(pressures)
        leak_sensor = sensor_readings[min_pressure_idx]

        # Estimate leak location between this sensor and upstream sensor
        # (Simplified - real implementation would use pipeline topology)
        return {
            'estimated_location': {
                'lat': leak_sensor.get('gps_lat'),
                'lon': leak_sensor.get('gps_lon')
            },
            'confidence': 0.7,
            'method': 'pressure_minimum'
        }







export const LocationGate = ({
  locationStatus,
  locationError,
  requestLocation,
  villageLoading,
  villageError,
  retryVillageLookup,
}) => {
  return (
    <div className="card location-gate">
      <div className="card-header">
        <h3>Allow Location Access</h3>
        <p className="card-description">
          We need your location to personalise the JalRakshak dashboard for your area.
        </p>
      </div>
      <div className="card-body">
        {locationStatus === 'pending' ? (
          <p>Detecting your current location...</p>
        ) : locationStatus === 'denied' ? (
          <>
            <p className="text-danger mb-3">
              {locationError || 'Location permission was denied. Please allow access and try again.'}
            </p>
            <button className="btn btn-primary" onClick={requestLocation}>
              Retry Location Access
            </button>
          </>
        ) : (
          <>
            <p className="mb-3">
              {villageLoading
                ? 'Finding services available near you...'
                : villageError || 'Preparing location-specific dashboard data...'}
            </p>
            {villageError && (
              <button className="btn btn-primary" onClick={retryVillageLookup}>
                Retry Village Detection
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}


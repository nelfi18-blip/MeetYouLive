package com.meetyoulive.app;

import android.location.Address;
import android.location.Geocoder;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;
import java.util.Locale;

// Reverse geocodes ONLY on an explicit tap, returns city/country/region, never street
// or precise coordinates. No GPS collection, background monitoring, or persistence.
@CapacitorPlugin(name = "MeetYouLiveGeocoder")
public class MeetYouLiveGeocoderPlugin extends Plugin {
    @PluginMethod
    public void reverseGeocode(PluginCall call) {
        final Double latitude = call.getDouble("latitude");
        final Double longitude = call.getDouble("longitude");
        if (latitude == null || longitude == null || !Double.isFinite(latitude)
                || !Double.isFinite(longitude) || latitude < -90 || latitude > 90
                || longitude < -180 || longitude > 180) {
            call.reject("Invalid GPS coordinates", "INVALID_COORDINATES");
            return;
        }
        if (!Geocoder.isPresent()) {
            JSObject result = new JSObject();
            result.put("found", false);
            call.resolve(result);
            return;
        }
        new Thread(() -> {
            try {
                Geocoder geocoder = new Geocoder(getContext(), Locale.getDefault());
                // The pre-33 synchronous API runs on a background worker, NOT UI.
                @SuppressWarnings("deprecation")
                List<Address> addresses = geocoder.getFromLocation(latitude, longitude, 1);
                Address address = addresses == null || addresses.isEmpty() ? null : addresses.get(0);
                JSObject result = new JSObject();
                result.put("found", address != null);
                if (address != null) {
                    result.put("countryCode", address.getCountryCode());
                    result.put("country", address.getCountryName());
                    result.put("city", address.getLocality() != null ? address.getLocality() : address.getSubAdminArea());
                    result.put("region", address.getAdminArea());
                }
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Location name unavailable", "GEOCODER_UNAVAILABLE");
            }
        }, "MeetYouLiveGeocoder").start();
    }
}

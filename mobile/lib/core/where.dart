import 'package:geolocator/geolocator.dart';

/// Where this phone is — read when a rider or Team Leader punches in or out.
///
/// Behind a seam on purpose: a widget test has no device to ask, and a screen
/// that called the plugin directly could not be driven in one. The real
/// implementation asks for permission the way Android expects — check, then
/// request, and take no for an answer.
abstract class Where {
  /// The current position, or null with a reason the screen can show.
  Future<({double lat, double lng})?> position();

  /// Why it could not be taken, in words a person can act on.
  String? get problem;

  static Where live = _Device();
}

class _Device implements Where {
  @override
  String? problem;

  @override
  Future<({double lat, double lng})?> position() async {
    problem = null;
    if (!await Geolocator.isLocationServiceEnabled()) {
      problem = 'Location is switched off on this phone. Turn it on and try again.';
      return null;
    }
    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied) {
      problem = 'Location permission was refused. Allow it to punch in or out.';
      return null;
    }
    if (permission == LocationPermission.deniedForever) {
      problem = 'Location is blocked for this app. Turn it on in Android settings → Apps → Nandini Rider → Permissions.';
      return null;
    }
    try {
      final at = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      return (lat: at.latitude, lng: at.longitude);
    } catch (e) {
      problem = 'The position could not be read just now.';
      return null;
    }
  }
}

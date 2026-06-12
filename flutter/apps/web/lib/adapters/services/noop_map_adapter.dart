import 'package:im_core/core.dart';

/// Web adapter for maps. Currently Noop.
/// Replace with Google Maps SDK when ready.
class NoopMapAdapter implements MapPort {
  @override
  Future<GeoResult> geocode(String address) async {
    return const GeoResult(
      address: '',
      latitude: 0,
      longitude: 0,
    );
  }

  @override
  Future<List<GeoResult>> searchPlaces(String query, GeoBounds? bounds) async =>
      [];
}

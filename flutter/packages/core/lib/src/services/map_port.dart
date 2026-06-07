import 'models.dart';

/// Abstract port for map/geocoding services.
///
/// Note: packages/core is pure Dart (no Flutter dependency).
/// Map widget rendering lives in platform adapters.
abstract class MapPort {
  /// Geocode an address to coordinates.
  Future<GeoResult> geocode(String address);

  /// Search for places matching a query within optional bounds.
  Future<List<GeoResult>> searchPlaces(String query, GeoBounds? bounds);
}

/// Noop implementation that returns empty results.
class NoopMapPort implements MapPort {
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

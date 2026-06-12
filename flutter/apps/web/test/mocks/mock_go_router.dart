import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';
import 'package:mockito/mockito.dart';

/// Hand-written mock for GoRouter.
///
/// Avoids build_runner / @GenerateMocks due to analyzer version mismatch.
/// Only `routeInformationProvider` is explicitly overridden because it is a
/// getter that must return a specific mock.  All other members are handled by
/// Mock's noSuchMethod.
class MockGoRouter extends Mock implements GoRouter {
  @override
  GoRouteInformationProvider get routeInformationProvider => super.noSuchMethod(
        Invocation.getter(#routeInformationProvider),
        returnValue: MockGoRouteInformationProvider(),
      ) as GoRouteInformationProvider;
}

/// Hand-written mock for GoRouteInformationProvider.
class MockGoRouteInformationProvider extends Mock
    implements GoRouteInformationProvider {
  @override
  RouteInformation get value => super.noSuchMethod(
        Invocation.getter(#value),
        returnValue: RouteInformation(uri: Uri.parse('/')),
      ) as RouteInformation;

  @override
  void addListener(VoidCallback listener) => super.noSuchMethod(
        Invocation.method(#addListener, [listener]),
      );

  @override
  void removeListener(VoidCallback listener) => super.noSuchMethod(
        Invocation.method(#removeListener, [listener]),
      );
}

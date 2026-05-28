import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mockito/mockito.dart';
import 'package:im_web/app.dart';
import 'package:im_web/core/web_meta/page_meta.dart';
import 'package:im_web/core/web_meta/web_meta_service.dart';
import 'package:im_web/core/router/route_observer.dart';
import 'package:im_web/core/di/providers.dart';

import 'mocks/mock_web_meta_service.dart';
import 'mocks/mock_go_router.dart';

void main() {
  group('App lifecycle', () {
    late MockWebMetaService mockMetaService;
    late MockGoRouter mockRouter;
    late MockGoRouteInformationProvider mockRouteInfoProvider;

    setUp(() {
      mockMetaService = MockWebMetaService();
      mockRouter = MockGoRouter();
      mockRouteInfoProvider = MockGoRouteInformationProvider();

      // Setup mock router
      when(mockRouter.routeInformationProvider)
          .thenReturn(mockRouteInfoProvider);
      when(mockRouteInfoProvider.value).thenReturn(
        RouteInformation(uri: Uri.parse('/')),
      );
    });

    testWidgets('route change triggers WebMetaService.apply with correct meta',
        (tester) async {
      fail('TODO: implement after refactoring app.dart');
    });

    testWidgets('locale change triggers meta re-apply for current path',
        (tester) async {
      fail('TODO: implement after refactoring app.dart');
    });

    testWidgets('MaterialApp.router builder does not wrap Navigator',
        (tester) async {
      fail('TODO: implement after refactoring app.dart');
    });

    testWidgets('routeObserver is only registered via GoRouter observers',
        (tester) async {
      fail('TODO: implement after refactoring app.dart');
    });
  });
}

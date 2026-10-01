import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import 'package:shelfsignal/features/scanner/scanner_screen.dart';

void main() {
  Future<void> pumpScanner(WidgetTester tester) async {
    // Tall surface so the resolve result below the fold is built and findable
    // (ListView children outside the viewport are not instantiated).
    tester.view.physicalSize = const Size(1080, 2000);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      const ProviderScope(child: MaterialApp(home: ScannerScreen())),
    );
    await tester.pump();
  }

  group('ScannerScreen (spec 9.2/9.3)', () {
    testWidgets('camera stays off until the user opts in', (tester) async {
      await pumpScanner(tester);

      // Rationale is shown first; the OS permission prompt and the camera
      // plugin only engage after the explicit "Start camera" tap.
      expect(find.text('Scan with the camera'), findsOneWidget);
      expect(find.byType(MobileScanner), findsNothing);
      expect(find.text('Start camera'), findsOneWidget);
    });

    testWidgets('manual entry resolves a fixture barcode', (tester) async {
      await pumpScanner(tester);

      await tester.enterText(find.byType(TextField), '9310640020223');
      await tester.tap(find.byIcon(Icons.search));
      await tester.pumpAndSettle();

      expect(find.text('ExampleBrand Tomato Pasta Sauce'), findsOneWidget);
      expect(find.text('Watch this'), findsOneWidget);
    });

    testWidgets('manual entry rejects a barcode that fails the GTIN check',
        (tester) async {
      await pumpScanner(tester);

      await tester.enterText(find.byType(TextField), '1234567890123');
      await tester.tap(find.byIcon(Icons.search));
      await tester.pumpAndSettle();

      expect(find.textContaining('does not look valid'), findsOneWidget);
      expect(find.text('Watch this'), findsNothing);
    });
  });
}

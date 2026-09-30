import 'package:flutter/material.dart';

/// ShelfSignal design tokens (Master Prompt section 10 — Premium Calm).
///
/// - Deep charcoal dark mode, warm off-white light mode.
/// - Signal green/teal reserved for verified positive signals.
/// - Amber for conditional or near-target states.
/// - Red only for genuine errors.
abstract final class SsColors {
  // Brand / signal palette
  static const Color signalGreen = Color(0xFF2FBF9B);
  static const Color signalAmber = Color(0xFFE8A33D);
  static const Color errorRed = Color(0xFFD65A4A);
  static const Color infoBlue = Color(0xFF5A8FD6);

  // Dark (deep charcoal) surfaces
  static const Color charcoal900 = Color(0xFF121417);
  static const Color charcoal800 = Color(0xFF1A1D21);
  static const Color charcoal700 = Color(0xFF24282D);
  static const Color charcoalBorder = Color(0xFF31363C);

  // Light (warm off-white) surfaces
  static const Color warm50 = Color(0xFFFAF8F5);
  static const Color warm100 = Color(0xFFF2EEE8);
  static const Color warmBorder = Color(0xFFDDD6CC);

  // Text
  static const Color textHighDark = Color(0xFFF4F4F2);
  static const Color textMidDark = Color(0xFFB9BDB9);
  static const Color textHighLight = Color(0xFF1C1E20);
  static const Color textMidLight = Color(0xFF5C6058);

  /// Severity -> colour, kept independent of icon alone (accessibility).
  static Color forLabel(String label) {
    switch (label) {
      case 'Strong signal':
      case 'Good price':
        return signalGreen;
      case 'Near your target':
      case 'Conditional offer':
        return signalAmber;
      case 'Price needs verification':
        return infoBlue;
      default:
        return signalAmber;
    }
  }
}

abstract final class SsSpacing {
  static const double xs = 4;
  static const double s = 8;
  static const double m = 16;
  static const double l = 24;
  static const double xl = 32;
}

/// Builds the app ThemeData for light and dark modes.
ThemeData buildSsTheme(Brightness brightness) {
  final isDark = brightness == Brightness.dark;
  final colorScheme = ColorScheme.fromSeed(
    seedColor: SsColors.signalGreen,
    brightness: brightness,
  ).copyWith(
    primary: SsColors.signalGreen,
    error: SsColors.errorRed,
    surface: isDark ? SsColors.charcoal800 : SsColors.warm50,
    surfaceContainerHighest: isDark ? SsColors.charcoal700 : SsColors.warm100,
    outline: isDark ? SsColors.charcoalBorder : SsColors.warmBorder,
  );

  final base = ThemeData(useMaterial3: true, colorScheme: colorScheme);

  return base.copyWith(
    scaffoldBackgroundColor: isDark ? SsColors.charcoal900 : SsColors.warm50,
    appBarTheme: AppBarTheme(
      backgroundColor: isDark ? SsColors.charcoal900 : SsColors.warm50,
      foregroundColor: isDark ? SsColors.textHighDark : SsColors.textHighLight,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        fontSize: 20,
        fontWeight: FontWeight.w600,
        color: isDark ? SsColors.textHighDark : SsColors.textHighLight,
      ),
    ),
    cardTheme: CardThemeData(
      color: isDark ? SsColors.charcoal800 : Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: isDark ? SsColors.charcoalBorder : SsColors.warmBorder,
        ),
      ),
      margin: const EdgeInsets.symmetric(horizontal: SsSpacing.m, vertical: SsSpacing.s),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: isDark ? SsColors.charcoal800 : Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(
          color: isDark ? SsColors.charcoalBorder : SsColors.warmBorder,
        ),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(
          color: isDark ? SsColors.charcoalBorder : SsColors.warmBorder,
        ),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    ),
    textTheme: base.textTheme.apply(
      bodyColor: isDark ? SsColors.textHighDark : SsColors.textHighLight,
      displayColor: isDark ? SsColors.textHighDark : SsColors.textHighLight,
    ),
  );
}

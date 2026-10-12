import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// The web ERP's tokens, carried over rather than reinvented.
///
/// Same navy and cyan, same status colours, same two typefaces — Sora for
/// headings, Public Sans for everything else. What changes is the chrome: a
/// drawer instead of a 236px rail, bottom sheets instead of modals, a bottom
/// action bar instead of a header button row.
class T {
  static const bg = Color(0xFFF4F6FB);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceAlt = Color(0xFFF7FBFE);
  static const navy = Color(0xFF191A5C);
  static const ink = Color(0xFF22264A);
  static const muted = Color(0xFF7A80A3);
  static const faint = Color(0xFF8A90B3);
  static const border = Color(0xFFE3E7F2);
  static const borderStrong = Color(0xFFD8DCEB);

  static const brand = Color(0xFF0089C9);
  static const brandInk = Color(0xFF0672A6);
  static const brandBg = Color(0xFFE3F2FC);

  static const good = Color(0xFF177049);
  static const goodBg = Color(0xFFE4F6EC);
  static const warn = Color(0xFF8A5A12);
  static const warnBg = Color(0xFFFDF3E7);
  static const warnLine = Color(0xFFE0B26A);
  static const bad = Color(0xFFB23334);
  static const badBg = Color(0xFFFCEDED);
  static const badLine = Color(0xFFF2CBCB);
  static const plum = Color(0xFF5636A8);
  static const plumBg = Color(0xFFEFE9FC);
  static const plumLine = Color(0xFFC9A7F0);

  static TextStyle heading(double size, {Color? color, FontWeight? weight}) =>
      GoogleFonts.sora(
        fontSize: size,
        fontWeight: weight ?? FontWeight.w700,
        color: color ?? navy,
        height: 1.25,
      );

  static TextStyle body(double size, {Color? color, FontWeight? weight}) =>
      GoogleFonts.publicSans(
        fontSize: size,
        fontWeight: weight ?? FontWeight.w500,
        color: color ?? ink,
      );

  /// Small caps section label, as every web list and panel uses.
  static TextStyle get eyebrow => GoogleFonts.publicSans(
        fontSize: 10.5,
        fontWeight: FontWeight.w800,
        letterSpacing: 0.9,
        color: muted,
      );

  /// Tabular figures, so a column of money does not wobble. The `num` class.
  static TextStyle numeric(double size, {Color? color, FontWeight? weight}) =>
      GoogleFonts.publicSans(
        fontSize: size,
        fontWeight: weight ?? FontWeight.w600,
        color: color ?? ink,
        fontFeatures: const [FontFeature.tabularFigures()],
      );

  static ThemeData get theme => ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: bg,
        colorScheme: ColorScheme.fromSeed(
          seedColor: navy,
          primary: brand,
          surface: surface,
        ),
        textTheme: GoogleFonts.publicSansTextTheme(),
        appBarTheme: const AppBarTheme(
          backgroundColor: navy,
          foregroundColor: Colors.white,
          elevation: 0,
        ),
        dividerColor: border,
      );
}

/// Indian numbering, as `money()` does on the web: lakh and crore, never
/// thousands-separated millions.
String money(num value) {
  final negative = value < 0;
  final v = value.abs();
  String out;
  if (v >= 10000000) {
    out = '₹${(v / 10000000).toStringAsFixed(2)} Cr';
  } else if (v >= 100000) {
    out = '₹${(v / 100000).toStringAsFixed(2)} L';
  } else {
    final whole = v.round().toString();
    final buf = StringBuffer();
    // 12,34,567 — the last three digits, then pairs.
    for (var i = 0; i < whole.length; i++) {
      final fromEnd = whole.length - i;
      buf.write(whole[i]);
      if (fromEnd > 3 && (fromEnd - 3) % 2 == 1 && i != whole.length - 1) buf.write(',');
      if (fromEnd == 4 && i != whole.length - 1) buf.write(',');
    }
    out = '₹${buf.toString().replaceAll(',,', ',')}';
  }
  return negative ? '-$out' : out;
}

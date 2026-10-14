import 'package:flutter/material.dart';

/// The ERP's tokens, taken from the design canvas, unchanged.
///
/// A number that is navy on the desktop is navy on the phone. Only the chrome
/// is rebuilt for Android. Every value here is quoted from `Main.dc.html` —
/// nothing is approximated, because the last attempt approximated and the
/// result did not look like the design.
class T {
  /// Sora for display, numbers and titles; Public Sans for everything else.
  /// Both bundled — see pubspec.yaml for why.
  static const _sora = 'Sora';
  static const _sans = 'PublicSans';

  // ---------------------------------------------------------------- colour
  static const navy950 = Color(0xFF191A5C);
  static const navy800 = Color(0xFF2F308C);
  /// The bottom bar inside the navy drawer, a shade below the drawer itself.
  static const navyBar = Color(0xFF15164F);

  static const brand500 = Color(0xFF0089C9);
  static const brand700 = Color(0xFF0672A6);
  static const brand300 = Color(0xFF5BC8F2);
  static const brand100 = Color(0xFFE3F2FC);

  static const page = Color(0xFFF4F6FB);
  static const card = Color(0xFFFFFFFF);
  static const line = Color(0xFFE3E7F2);
  /// A heavier line, for a field that must read as an input.
  static const line400 = Color(0xFFD4DAEA);
  /// The fill of a resting input.
  static const fieldFill = Color(0xFFF1F4FB);
  /// A neutral chip or an unreached step in a chain.
  static const neutralTint = Color(0xFFEEF1F9);

  /// Ink. `body` is the reading colour; `secondary` is the second line.
  static const ink = Color(0xFF22264A);
  static const secondary = Color(0xFF5A6080);
  static const muted = Color(0xFF7A80A3);
  static const faint = Color(0xFF8A90B3);
  static const disabledInk = Color(0xFF9BA1C2);
  static const disabledFill = Color(0xFFE9EDF6);
  static const chevron = Color(0xFFC0C5DC);
  /// On navy: a secondary line, and a menu label.
  static const onNavySecondary = Color(0xFF9BA1C2);
  static const onNavyBody = Color(0xFFD7DAEA);

  // Status. Each has a solid, a tint and an ink — and the tints differ in
  // lightness as well as hue, so status survives greyscale and colour blindness.
  static const good = Color(0xFF1F9D66);
  static const goodTint = Color(0xFFE4F6EC);
  static const goodLine = Color(0xFFC4E8D4);
  static const goodInk = Color(0xFF177049);

  static const warn = Color(0xFFE8A13A);
  static const warnTint = Color(0xFFFDF3E7);
  static const warnLine = Color(0xFFF3DDBB);
  static const warnLineStrong = Color(0xFFE0B26A);
  static const warnInk = Color(0xFF8A5A12);

  static const bad = Color(0xFFD8494A);
  static const badTint = Color(0xFFFCEDED);
  static const badLine = Color(0xFFF2CBCB);
  static const badInk = Color(0xFFB23334);
  /// The fill of a field in error.
  static const badField = Color(0xFFFEF7F7);

  static const plum = Color(0xFF6A46C8);
  static const plumTint = Color(0xFFEFE9FC);
  static const plumLine = Color(0xFFDDD3F6);
  static const plumInk = Color(0xFF5636A8);

  /// A draft — no status at all, rather than a bad one.
  static const draftTint = Color(0xFFEEF1F9);
  static const draftInk = Color(0xFF4A5077);

  // ------------------------------------------------------------------ space
  /// Screen gutter.
  static const gutter = 16.0;
  /// Padding inside a card.
  static const cardPad = 16.0;
  /// Between cards.
  static const cardGap = 12.0;
  /// Between sections.
  static const sectionGap = 24.0;

  // ------------------------------------------------------------------ shape
  static const rButton = 8.0;
  static const rControl = 9.0;
  static const rCard = 13.0;
  static const rBand = 12.0;
  static const rPill = 999.0;
  static const rSheet = 20.0;

  /// The minimum target, always — even where the glyph inside is 20dp.
  static const target = 48.0;

  // -------------------------------------------------------------- elevation
  /// An app bar once the content is scrolled under it.
  static const raised = <BoxShadow>[
    BoxShadow(color: Color(0x1A191A5C), blurRadius: 8, offset: Offset(0, 2)),
  ];
  /// A sheet or a dialog.
  static const sheet = <BoxShadow>[
    BoxShadow(color: Color(0x29191A5C), blurRadius: 28, offset: Offset(0, -8)),
  ];
  /// The action bar pinned to the bottom of a detail screen.
  static const actionBar = <BoxShadow>[
    BoxShadow(color: Color(0x0F191A5C), blurRadius: 16, offset: Offset(0, -4)),
  ];

  // ------------------------------------------------------------------- type
  // Sora for display, numbers and titles; Public Sans for everything else.
  // Body never below 14, captions never below 12.

  /// Sora 800 · 26/32.
  static TextStyle display({Color? color}) => TextStyle(
      fontFamily: _sora, fontSize: 26, height: 32 / 26,
      fontWeight: FontWeight.w800, color: color ?? navy950);

  /// Sora 700 · 19/26. The screen title.
  static TextStyle screenTitle({Color? color}) => TextStyle(
      fontFamily: _sora, fontSize: 19, height: 26 / 19,
      fontWeight: FontWeight.w700, color: color ?? navy950);

  /// Sora 700 · 18 — a title inside an app bar, which has its own line height.
  static TextStyle barTitle({Color? color}) => TextStyle(
      fontFamily: _sora, fontSize: 18, fontWeight: FontWeight.w700,
      color: color ?? Colors.white);

  /// Sora 700 · 15/22.
  static TextStyle section({Color? color}) => TextStyle(
      fontFamily: _sora, fontSize: 15, height: 22 / 15,
      fontWeight: FontWeight.w700, color: color ?? navy950);

  /// Sora 800, tabular — a metric. The band uses 20–21, a hero 28.
  static TextStyle metric(double size, {Color? color}) => TextStyle(
        fontFamily: _sora,
        fontSize: size,
        fontWeight: FontWeight.w800,
        color: color ?? navy950,
        fontFeatures: const [FontFeature.tabularFigures()],
      );

  /// Public Sans 600 · 16/22. A row's first line.
  static TextStyle rowTitle({Color? color}) => TextStyle(
      fontFamily: _sans, fontSize: 16, height: 22 / 16,
      fontWeight: FontWeight.w600, color: color ?? ink);

  /// Public Sans 400 · 14/21. The reading size.
  static TextStyle body({Color? color, FontWeight? weight}) => TextStyle(
      fontFamily: _sans, fontSize: 14, height: 21 / 14,
      fontWeight: weight ?? FontWeight.w400, color: color ?? ink);

  /// Public Sans 500 · 13/19. The second line.
  static TextStyle secondaryText({Color? color}) => TextStyle(
      fontFamily: _sans, fontSize: 13, height: 19 / 13,
      fontWeight: FontWeight.w500, color: color ?? secondary);

  /// Public Sans 600 · 12/16. A caption or a field label.
  static TextStyle caption({Color? color}) => TextStyle(
      fontFamily: _sans, fontSize: 12, height: 16 / 12,
      fontWeight: FontWeight.w600, color: color ?? muted);

  /// Public Sans 800 · 10.5 · .08em uppercase.
  static TextStyle overline({Color? color}) => TextStyle(
      fontFamily: _sans, fontSize: 10.5, fontWeight: FontWeight.w800,
      letterSpacing: 0.84, color: color ?? muted);

  /// Any number — money, quantity, date, count — so columns align down a list.
  static TextStyle num(double size, {Color? color, FontWeight? weight}) => TextStyle(
        fontFamily: _sans,
        fontSize: size,
        fontWeight: weight ?? FontWeight.w600,
        color: color ?? ink,
        fontFeatures: const [FontFeature.tabularFigures()],
      );

  /// A label on a button. 14/700.
  static TextStyle buttonLabel({Color? color}) => TextStyle(
      fontFamily: _sans, fontSize: 14, fontWeight: FontWeight.w700,
      color: color ?? Colors.white);

  static ThemeData get theme => ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: page,
        colorScheme: ColorScheme.fromSeed(seedColor: navy950, primary: brand500, surface: card),
        fontFamily: _sans,
        dividerColor: line,
        splashFactory: InkSparkle.splashFactory,
      );
}

/// Indian numbering, as `money()` does on the web — lakh and crore, never
/// thousands-separated millions. A figure shown one way on the phone and
/// another on the web is two figures to whoever reads them.
String money(num? value, {bool short = false}) {
  if (value == null) return '—';
  final negative = value < 0;
  final v = value.abs();
  String out;
  if (v >= 10000000) {
    out = '₹${(v / 10000000).toStringAsFixed(2)}${short ? "Cr" : " Cr"}';
  } else if (v >= 100000) {
    out = '₹${(v / 100000).toStringAsFixed(2)}${short ? "L" : " L"}';
  } else {
    out = '₹${_grouped(v.round())}';
  }
  return negative ? '-$out' : out;
}

/// 12,34,567 — the last three digits, then pairs.
String _grouped(int n) {
  final s = n.toString();
  if (s.length <= 3) return s;
  final head = s.substring(0, s.length - 3);
  final tail = s.substring(s.length - 3);
  final buf = StringBuffer();
  for (var i = 0; i < head.length; i++) {
    final fromEnd = head.length - i;
    buf.write(head[i]);
    if (fromEnd > 1 && fromEnd.isOdd) buf.write(',');
  }
  return '$buf,$tail';
}

const _months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/// 12 Sep 2026 — the form the ERP prints.
String shortDate(Object? value) {
  final d = _parse(value);
  if (d == null) return '—';
  return '${d.day.toString().padLeft(2, '0')} ${_months[d.month - 1]} ${d.year}';
}

/// "32 d", "today" — how long something has been waiting, in a list.
String daysSince(Object? value, int nowMs) {
  final d = _parse(value);
  if (d == null) return '';
  final days = ((nowMs - d.millisecondsSinceEpoch) / 86400000).floor();
  if (days <= 0) return 'today';
  return '$days d';
}

DateTime? _parse(Object? value) {
  if (value == null) return null;
  if (value is DateTime) return value.toLocal();
  return DateTime.tryParse(value.toString())?.toLocal();
}

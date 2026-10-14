import 'package:flutter/material.dart';

import 'tokens.dart';

/// Every control the modules need, at the sizes the design gives them.
///
/// Nothing here is decorative — each one exists because a screen uses it, and
/// each is built to `Components.dc.html` rather than to a guess at it.

/// The tones a status can carry. Each is a (fill, border, ink) triple.
enum Tone { good, warn, bad, plum, info, draft, neutral }

({Color fill, Color line, Color ink}) toneOf(Tone t) => switch (t) {
      Tone.good => (fill: T.goodTint, line: T.goodLine, ink: T.goodInk),
      Tone.warn => (fill: T.warnTint, line: T.warnLine, ink: T.warnInk),
      Tone.bad => (fill: T.badTint, line: T.badLine, ink: T.badInk),
      Tone.plum => (fill: T.plumTint, line: T.plumLine, ink: T.plumInk),
      Tone.info => (fill: T.brand100, line: T.brand100, ink: T.brand700),
      Tone.draft => (fill: T.draftTint, line: T.draftTint, ink: T.draftInk),
      Tone.neutral => (fill: T.card, line: T.line, ink: T.secondary),
    };

/* ------------------------------------------------------------------ buttons */

/// `primary` is the one call to action a screen gets. `approve` is green and
/// only ever means approve. `reject` is a tinted outline, never a solid red —
/// a refusal is a legitimate answer, not an alarm.
enum Emphasis { primary, approve, reject, outline, text }

class Btn extends StatelessWidget {
  const Btn(
    this.label, {
    super.key,
    this.onPressed,
    this.emphasis = Emphasis.primary,
    this.icon,
    this.busy = false,
    this.height = T.target,
    this.expand = false,
  });

  final String label;

  /// Null means the rule is not met yet — stock short, level not reached — and
  /// the control is drawn greyed. A control the viewer has **no permission
  /// for is not built at all**, which is the caller's business, not this
  /// widget's.
  final VoidCallback? onPressed;

  final Emphasis emphasis;
  final IconData? icon;
  final bool busy;
  final double height;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final off = onPressed == null || busy;

    final (Color bg, Color fg, Color? border) = switch (emphasis) {
      Emphasis.primary => (T.brand500, Colors.white, null),
      Emphasis.approve => (T.good, Colors.white, null),
      Emphasis.reject => (T.badTint, T.badInk, T.badLine),
      Emphasis.outline => (T.card, T.ink, T.line),
      Emphasis.text => (Colors.transparent, T.brand700, null),
    };

    final child = busy
        ? SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(
              strokeWidth: 2.4,
              color: emphasis == Emphasis.reject || emphasis == Emphasis.outline ? fg : Colors.white,
            ),
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[Icon(icon, size: 18, color: off ? T.disabledInk : fg), const SizedBox(width: 7)],
              Text(label, style: T.buttonLabel(color: off ? T.disabledInk : fg)),
            ],
          );

    final button = Semantics(
      button: true,
      enabled: !off,
      label: label,
      child: Material(
        color: off && emphasis != Emphasis.text ? T.disabledFill : bg,
        borderRadius: BorderRadius.circular(T.rButton),
        child: InkWell(
          onTap: off ? null : onPressed,
          borderRadius: BorderRadius.circular(T.rButton),
          child: Container(
            height: height,
            padding: EdgeInsets.symmetric(horizontal: emphasis == Emphasis.text ? 14 : 18),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(T.rButton),
              border: border == null || off ? null : Border.all(color: border),
            ),
            alignment: Alignment.center,
            child: child,
          ),
        ),
      ),
    );

    return expand ? SizedBox(width: double.infinity, child: button) : button;
  }
}

/* -------------------------------------------------------------------- pills */

/// A status, in a word. Radius full, 12/700 — never below 12.
class Pill extends StatelessWidget {
  const Pill(this.label, {super.key, this.tone = Tone.draft, this.compact = false, this.solid});

  final String label;
  final Tone tone;
  final bool compact;

  /// A solid pill, for the one status an app bar carries over navy.
  final ({Color bg, Color ink})? solid;

  @override
  Widget build(BuildContext context) {
    final c = toneOf(tone);
    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 10 : 12, vertical: compact ? 5 : 6),
      decoration: BoxDecoration(
        color: solid?.bg ?? c.fill,
        borderRadius: BorderRadius.circular(T.rPill),
      ),
      child: Text(
        label,
        style: T.num(compact ? 11.5 : 12, color: solid?.ink ?? c.ink, weight: FontWeight.w700),
      ),
    );
  }
}

/// The kind tag on an approvals row — a small square-ish tag, not a pill.
class KindTag extends StatelessWidget {
  const KindTag(this.label, {super.key, this.tone = Tone.draft});

  final String label;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final c = toneOf(tone);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: c.fill, borderRadius: BorderRadius.circular(6)),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.6,
          color: c.ink,
          height: 1.4,
        ),
      ),
    );
  }
}

/* --------------------------------------------------------- approval chain */

/// One step of an approval chain.
///
/// Named `ChainStep` rather than `Step` because Material already has a `Step`
/// for its stepper, and an ambiguous import is a worse problem than a longer
/// name.
class ChainStep {
  const ChainStep(this.initials, this.state);
  final String initials;

  /// done · current · pending — green, amber, grey.
  final ChainState state;
}

enum ChainState { done, current, pending }

/// The chain, as a row of initials joined by rules.
///
/// It answers the question a list cannot: not "what status is this" but "how
/// far has it got and who is holding it".
class Chain extends StatelessWidget {
  const Chain(this.steps, {super.key, this.size = 26});

  final List<ChainStep> steps;
  final double size;

  @override
  Widget build(BuildContext context) {
    final children = <Widget>[];
    for (var i = 0; i < steps.length; i++) {
      final s = steps[i];
      final (Color bg, Color fg) = switch (s.state) {
        ChainState.done => (T.good, Colors.white),
        ChainState.current => (T.warn, Colors.white),
        ChainState.pending => (T.neutralTint, T.faint),
      };
      children.add(Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
        child: Text(s.initials,
            style: TextStyle(fontSize: size <= 22 ? 9.5 : 10.5, fontWeight: FontWeight.w800, color: fg)),
      ));
      if (i < steps.length - 1) {
        // The rule leading out of a finished step is coloured; the rest is grey.
        final reached = s.state == ChainState.done;
        children.add(Expanded(
          child: Container(
            height: 2,
            color: reached ? (steps[i + 1].state == ChainState.pending ? T.warn : T.good) : T.line,
          ),
        ));
      }
    }
    return Row(children: children);
  }
}

/* ---------------------------------------------------------------- surfaces */

/// A card. Radius 13, hairline border, white — no shadow on the page.
class Panel extends StatelessWidget {
  const Panel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(14),
    this.border,
    this.fill,
    this.onTap,
  });

  final Widget child;
  final EdgeInsets padding;
  final Color? border;
  final Color? fill;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final body = Container(
      padding: padding,
      decoration: BoxDecoration(
        color: fill ?? T.card,
        border: Border.all(color: border ?? T.line),
        borderRadius: BorderRadius.circular(T.rCard),
      ),
      child: child,
    );
    if (onTap == null) return body;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(T.rCard),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(T.rCard),
        child: body,
      ),
    );
  }
}

/// A small caps label above a section.
class Overline extends StatelessWidget {
  const Overline(this.text, {super.key, this.color});
  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) =>
      Text(text.toUpperCase(), style: T.overline(color: color));
}

/* ------------------------------------------------------------ metric band */

class Figure {
  const Figure(this.value, this.label, {this.tone});
  final String value;
  final String label;

  /// A tinted card, for the figure that is the reason to look at the screen.
  final Tone? tone;
}

/// Three across, which is what fits at 390dp without the numbers shrinking.
class Band extends StatelessWidget {
  const Band(this.figures, {super.key});
  final List<Figure> figures;

  @override
  Widget build(BuildContext context) {
    if (figures.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(T.gutter, 12, T.gutter, 0),
      child: LayoutBuilder(builder: (context, box) {
        const gap = 8.0;
        final width = (box.maxWidth - gap * 2) / 3;
        return SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              for (final f in figures) ...[
                _card(f, width),
                if (f != figures.last) const SizedBox(width: gap),
              ],
            ],
          ),
        );
      }),
    );
  }

  Widget _card(Figure f, double width) {
    final c = f.tone == null ? null : toneOf(f.tone!);
    return Container(
      width: width,
      padding: const EdgeInsets.fromLTRB(11, 10, 11, 10),
      decoration: BoxDecoration(
        color: c?.fill ?? T.card,
        border: Border.all(color: f.tone == Tone.warn ? T.warnLineStrong : (c?.line ?? T.line)),
        borderRadius: BorderRadius.circular(T.rBand),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(f.value, style: T.metric(20), maxLines: 1, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 1),
          Text(f.label,
              style: T.caption(color: c?.ink ?? T.muted).copyWith(fontSize: 11),
              maxLines: 2,
              overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}

/* ----------------------------------------------------------- filter chips */

/// A filter, carrying its count — so the viewer sees what tapping it will cost.
class FilterChip2 extends StatelessWidget {
  const FilterChip2({
    super.key,
    required this.label,
    this.count,
    this.selected = false,
    this.onTap,
    this.onRemove,
  });

  final String label;
  final int? count;
  final bool selected;
  final VoidCallback? onTap;

  /// An applied filter is removable from the chip itself.
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final applied = onRemove != null;
    final bg = selected ? T.brand500 : (applied ? T.brand100 : T.card);
    final border = selected ? T.brand500 : (applied ? T.brand500 : T.line);
    final ink = selected ? Colors.white : (applied ? T.brand700 : T.secondary);

    return Semantics(
      button: true,
      selected: selected,
      child: Material(
        color: bg,
        borderRadius: BorderRadius.circular(T.rPill),
        child: InkWell(
          onTap: onRemove ?? onTap,
          borderRadius: BorderRadius.circular(T.rPill),
          child: Container(
            // 36 high, inside a 48 row — the row gives the target, see Chips.
            padding: EdgeInsets.fromLTRB(13, 8, applied ? 11 : 13, 8),
            decoration: BoxDecoration(
              border: Border.all(color: border),
              borderRadius: BorderRadius.circular(T.rPill),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Text(label,
                  style: T.num(12.5,
                      color: ink, weight: selected || applied ? FontWeight.w700 : FontWeight.w600)),
              if (count != null) ...[
                const SizedBox(width: 5),
                Text('$count',
                    style: T.num(12.5,
                        color: selected ? Colors.white70 : T.disabledInk, weight: FontWeight.w600)),
              ],
              if (applied) ...[
                const SizedBox(width: 6),
                Icon(Icons.close_rounded, size: 13, color: ink),
              ],
            ]),
          ),
        ),
      ),
    );
  }
}

/// A scrolling row of chips, 48 high so every chip clears the target.
class Chips extends StatelessWidget {
  const Chips(this.children, {super.key, this.top = 12});
  final List<Widget> children;
  final double top;

  @override
  Widget build(BuildContext context) {
    if (children.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: EdgeInsets.fromLTRB(0, top, 0, 0),
      child: SizedBox(
        height: T.target,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: T.gutter),
          itemCount: children.length,
          separatorBuilder: (_, __) => const SizedBox(width: 7),
          itemBuilder: (_, i) => Center(child: children[i]),
        ),
      ),
    );
  }
}

/* ---------------------------------------------------------------- feedback */

/// A snackbar: navy, with its action in brand 300.
void notify(BuildContext context, String message, {String? action, VoidCallback? onAction}) {
  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
    backgroundColor: T.navy950,
    behavior: SnackBarBehavior.floating,
    margin: const EdgeInsets.all(T.gutter),
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    content: Text(message, style: T.body(color: Colors.white, weight: FontWeight.w500).copyWith(fontSize: 13.5)),
    action: action == null
        ? null
        : SnackBarAction(
            label: action,
            textColor: T.brand300,
            onPressed: onAction ?? () {},
          ),
    duration: const Duration(seconds: 4),
  ));
}

/// The server's own sentence, shown verbatim. It was written for this person.
class Alert extends StatelessWidget {
  const Alert(this.message, {super.key, this.tone = Tone.bad, this.detail});

  final String message;
  final Tone tone;
  final String? detail;

  @override
  Widget build(BuildContext context) {
    final c = toneOf(tone);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: c.fill,
        border: Border.all(color: c.line),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(
          tone == Tone.bad ? Icons.error_outline_rounded : Icons.info_outline_rounded,
          size: 18,
          color: c.ink,
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(message, style: T.secondaryText(color: c.ink).copyWith(fontSize: 13)),
            if (detail != null) ...[
              const SizedBox(height: 4),
              Text(detail!, style: T.num(11.5, color: c.ink, weight: FontWeight.w500)),
            ],
          ]),
        ),
      ]),
    );
  }
}

/// Nothing to show, and why — with the way out of it.
class Empty extends StatelessWidget {
  const Empty(this.title, {super.key, this.detail});
  final String title;
  final String? detail;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.symmetric(horizontal: T.gutter, vertical: 8),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          border: Border.all(color: T.line400, style: BorderStyle.solid),
          borderRadius: BorderRadius.circular(T.rBand),
        ),
        child: Column(children: [
          Text(title, textAlign: TextAlign.center, style: T.body(weight: FontWeight.w700)),
          if (detail != null) ...[
            const SizedBox(height: 3),
            Text(detail!,
                textAlign: TextAlign.center,
                style: T.secondaryText(color: T.muted).copyWith(fontSize: 12.5)),
          ],
        ]),
      );
}

/* ------------------------------------------------------------------ fields */

/// A field. 48 high, radius 9, filled when resting, brand-bordered on focus,
/// and red with a reason underneath when it is wrong.
class Field extends StatelessWidget {
  const Field({
    super.key,
    required this.label,
    required this.controller,
    this.hint,
    this.error,
    this.keyboard,
    this.lines = 1,
    this.enabled = true,
    this.obscure = false,
    this.suffix,
    this.onSubmit,
    this.fieldKey,
  });

  final String label;
  final TextEditingController controller;
  final String? hint;
  final String? error;
  final TextInputType? keyboard;
  final int lines;
  final bool enabled;
  final bool obscure;
  final Widget? suffix;
  final VoidCallback? onSubmit;
  final Key? fieldKey;

  @override
  Widget build(BuildContext context) {
    final wrong = error != null;
    OutlineInputBorder border(Color c, [double w = 1]) => OutlineInputBorder(
          borderRadius: BorderRadius.circular(T.rControl),
          borderSide: BorderSide(color: c, width: w),
        );

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: T.caption(color: wrong ? T.badInk : T.secondary)),
      const SizedBox(height: 6),
      TextField(
        key: fieldKey,
        controller: controller,
        enabled: enabled,
        obscureText: obscure,
        keyboardType: keyboard,
        maxLines: lines,
        minLines: lines,
        onSubmitted: onSubmit == null ? null : (_) => onSubmit!(),
        style: T.num(15, weight: FontWeight.w600),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: T.body(color: T.faint),
          filled: true,
          fillColor: wrong ? T.badField : T.fieldFill,
          isDense: true,
          suffixIcon: suffix,
          contentPadding: const EdgeInsets.symmetric(horizontal: 13, vertical: 14),
          enabledBorder: border(wrong ? T.bad : T.line, wrong ? 1.5 : 1),
          focusedBorder: border(wrong ? T.bad : T.brand500, 1.5),
          disabledBorder: border(T.line),
        ),
      ),
      if (wrong) ...[
        const SizedBox(height: 5),
        Text(error!, style: T.caption(color: T.badInk).copyWith(fontWeight: FontWeight.w500)),
      ],
    ]);
  }
}

/* ------------------------------------------------------------------ sheets */

/// A bottom sheet: handle, Sora title, an explanation that says what the
/// action will do, and the decision at the foot of it.
Future<T2?> sheet<T2>(
  BuildContext context, {
  required String title,
  String? explain,
  required Widget Function(BuildContext) body,
}) =>
    showModalBottomSheet<T2>(
      context: context,
      backgroundColor: T.card,
      isScrollControlled: true,
      barrierColor: const Color(0x6B191A5C),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(T.rSheet)),
      ),
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(
            T.gutter, 10, T.gutter, MediaQuery.of(ctx).viewInsets.bottom + 24),
        /*
         * Scrollable, and capped at most of the screen. A sheet with a remark
         * field in it is taller than a small handset once the keyboard is up,
         * and at 200% system font it is taller than any of them.
         */
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.of(ctx).size.height * 0.86),
          child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Center(
            child: Container(
              width: 38,
              height: 4,
              decoration: BoxDecoration(color: T.line400, borderRadius: BorderRadius.circular(T.rPill)),
            ),
          ),
          const SizedBox(height: 13),
          Text(title, style: T.section().copyWith(fontSize: 17)),
          if (explain != null) ...[
            const SizedBox(height: 8),
            Text(explain, style: T.secondaryText().copyWith(fontSize: 13)),
          ],
              const SizedBox(height: 13),
              body(ctx),
            ]),
          ),
        ),
      ),
    );

/* -------------------------------------------------------------- the app bar */

/// The navy bar every screen wears, with up to two trailing controls and an
/// optional row of status pills beneath the title.
class Bar extends StatelessWidget {
  const Bar({
    super.key,
    required this.title,
    this.subtitle,
    this.onBack,
    this.onMenu,
    this.actions = const [],
    this.pills = const [],
    this.titleStyle,
  });

  final String title;
  final String? subtitle;
  final VoidCallback? onBack;
  final VoidCallback? onMenu;
  final List<Widget> actions;
  final List<Widget> pills;
  final TextStyle? titleStyle;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: T.navy950,
      padding: EdgeInsets.fromLTRB(
          T.gutter, MediaQuery.of(context).padding.top + 10, T.gutter, pills.isEmpty ? 14 : 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          if (onBack != null) ...[
            BarButton(icon: Icons.chevron_left_rounded, label: 'Back', onTap: onBack!),
            const SizedBox(width: 10),
          ] else if (onMenu != null) ...[
            BarButton(icon: Icons.menu_rounded, label: 'Open menu', onTap: onMenu!),
            const SizedBox(width: 12),
          ],
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title,
                  style: titleStyle ?? T.barTitle(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
              if (subtitle != null)
                Padding(
                  padding: const EdgeInsets.only(top: 1),
                  child: Text(subtitle!,
                      style: T.num(11.5, color: T.onNavySecondary, weight: FontWeight.w500),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis),
                ),
            ]),
          ),
          for (final a in actions) ...[const SizedBox(width: 8), a],
        ]),
        if (pills.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Wrap(spacing: 6, runSpacing: 6, children: pills),
          ),
      ]),
    );
  }
}

/// A 40dp translucent square in the app bar, inside a 48dp target.
class BarButton extends StatelessWidget {
  const BarButton({
    super.key,
    required this.icon,
    required this.label,
    required this.onTap,
    this.dot = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  /// An amber dot, for a filter that is applied.
  final bool dot;

  @override
  Widget build(BuildContext context) => Tooltip(
        message: label,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(10),
          child: SizedBox(
            width: T.target,
            height: T.target,
            child: Center(
              child: Container(
                width: 40,
                height: 40,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.10),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Stack(clipBehavior: Clip.none, children: [
                  Center(child: Icon(icon, size: 20, color: Colors.white)),
                  if (dot)
                    Positioned(
                      top: 4,
                      right: 4,
                      child: Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(color: T.warn, shape: BoxShape.circle),
                      ),
                    ),
                ]),
              ),
            ),
          ),
        ),
      );
}

/* ------------------------------------------------------- the action bar */

/// The bar pinned to the foot of a detail screen. One primary action, and at
/// most one refusal beside it — and the refusal is the narrower of the two.
class ActionBar extends StatelessWidget {
  const ActionBar({super.key, required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
        padding: EdgeInsets.fromLTRB(
            T.gutter, 12, T.gutter, MediaQuery.of(context).padding.bottom + 12),
        decoration: const BoxDecoration(
          color: T.card,
          border: Border(top: BorderSide(color: T.line)),
          boxShadow: T.actionBar,
        ),
        child: Row(children: children),
      );
}

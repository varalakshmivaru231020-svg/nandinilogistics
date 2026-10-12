import 'package:flutter_test/flutter_test.dart';
import 'package:nninfra/modules.dart';

import 'support.dart';

void main() {
  group('who may do what', () {
    test('holds a code it was given, and not one it was not', () {
      final s = sessionWith(['material.indent.view']);
      expect(s.can('material.indent.view'), isTrue);
      expect(s.can('material.indent.approvePm'), isFalse);
    });

    /*
     * The trap the build brief warns about. A super admin's permission array is
     * whatever their roles resolve to: the seeded Owner arrives with 560 codes,
     * one created with no role arrives with none and may still do everything.
     * An app that tests `code in permissions` is right for the first and shows
     * an empty application to the second.
     */
    test('a super admin with no roles at all may still do everything', () {
      final owner = sessionWith(const [], superAdmin: true);
      expect(owner.permissions, isEmpty);
      expect(owner.can('material.indent.approveAdmin'), isTrue);
      expect(owner.can('anything.at.all'), isTrue);
    });

    test('and the application is not empty for them', () {
      final owner = sessionWith(const [], superAdmin: true);
      final sections = visibleNavigation(owner.can);
      expect(sections, isNotEmpty);
      expect(
        sections.expand((s) => s.modules).length,
        navigation.expand((s) => s.modules).length,
      );
    });
  });

  group('the navigation is built from what they may open', () {
    test('leaves out a module whose permission they lack', () {
      final sections = visibleNavigation(sessionWith(['material.indent.view']).can);
      final labels = sections.expand((s) => s.modules).map((m) => m.label);
      expect(labels, contains('Indents'));
      expect(labels, isNot(contains('Purchase Orders')));
    });

    /* A heading with nothing under it is a promise the app cannot keep. */
    test('drops a section that has nothing left in it', () {
      final sections = visibleNavigation(sessionWith(['material.indent.view']).can);
      expect(sections.map((s) => s.label), ['Procurement']);
    });

    test('is empty for somebody who has been given nothing', () {
      expect(visibleNavigation(sessionWith(const []).can), isEmpty);
    });

    test('keeps the web\'s own order', () {
      final sections = visibleNavigation(sessionWith(const [], superAdmin: true).can);
      expect(sections.map((s) => s.label),
          ['Overview', 'Execution', 'Procurement', 'Sales', 'Workforce']);
    });

    /*
     * Every module either reads a list or is a screen of its own. One that is
     * neither would be a dead tile in the drawer.
     */
    test('gives every module somewhere to go', () {
      for (final m in navigation.expand((s) => s.modules)) {
        expect(m.list != null || m.route != null, isTrue, reason: m.label);
      }
    });
  });
}

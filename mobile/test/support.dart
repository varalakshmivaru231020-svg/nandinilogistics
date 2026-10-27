import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:nninfra/core/api.dart';
import 'package:nninfra/core/session.dart';
import 'package:shared_preferences/shared_preferences.dart';

class Fail {
  const Fail(this.status, this.error, [this.code]);
  final int status;
  final String error;
  final String? code;
}

/// A boundary that answers from a script and records what was asked of it.
///
/// It records the body of every POST, which is the whole point: the thing that
/// was missing from the first attempt was any action at all, so the tests have
/// to be able to say "this button called that action with these arguments".
class Boundary {
  Boundary(this.routes);

  final Map<String, Object> routes;
  final List<({String path, Map<String, dynamic>? body})> calls = [];

  /// Every GET, with the query it carried — which is how a test checks that a
  /// filter, a search and a page travelled together.
  final List<String> gets = [];

  /// A long timeout on purpose.
  ///
  /// `pumpAndSettle` advances a fake clock, so a short timeout fires before the
  /// mock's own response microtask runs and every call looks unreachable. The
  /// timeout has its own test, with its own clock.
  Api get api => Api(baseUrl: 'http://test', client: client, timeout: const Duration(hours: 1));

  /// Every POST to /do/..., in order, as (action, args).
  List<({String action, List<Object?> args})> get actions => calls
      .where((c) => c.path.startsWith('/do/'))
      .map((c) => (
            action: c.path.substring('/do/'.length),
            args: ((c.body?['args'] as List?) ?? const []).cast<Object?>(),
          ))
      .toList();

  /// Every multipart request, as (the part names, the file names) — which is
  /// how a test checks that a chosen file went up as a part rather than as a
  /// value in the body.
  final List<({List<String> fields, List<String> files, List<Object?> args})> multipart = [];

  /// Every file fetched through the web's own routes, by path.
  final List<String> fetched = [];

  MockClient get client => MockClient((request) async {
        // A stored file is read through the web's own route, not the boundary.
        if (!request.url.path.startsWith('/api/mobile/v1')) {
          fetched.add(request.url.hasQuery
              ? '${request.url.path}?${request.url.query}'
              : request.url.path);
          // A real 1×1 PNG: `Image.memory` decodes what it is given, and a
          // handful of made-up bytes fails the test rather than the code.
          return http.Response.bytes(onePixelPng, 200, headers: {'content-type': 'image/png'});
        }
        /*
         * Decoded, as the boundary decodes it. One action key carries a route
         * folder — `hr/[id]/documents/uploadDocument` — and a bracket
         * travels escaped, so the raw path names no action anybody can read.
         */
        final path =
            Uri.decodeComponent(request.url.path).replaceFirst('/api/mobile/v1', '');
        if (request.method == 'GET') {
          gets.add(request.url.hasQuery ? '$path?${request.url.query}' : path);
        }
        final type = request.headers['content-type'] ?? '';
        /*
         * A multipart body is not JSON. The parts are read off the raw body
         * here rather than parsed properly — enough to say which names went up
         * and which files came with them.
         */
        if (type.startsWith('multipart/form-data')) {
          // Read as bytes: a multipart body carries file bytes, which are not
          // text and must not be decoded as if they were.
          final raw = String.fromCharCodes(request.bodyBytes);
          // The arguments ride along as the `args` part, so what the action is
          // actually being called with can be asserted on a multipart call too.
          final argsPart = RegExp(r'name="args"\r\n\r\n(.*?)\r\n--', dotAll: true)
              .firstMatch(raw)
              ?.group(1);
          multipart.add((
            fields: [
              for (final m in RegExp(r'name="([^"]+)"').allMatches(raw)) m.group(1)!,
            ],
            files: [
              for (final m in RegExp(r'filename="([^"]+)"').allMatches(raw)) m.group(1)!,
            ],
            args: argsPart == null
                ? const []
                : (jsonDecode(argsPart) as List).cast<Object?>(),
          ));
        }
        Map<String, dynamic>? body;
        // A multipart body is bytes, not text: reading it as a string throws,
        // and that is what made the first multipart test look like a server
        // fault rather than a test one.
        if (!type.startsWith('multipart/form-data') && request.bodyBytes.isNotEmpty) {
          try {
            body = jsonDecode(utf8.decode(request.bodyBytes)) as Map<String, dynamic>;
          } catch (_) {}
        }
        calls.add((path: path, body: body));

        // A route may be keyed with its query, which is how a test pins down
        // the exact parameters a screen sent — a page, a filter, a search.
        final withQuery = request.url.hasQuery ? '$path?${request.url.query}' : path;
        final match = routes[withQuery] ?? routes[path];
        // Encoded as UTF-8 bytes, exactly as the real boundary answers. A
        // String body goes out as latin-1 here, which cannot carry a ₹ — and
        // that is how the client's own latin-1 bug was found.
        http.Response json(Object body, int status) => http.Response.bytes(
              utf8.encode(jsonEncode(body)),
              status,
              headers: {'content-type': 'application/json'},
            );

        if (match == null) {
          return json({'ok': false, 'error': 'No such thing: \$path', 'code': 'unknown'}, 404);
        }
        if (match is Fail) {
          return json({
            'ok': false,
            'error': match.error,
            if (match.code != null) 'code': match.code,
          }, match.status);
        }
        return json({'ok': true, 'data': match}, 200);
      });
}

/// A 1×1 transparent PNG — the smallest thing a viewer can really show.
final onePixelPng = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/'
  'q842iQAAAABJRU5ErkJggg==',
);

Session sessionWith(List<String> codes, {bool superAdmin = false}) => Session(
      token: 't',
      id: 'u1',
      name: 'Manjunath Gowda',
      email: 'tl@nandini.example',
      isSuperAdmin: superAdmin,
      permissions: codes.toSet(),
      roleNames: const ['Team Leader'],
    );

void useEmptyPrefs() => SharedPreferences.setMockInitialValues({});


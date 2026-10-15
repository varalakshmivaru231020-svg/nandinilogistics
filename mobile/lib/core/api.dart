import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

/// Every answer the boundary gives is one of two shapes, so this is too.
class Res<T> {
  const Res.ok(this.data) : error = null, code = null, status = 200;
  const Res.fail(this.status, this.error, this.code) : data = null;

  final T? data;
  final String? error;
  final String? code;
  final int status;

  bool get ok => error == null;

  /// The session is gone or was revoked — the only case that re-authenticates.
  bool get needsSignIn => status == 401;

  /// Signed in and not allowed. Never a reason to ask for the password again.
  bool get refused => status == 403;

  /// Never reached, so nothing was decided either way.
  bool get unreachable => status == 0;
}

/// The boundary at /api/mobile/v1.
///
/// One client, because every call shares the same four things: the bearer
/// token, the chosen project, a timeout, and the envelope.
class Api {
  Api({required this.baseUrl, http.Client? client, this.timeout = const Duration(seconds: 15)})
      : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  /// There has to be one. Android's own connect timeout on an unreachable host
  /// is minutes long, and a button that turns for two minutes and then says
  /// nothing is indistinguishable from an app that is broken.
  final Duration timeout;

  String? token;
  String? projectId;

  String get authority => Uri.parse(baseUrl).authority;

  Map<String, String> get _headers => {
        'accept': 'application/json',
        if (token != null) 'authorization': 'Bearer $token',
        // A view filter, never an access decision: the server drops a project
        // the holder cannot reach rather than refusing the request.
        if (projectId != null) 'x-project': projectId!,
      };

  Uri _url(String path, [Map<String, String>? query]) =>
      Uri.parse('$baseUrl/api/mobile/v1$path').replace(
        queryParameters: (query == null || query.isEmpty) ? null : query,
      );

  Future<Res<Map<String, dynamic>>> get(String path, {Map<String, String>? query}) =>
      _send(() => _client.get(_url(path, query), headers: _headers));

  Future<Res<Map<String, dynamic>>> post(String path, {Object? body}) => _send(
        () => _client.post(
          _url(path),
          headers: {..._headers, 'content-type': 'application/json'},
          body: jsonEncode(body ?? const {}),
        ),
      );

  /// Runs one of the web's own server actions. Arguments are positional, in the
  /// order `/actions` gives them — which is the order the server tells us, not
  /// an order this app decides.
  Future<Res<Map<String, dynamic>>> run(String action, List<Object?> args) =>
      post('/do/$action', body: {'args': args});

  String describeFailure(Object error) {
    if (error is TimeoutException) {
      return 'The server at $authority did not answer within ${timeout.inSeconds} seconds.';
    }
    if (error is SocketException) {
      return 'Could not reach the server at $authority. Check that this phone is '
          'on the same network as it.';
    }
    if (error is HandshakeException) {
      return 'Could not agree a secure connection with $authority.';
    }
    if (error is http.ClientException) {
      return 'The connection to $authority failed: ${error.message}';
    }
    /*
     * Anything else. The type is named because an unexplained failure is the
     * worst kind — the first version of this returned one sentence for every
     * cause, and a bug of mine spent an afternoon looking like a network
     * problem.
     */
    return 'Could not reach the server at $authority (${error.runtimeType}).';
  }

  Future<Res<Map<String, dynamic>>> _send(Future<http.Response> Function() request) async {
    http.Response res;
    try {
      res = await request().timeout(timeout);
    } catch (error) {
      return Res.fail(0, describeFailure(error), 'unreachable');
    }

    Map<String, dynamic> body;
    try {
      /*
       * Decoded as UTF-8 from the bytes, not through `res.body`.
       *
       * `res.body` honours the charset in the content-type and falls back to
       * **latin-1** when there is none. The boundary answers
       * `application/json` with no charset, so every ₹, every — and every
       * name with a diacritic in it would come back mangled. JSON is UTF-8 by
       * specification; this reads it that way whatever the header says.
       */
      body = jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>;
    } catch (_) {
      return Res.fail(res.statusCode, 'The server sent something unreadable.', null);
    }

    if (body['ok'] == true) {
      final data = body['data'];
      return Res.ok(data is Map<String, dynamic> ? data : <String, dynamic>{'value': data});
    }
    return Res.fail(
      res.statusCode,
      (body['error'] as String?) ?? 'That did not work.',
      body['code'] as String?,
    );
  }
}

/// One list, as the boundary returns it: the screen's own query, its columns
/// and what its filters amount to in words.
class ListPage {
  const ListPage({
    required this.title,
    required this.filters,
    required this.columns,
    required this.rows,
    required this.summary,
    required this.serverTime,
    this.total = 0,
    this.page,
    this.hasMore = false,
  });

  final String title;
  final String filters;
  final List<Map<String, dynamic>> columns;
  final List<Map<String, dynamic>> rows;
  final List<Map<String, dynamic>> summary;

  /// The instant the server measured against. The handset's clock is not
  /// evidence — a phone an hour fast must not disagree about what is overdue.
  final int serverTime;

  /// How many rows match, which is more than came back when a page was asked
  /// for.
  final int total;

  /// The page these rows are, where one was asked for.
  final int? page;

  /// Whether there is another page behind this one.
  final bool hasMore;

  static ListPage from(Map<String, dynamic> d) => ListPage(
        title: (d['title'] as String?) ?? '',
        filters: (d['filters'] as String?) ?? '',
        columns: ((d['columns'] as List?) ?? const []).cast<Map<String, dynamic>>(),
        rows: ((d['rows'] as List?) ?? const []).cast<Map<String, dynamic>>(),
        summary: ((d['summary'] as List?) ?? const []).cast<Map<String, dynamic>>(),
        total: (d['total'] as num?)?.toInt() ?? ((d['rows'] as List?) ?? const []).length,
        page: (d['page'] as num?)?.toInt(),
        hasMore: d['hasMore'] == true,
        serverTime:
            DateTime.tryParse((d['serverTime'] as String?) ?? '')?.millisecondsSinceEpoch ??
                DateTime.now().millisecondsSinceEpoch,
      );
}

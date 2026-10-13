import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

/// Every answer the boundary gives is one of two shapes, so this is too.
///
/// `code` is what the app acts on, not the message: a 403 carrying
/// `admin.mobile.use` means stop asking, and a 401 means sign in again. The
/// `error` string is written for the person using the app — it is shown
/// verbatim and never replaced with wording of our own.
class ApiResult<T> {
  const ApiResult.ok(this.data)
      : error = null,
        code = null,
        status = 200;
  const ApiResult.fail(this.status, this.error, this.code) : data = null;

  final T? data;
  final String? error;
  final String? code;
  final int status;

  bool get ok => error == null;

  /// The session is gone or was revoked — the only case that re-authenticates.
  bool get needsSignIn => status == 401;

  /// The server was never reached, so nothing was decided either way.
  bool get unreachable => status == 0;

  /// Signed in and not allowed. Never a reason to ask for the password again.
  bool get refused => status == 403;
}

/// The boundary at /api/mobile/v1.
///
/// One client, because every call shares the same three things: the bearer
/// token, the chosen project, and the envelope. Nothing above this layer builds
/// a URL or reads a status code.
class Api {
  Api({required this.baseUrl, http.Client? client, this.timeout = const Duration(seconds: 15)})
      : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

  /// How long to wait before saying so.
  ///
  /// There has to be one. Android's own connect timeout on an unreachable host
  /// is minutes long, and a sign-in button that spins for two minutes and then
  /// says nothing is indistinguishable from an app that is broken — which is
  /// exactly how it was first reported.
  final Duration timeout;

  String? token;
  String? projectId;

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

  Future<ApiResult<Map<String, dynamic>>> get(
    String path, {
    Map<String, String>? query,
  }) =>
      _send(() => _client.get(_url(path, query), headers: _headers));

  Future<ApiResult<Map<String, dynamic>>> post(
    String path, {
    Object? body,
  }) =>
      _send(() => _client.post(
            _url(path),
            headers: {..._headers, 'content-type': 'application/json'},
            body: jsonEncode(body ?? const {}),
          ));

  /// Runs one of the web's own server actions. Arguments are positional, in the
  /// order `/actions` gives them.
  Future<ApiResult<Map<String, dynamic>>> run(String action, List<Object?> args) =>
      post('/do/$action', body: {'args': args});

  /// Where the app is pointing, for a message that has to be acted on.
  ///
  /// Baked in at build time, so when it is wrong there is nothing in the app to
  /// change and no way to tell from the outside. Saying it is the difference
  /// between "it does not work" and "it is looking at the wrong machine".
  String get host => Uri.parse(baseUrl).host.isEmpty ? baseUrl : Uri.parse(baseUrl).authority;

  /// Why a request never got an answer, in words the person can act on.
  String describeFailure(Object error) {
    if (error is TimeoutException) {
      return 'The server at $host did not answer within ${timeout.inSeconds} seconds.';
    }
    if (error is SocketException) {
      // The common one on a handset: right app, wrong network.
      return 'Could not reach the server at $host. Check that this phone is on '
          'the same network as it.';
    }
    if (error is HandshakeException) {
      return 'Could not agree a secure connection with $host.';
    }
    if (error is http.ClientException) {
      return 'The connection to $host failed: ${error.message}';
    }
    return 'Could not reach the server at $host.';
  }

  Future<ApiResult<Map<String, dynamic>>> _send(
    Future<http.Response> Function() request,
  ) async {
    http.Response res;
    try {
      res = await request().timeout(timeout);
    } catch (error) {
      /*
       * Never reached, so nothing was decided — not a refusal, and not a reason
       * to sign anybody out. It used to answer "this will be sent when you are
       * back online", which was a promise the app could not keep: there is no
       * outbox yet, and it hid every cause behind one sentence.
       */
      return ApiResult.fail(0, describeFailure(error), 'unreachable');
    }

    Map<String, dynamic> body;
    try {
      body = jsonDecode(res.body) as Map<String, dynamic>;
    } catch (_) {
      return ApiResult.fail(res.status, 'The server sent something unreadable.', null);
    }

    if (body['ok'] == true) {
      final data = body['data'];
      return ApiResult.ok(data is Map<String, dynamic> ? data : <String, dynamic>{'value': data});
    }
    return ApiResult.fail(
      res.status,
      (body['error'] as String?) ?? 'That did not work.',
      body['code'] as String?,
    );
  }
}

extension on http.Response {
  int get status => statusCode;
}

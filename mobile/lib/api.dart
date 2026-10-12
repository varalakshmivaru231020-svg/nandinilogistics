import 'dart:convert';

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

  /// Signed in and not allowed. Never a reason to ask for the password again.
  bool get refused => status == 403;
}

/// The boundary at /api/mobile/v1.
///
/// One client, because every call shares the same three things: the bearer
/// token, the chosen project, and the envelope. Nothing above this layer builds
/// a URL or reads a status code.
class Api {
  Api({required this.baseUrl, http.Client? client})
      : _client = client ?? http.Client();

  final String baseUrl;
  final http.Client _client;

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

  Future<ApiResult<Map<String, dynamic>>> _send(
    Future<http.Response> Function() request,
  ) async {
    http.Response res;
    try {
      res = await request();
    } catch (_) {
      // Offline, or the server is unreachable. Not a refusal, and not a reason
      // to sign anybody out.
      return const ApiResult.fail(0, 'No connection. This will be sent when you are back online.', 'offline');
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

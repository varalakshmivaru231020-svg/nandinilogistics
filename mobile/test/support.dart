import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:nninfra/api.dart';
import 'package:nninfra/session.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// A boundary that answers from a script, so a screen can be driven without a
/// server. The routes are the real ones; the shapes are the real shapes.
class FakeBoundary {
  FakeBoundary(this.routes);

  /// path (without /api/mobile/v1) → either a data map, or a failure.
  final Map<String, Object> routes;

  final List<Uri> seen = [];

  Api get api => Api(baseUrl: 'http://test', client: client);

  MockClient get client => MockClient((request) async {
        seen.add(request.url);
        final path = request.url.path.replaceFirst('/api/mobile/v1', '');
        final match = routes[path];

        if (match == null) {
          return http.Response(
            jsonEncode({'ok': false, 'error': 'No such list: $path', 'code': 'unknown-list'}),
            404,
          );
        }
        if (match is Failure) {
          return http.Response(
            jsonEncode({'ok': false, 'error': match.error, 'code': match.code}),
            match.status,
          );
        }
        return http.Response(jsonEncode({'ok': true, 'data': match}), 200);
      });
}

class Failure {
  const Failure(this.status, this.error, [this.code]);
  final int status;
  final String error;
  final String? code;
}

/// A session with exactly the codes a test needs, and nothing else.
Session sessionWith(List<String> codes, {bool superAdmin = false}) => Session(
      token: 't',
      id: 'u1',
      name: 'Vikas Verma',
      email: 'pm@nninfra.example',
      isSuperAdmin: superAdmin,
      permissions: codes.toSet(),
      projects: const [Project(id: 'p1', code: 'NNR', name: 'NN Residency')],
    );

void useEmptyPrefs() => SharedPreferences.setMockInitialValues({});

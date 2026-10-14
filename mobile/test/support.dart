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

  MockClient get client => MockClient((request) async {
        final path = request.url.path.replaceFirst('/api/mobile/v1', '');
        Map<String, dynamic>? body;
        if (request.body.isNotEmpty) {
          try {
            body = jsonDecode(request.body) as Map<String, dynamic>;
          } catch (_) {}
        }
        calls.add((path: path, body: body));

        final match = routes[path];
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

Session sessionWith(List<String> codes, {bool superAdmin = false}) => Session(
      token: 't',
      id: 'u1',
      name: 'Anil Deshpande',
      email: 'pm@nninfra.example',
      isSuperAdmin: superAdmin,
      permissions: codes.toSet(),
      roleNames: const ['Project Manager'],
      projects: const [Project(id: 'p1', code: 'NNR', name: 'NN Residency')],
    );

void useEmptyPrefs() => SharedPreferences.setMockInitialValues({});

/// An approvals row, with the decision instruction the server sends.
Map<String, dynamic> approvalRow({
  String kind = 'Indent',
  String reference = 'IND/NNS/2026-27/9001',
  bool canDecide = true,
  Map<String, dynamic>? decide = const {
    'approve': 'material/indents/approveIndent',
    'approveArgs': ['i1', 'PM'],
    'reject': 'material/indents/rejectIndent',
    'rejectArgs': ['i1'],
    'remarkRequired': false,
  },
  num? value = 595000,
  String waiting = '32 days',
  String waitingOn = 'Project Manager',
}) =>
    {
      'id': 'i1',
      'kind': kind,
      'reference': reference,
      'title': 'OPC 53 Grade Cement',
      'raisedBy': 'Ravi Shankar',
      'project': 'NN Skyline',
      'waiting': waiting,
      'waitingOn': waitingOn,
      'value': value,
      'yours': canDecide ? 'Yes' : 'No',
      'canDecide': canDecide,
      'decide': decide,
    };

Map<String, Object> approvalsList(List<Map<String, dynamic>> rows) => {
      '/list/approvals': {
        'title': 'Approvals',
        'filters': 'Everything waiting on a decision, oldest first',
        'columns': const [
          {'key': 'reference', 'header': 'Reference'},
          {'key': 'kind', 'header': 'Kind'},
        ],
        'rows': rows,
        'summary': const [],
        'total': rows.length,
        'serverTime': '2026-10-14T06:00:00.000Z',
      },
    };

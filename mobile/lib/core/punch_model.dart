import 'package:flutter/foundation.dart';

import 'api.dart';
import 'where.dart';

/// Today's punch, shared by the home header, the attendance card and the
/// attendance screen, so the button in the bar and the card under it never
/// disagree. The position is read at the moment of punching — never cached.
class PunchModel extends ChangeNotifier {
  PunchModel(this.api);

  final Api api;

  bool loading = true;
  bool busy = false;
  String? loadError;
  String? error;
  String? done;
  Map<String, dynamic>? today;

  bool get punchedIn => today?['punchInAt'] != null;
  bool get punchedOut => today?['punchOutAt'] != null;

  /// What the one button in the header should do: "Punch In", "Punch Out",
  /// or nothing once the day is done.
  String? get buttonLabel => !punchedIn ? 'Punch In' : (!punchedOut ? 'Punch Out' : null);

  Future<void> load() async {
    loading = today == null;
    loadError = null;
    notifyListeners();
    final res = await api.get('/attendance/me');
    loading = false;
    if (!res.ok) {
      loadError = res.missing ? notOnServer : res.error;
    } else {
      today = res.data!['today'] as Map<String, dynamic>?;
    }
    notifyListeners();
  }

  /// Punches in when not yet in, out when in.
  Future<void> punch() async {
    final punchIn = !punchedIn;
    busy = true;
    error = null;
    done = null;
    notifyListeners();
    final where = Where.live;
    final at = await where.position();
    if (at == null) {
      busy = false;
      error = where.problem ?? 'Your location could not be read.';
      notifyListeners();
      return;
    }
    final res = await api.run(punchIn ? 'hr/punchIn' : 'hr/punchOut', [at.lat, at.lng]);
    busy = false;
    if (!res.ok) {
      error = res.missing ? notOnServer : res.error;
      notifyListeners();
      return;
    }
    done = punchIn ? 'Punched in.' : 'Punched out. See you tomorrow.';
    await load();
  }
}

/// "09:15 AM" in the phone's own time.
String clock12(Object? iso) {
  final d = DateTime.tryParse('${iso ?? ""}')?.toLocal();
  if (d == null) return '—';
  final h = d.hour % 12 == 0 ? 12 : d.hour % 12;
  final suffix = d.hour < 12 ? 'AM' : 'PM';
  return '${h.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')} $suffix';
}

/// Good Morning / Afternoon / Evening, by the phone's clock.
String greetingFor(DateTime now) {
  if (now.hour < 12) return 'Good Morning';
  if (now.hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

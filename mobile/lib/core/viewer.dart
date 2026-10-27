import 'dart:io';

import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

/// Opening a stored file with whatever the phone reads it with.
///
/// An offer letter is a PDF, a licence is sometimes a photograph and
/// sometimes a scan, and an Aadhaar copy is either. The app showed a picture
/// and said of everything else that it "opens on the web" — which is true of a
/// browser and false of a phone, where there is a PDF reader behind an intent.
///
/// Behind a seam, like the camera and the phone's position: a widget test has
/// no viewer to hand a file to, and a screen that called the plugin directly
/// could not be driven in one.
abstract class Viewer {
  /// Hands these bytes to the phone. Returns null when something opened them,
  /// or a sentence saying why nothing did.
  Future<String?> open({required String name, required List<int> bytes, String? mime});

  static Viewer live = _Phone();
}

class _Phone implements Viewer {
  @override
  Future<String?> open({required String name, required List<int> bytes, String? mime}) async {
    try {
      /*
       * Written to the cache rather than anywhere durable: the file came from
       * the server and belongs there, and a phone that is wiped loses nothing
       * of its own. The name is kept so the viewer's title bar reads as the
       * record does, with anything a path could misread taken out of it.
       */
      final dir = await getTemporaryDirectory();
      final safe = name.replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_');
      final file = File('${dir.path}/${safe.isEmpty ? 'document' : safe}');
      await file.writeAsBytes(bytes, flush: true);

      final opened = await OpenFilex.open(file.path, type: (mime?.isEmpty ?? true) ? null : mime);
      switch (opened.type) {
        case ResultType.done:
          return null;
        case ResultType.noAppToOpen:
          return 'No app on this phone opens ${mime ?? "this kind of"} file. '
              'It is stored on the record and opens on the web.';
        case ResultType.permissionDenied:
          return 'Android refused this app permission to open the file.';
        case ResultType.fileNotFound:
          return 'The file could not be written to this phone.';
        case ResultType.error:
          return opened.message.isEmpty ? 'The file could not be opened.' : opened.message;
      }
    } catch (e) {
      return 'The file could not be opened on this phone.';
    }
  }
}

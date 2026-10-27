import 'dart:io';

import 'package:flutter/services.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// Handing something to another app — the ID card as a picture, a referral
/// code as text. Behind a seam like the dialler, so a widget test can watch it.
abstract class Sharer {
  /// Returns null when the share sheet opened, or why it did not.
  Future<String?> text(String text, {String? subject});

  Future<String?> image(List<int> png, {required String name, String? text});

  static Sharer live = _Phone();
}

class _Phone implements Sharer {
  @override
  Future<String?> text(String text, {String? subject}) async {
    try {
      await SharePlus.instance.share(ShareParams(text: text, subject: subject));
      return null;
    } catch (_) {
      // No share sheet: the clipboard is the next best thing.
      await Clipboard.setData(ClipboardData(text: text));
      return 'Copied to the clipboard.';
    }
  }

  @override
  Future<String?> image(List<int> png, {required String name, String? text}) async {
    try {
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/$name');
      await file.writeAsBytes(png, flush: true);
      await SharePlus.instance.share(
        ShareParams(files: [XFile(file.path, mimeType: 'image/png')], text: text),
      );
      return null;
    } catch (e) {
      return 'The card could not be shared from this phone.';
    }
  }
}

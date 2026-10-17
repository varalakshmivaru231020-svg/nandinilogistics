import 'package:url_launcher/url_launcher.dart';

/// Ringing somebody, or opening a chat with them.
///
/// The one thing a handset can do that a desk cannot, and the whole job of
/// whoever carries the lead list around. Behind a seam like the camera and the
/// viewer, so a widget test can watch it without a dialler.
abstract class Dial {
  /// The phone's dialler, with the number already in it.
  Future<String?> call(String number);

  /// WhatsApp, on a chat with that number.
  Future<String?> chat(String number);

  static Dial live = _Phone();
}

class _Phone implements Dial {
  @override
  Future<String?> call(String number) =>
      _open(Uri(scheme: 'tel', path: _digits(number, keepPlus: true)), 'No dialler answered.');

  /*
   * wa.me takes the number in full, with the country code and nothing else —
   * no plus, no spaces. A number stored as "+91 98765 43210" is "919876543210"
   * to WhatsApp, and one stored without a code is sent as it stands: the app
   * cannot know which country a bare number belongs to, and guessing it would
   * open a chat with a stranger.
   */
  @override
  Future<String?> chat(String number) => _open(
        Uri.parse('https://wa.me/${_digits(number, keepPlus: false)}'),
        'WhatsApp is not installed on this phone.',
      );

  static String _digits(String number, {required bool keepPlus}) {
    final kept = number.replaceAll(RegExp(r'[^\d+]'), '');
    return keepPlus ? kept : kept.replaceAll('+', '');
  }

  static Future<String?> _open(Uri uri, String whenNothingOpens) async {
    try {
      final went = await launchUrl(uri, mode: LaunchMode.externalApplication);
      return went ? null : whenNothingOpens;
    } catch (_) {
      return whenNothingOpens;
    }
  }
}

import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';

import 'api.dart';

/// Choosing a file to attach, or taking the photograph itself.
///
/// Behind a seam, like the phone's position: a widget test has no file chooser
/// and no camera, and a screen that called the plugins directly could not be
/// driven in one.
abstract class Files {
  /// What was chosen, read into memory under the field the action reads.
  Future<List<Upload>> pick(String field);

  /// One picture, taken now. The same field, the same bytes — the server
  /// cannot tell a photograph from a chosen image and does not need to.
  Future<List<Upload>> photo(String field);

  static Files live = _Picker();
}

/// What the server will store — the same list `upload-rules.ts` enforces, so
/// the chooser cannot offer a type the server refuses.
const _extensions = [
  'pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'dwg', 'txt',
];

class _Picker implements Files {
  @override
  Future<List<Upload>> pick(String field) async {
    final chosen = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      withData: true,
      type: FileType.custom,
      allowedExtensions: _extensions,
    );
    if (chosen == null) return const [];
    return [
      for (final f in chosen.files)
        if (f.bytes != null)
          Upload(
            field: field,
            name: f.name,
            bytes: f.bytes!,
            mime: _mime(f.extension),
          ),
    ];
  }

  /*
   * A photograph is stored as the JPEG the camera gives, named by the moment
   * it was taken: a rider uploads several, and "image_picker…jpg" in
   * a list of them says nothing about which is which. The size cap is the
   * server's own — a 12-megapixel original would be refused, and shrinking it
   * here is what the browser's own capture does.
   */
  @override
  Future<List<Upload>> photo(String field) async {
    final shot = await ImagePicker().pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
      maxWidth: 2200,
      maxHeight: 2200,
    );
    if (shot == null) return const [];
    final bytes = await shot.readAsBytes();
    final at = DateTime.now();
    final stamp = '${at.year}${_two(at.month)}${_two(at.day)}'
        '-${_two(at.hour)}${_two(at.minute)}${_two(at.second)}';
    return [Upload(field: field, name: 'photo-$stamp.jpg', bytes: bytes, mime: 'image/jpeg')];
  }

  static String _two(int n) => n.toString().padLeft(2, '0');

  /// The media type, from the extension the chooser reports. The server checks
  /// again regardless — a picker is a convenience, not a guard.
  static String? _mime(String? ext) => switch (ext?.toLowerCase()) {
        'pdf' => 'application/pdf',
        'jpg' || 'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'webp' => 'image/webp',
        'doc' => 'application/msword',
        'docx' =>
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls' => 'application/vnd.ms-excel',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'dwg' => 'image/vnd.dwg',
        'txt' => 'text/plain',
        _ => null,
      };
}

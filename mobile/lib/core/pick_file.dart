import 'package:file_picker/file_picker.dart';

import 'api.dart';

/// Choosing a file to attach.
///
/// Behind a seam, like the phone's position: a widget test has no file chooser,
/// and a screen that called the plugin directly could not be driven in one.
abstract class Files {
  /// What was chosen, read into memory under the field the action reads.
  Future<List<Upload>> pick(String field);

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
